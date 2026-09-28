import "server-only";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { bookings, commissionRules, ownerEarnings, ownerProfiles, payments, payoutTransactions, payouts, properties } from "@/db/schema";
import { nextPayoutNumber } from "@/lib/counters";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { formatINR } from "@/lib/money";
import { computeOwnerEarning } from "./pricing-engine";
import { notify } from "./notifications";

/** Most specific active commission: PROPERTY > CITY > GLOBAL. */
export async function commissionBpsFor(propertyId: string, cityId: string, tx: Tx | typeof db = db) {
  const rows = await tx
    .select()
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.active, true),
        or(
          eq(commissionRules.scope, "GLOBAL"),
          and(eq(commissionRules.scope, "CITY"), eq(commissionRules.scopeId, cityId)),
          and(eq(commissionRules.scope, "PROPERTY"), eq(commissionRules.scopeId, propertyId)),
        ),
      ),
    );
  const rank = { PROPERTY: 3, CITY: 2, GLOBAL: 1 } as Record<string, number>;
  rows.sort((a, b) => (rank[b.scope] ?? 0) - (rank[a.scope] ?? 0));
  return rows[0]?.rateBps ?? 1500;
}

/** Create or recompute the owner's earning for a booking. */
export async function upsertEarning(tx: Tx, bookingId: string, opts: { retainedShareBps?: number; adjustments?: number; penalties?: number; eligibleAt?: Date | null } = {}) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw notFound();
  const [p] = await tx.select().from(properties).where(eq(properties.id, b.propertyId));
  if (!p) throw notFound();
  const [existing] = await tx.select().from(ownerEarnings).where(eq(ownerEarnings.bookingId, bookingId));
  if (existing && ["IN_PAYOUT", "PAID"].includes(existing.status)) return existing;

  const s = await getSettings(["fees.gatewayFeeBorneBy"]);
  let commissionBps = existing?.commissionBps ?? (await commissionBpsFor(p.id, p.cityId, tx));
  if (!existing) {
    const { getActiveBenefits } = await import("./subscriptions");
    const plan = await getActiveBenefits(p.ownerId, "OWNER");
    if (plan?.commissionBps !== undefined && plan.commissionBps < commissionBps) commissionBps = plan.commissionBps;
  }
  const pays = await tx.select({ fee: payments.gatewayFee }).from(payments).where(and(eq(payments.bookingId, b.id), inArray(payments.status, ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"])));
  const gatewayFee = pays.reduce((a, x) => a + x.fee, 0);
  const bd = (b.priceBreakdown ?? {}) as { convenienceFee?: number; convenienceTax?: number };
  const roomRevenue = b.roomCharge + b.extraGuestCharge + b.servicesCharge + b.cleaningFee;
  const calc = computeOwnerEarning({
    roomRevenue,
    taxes: b.taxAmount + (bd.convenienceTax ?? 0),
    grossBookingValue: b.totalAmount - b.securityDeposit,
    couponDiscount: b.couponDiscount,
    promoDiscount: b.promoDiscount,
    couponFundedBy: b.couponFundedBy,
    commissionBps,
    gatewayFee,
    gatewayFeeBorneBy: s["fees.gatewayFeeBorneBy"] as "OWNER" | "PLATFORM",
    retainedShareBps: opts.retainedShareBps ?? 10000,
    adjustments: opts.adjustments ?? existing?.adjustments ?? 0,
    penalties: opts.penalties ?? existing?.penalties ?? 0,
  });
  const values = {
    bookingId,
    ownerId: p.ownerId,
    propertyId: p.id,
    ...calc,
    commissionBps,
    eligibleAt: opts.eligibleAt === undefined ? (existing?.eligibleAt ?? null) : opts.eligibleAt,
    status: (existing?.status ?? "PENDING") as "PENDING" | "ELIGIBLE" | "ON_HOLD",
  };
  if (existing) {
    const [u] = await tx.update(ownerEarnings).set(values).where(eq(ownerEarnings.id, existing.id)).returning();
    return u!;
  }
  const [ins] = await tx.insert(ownerEarnings).values(values).returning();
  return ins!;
}

/** Move PENDING earnings past their eligibility date to ELIGIBLE (run on dashboard load / cron). */
export async function refreshEligibility() {
  await db
    .update(ownerEarnings)
    .set({ status: "ELIGIBLE" })
    .where(and(eq(ownerEarnings.status, "PENDING"), lte(ownerEarnings.eligibleAt, new Date())));
  // Cancelled-with-penalty earnings have no stay to wait for.
  await db.execute(sql`
    UPDATE owner_earnings oe SET status = 'ELIGIBLE', eligible_at = now()
    FROM bookings b WHERE b.id = oe.booking_id AND oe.status = 'PENDING' AND oe.eligible_at IS NULL
      AND b.status IN ('CANCELLED','REFUNDED','PARTIALLY_REFUNDED','NO_SHOW') AND oe.net_payable > 0`);
}

export async function ownerBalance(ownerId: string) {
  await refreshEligibility();
  const rows = await db
    .select({ status: ownerEarnings.status, total: sql<number>`coalesce(sum(${ownerEarnings.netPayable}),0)::int` })
    .from(ownerEarnings)
    .where(eq(ownerEarnings.ownerId, ownerId))
    .groupBy(ownerEarnings.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.total)])) as Record<string, number>;
  return {
    pending: by.PENDING ?? 0,
    eligible: by.ELIGIBLE ?? 0,
    inPayout: by.IN_PAYOUT ?? 0,
    paid: by.PAID ?? 0,
    onHold: by.ON_HOLD ?? 0,
  };
}

/** Bundle all ELIGIBLE earnings of an owner into a payout. */
export async function createPayout(ownerId: string, actor: { id: string; isOwner: boolean }, note?: string) {
  await refreshEligibility();
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, ownerId));
  if (!op) throw notFound("Owner profile not found");
  if (!op.bankVerified && !op.upiId) throw badRequest("Add and verify bank or UPI details before requesting a payout");
  const { "payout.minPayout": min } = await getSettings(["payout.minPayout"]);
  return db.transaction(async (tx) => {
    const eligible = await tx.select().from(ownerEarnings).where(and(eq(ownerEarnings.ownerId, ownerId), eq(ownerEarnings.status, "ELIGIBLE"), isNull(ownerEarnings.payoutId)));
    const amount = eligible.reduce((a, e) => a + e.netPayable, 0);
    if (!eligible.length || amount <= 0) throw badRequest("No eligible earnings to pay out yet");
    if (actor.isOwner && amount < min) throw badRequest(`Minimum payout amount is ${formatINR(min)}`);
    const [po] = await tx
      .insert(payouts)
      .values({
        payoutNumber: await nextPayoutNumber(tx),
        ownerId,
        amount,
        netAmount: amount,
        status: op.payoutHold ? "ON_HOLD" : "PENDING",
        method: op.bankVerified ? "BANK" : "UPI",
        requestedByOwner: actor.isOwner,
        notes: note,
        periodStart: eligible.reduce((m, e) => (e.createdAt < m ? e.createdAt : m), eligible[0]!.createdAt),
        periodEnd: new Date(),
      })
      .returning();
    await tx.update(ownerEarnings).set({ status: "IN_PAYOUT", payoutId: po!.id }).where(inArray(ownerEarnings.id, eligible.map((e) => e.id)));
    await tx.insert(payoutTransactions).values({ payoutId: po!.id, status: po!.status, actorId: actor.id, note: actor.isOwner ? "Requested by owner" : "Created by admin" });
    return po!;
  });
}

const PAYOUT_FLOW: Record<string, string[]> = {
  PENDING: ["APPROVED", "ON_HOLD", "FAILED"],
  ON_HOLD: ["PENDING", "APPROVED", "FAILED"],
  APPROVED: ["PROCESSING", "ON_HOLD", "FAILED"],
  PROCESSING: ["PAID", "FAILED"],
  PAID: ["REVERSED"],
  FAILED: ["PENDING"],
  REVERSED: [],
};

export async function transitionPayout(
  payoutId: string,
  to: "APPROVED" | "ON_HOLD" | "PROCESSING" | "PAID" | "FAILED" | "REVERSED" | "PENDING",
  actorId: string,
  opts: { note?: string; reference?: string; deductions?: number } = {},
) {
  const res = await db.transaction(async (tx) => {
    const [po] = await tx.select().from(payouts).where(eq(payouts.id, payoutId));
    if (!po) throw notFound("Payout not found");
    if (!PAYOUT_FLOW[po.status]?.includes(to)) throw conflict(`Cannot move payout from ${po.status} to ${to}`);
    const deductions = opts.deductions ?? po.deductions;
    if (deductions < 0 || deductions > po.amount) throw badRequest("Invalid deduction");
    const patch: Partial<typeof payouts.$inferInsert> = { status: to, deductions, netAmount: po.amount - deductions };
    if (to === "APPROVED") Object.assign(patch, { approvedBy: actorId, approvedAt: new Date() });
    if (to === "PAID") Object.assign(patch, { paidAt: new Date(), reference: opts.reference ?? po.reference ?? `UTR${Date.now()}` });
    if (opts.note) patch.notes = [po.notes, opts.note].filter(Boolean).join("\n");
    await tx.update(payouts).set(patch).where(eq(payouts.id, po.id));
    if (to === "PAID") await tx.update(ownerEarnings).set({ status: "PAID" }).where(eq(ownerEarnings.payoutId, po.id));
    if (to === "FAILED" || to === "REVERSED") await tx.update(ownerEarnings).set({ status: "ELIGIBLE", payoutId: null }).where(eq(ownerEarnings.payoutId, po.id));
    await tx.insert(payoutTransactions).values({ payoutId: po.id, status: to, note: opts.note, reference: opts.reference, actorId });
    return { ...po, ...patch };
  });
  await notify("payout.updated", { userId: res.ownerId, vars: { payoutNumber: res.payoutNumber, status: to, amount: formatINR(res.netAmount ?? res.amount) } });
  return res;
}

export async function disputePayout(payoutId: string, ownerId: string, note: string) {
  const [po] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!po || po.ownerId !== ownerId) throw notFound("Payout not found");
  await db.update(payouts).set({ disputeNote: note }).where(eq(payouts.id, po.id));
  await db.insert(payoutTransactions).values({ payoutId: po.id, status: po.status, note: `Dispute: ${note}`, actorId: ownerId });
}

export async function listOwnerPayouts(ownerId: string) {
  return db.select().from(payouts).where(eq(payouts.ownerId, ownerId)).orderBy(desc(payouts.createdAt));
}
