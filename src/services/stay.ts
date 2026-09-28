import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  availabilityCalendars,
  bookingBeds,
  bookingGuests,
  bookingModifications,
  bookingServices,
  bookingStatusHistory,
  bookings,
  beds,
  checkIns,
  checkOuts,
  payments,
  paymentTransactions,
  refunds,
  rooms,
  users,
} from "@/db/schema";
import { addDays, nightsBetween, todayIST } from "@/lib/dates";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { last4 } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { applyBps, formatINR } from "@/lib/money";
import { claimInventory, releaseInventory } from "./availability";
import { buildQuote } from "./pricing";
import { createPaymentOrder, processRefund, setStatus } from "./booking";
import { createInvoice } from "./invoice";
import { upsertEarning } from "./settlement";
import { notify } from "./notifications";

type BookingRow = typeof bookings.$inferSelect;

async function load(bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw notFound("Booking not found");
  return b;
}

// ───────────────────────────── check-in ─────────────────────────────

export async function checkIn(
  bookingId: string,
  staffId: string,
  input: {
    idVerified: boolean;
    idDocType?: string | null;
    idNumber?: string | null;
    idFileId?: string | null;
    depositCollected?: number;
    cashCollected?: number;
    assignBedIds?: string[] | null;
    notes?: string | null;
    allowEarly?: boolean;
  },
) {
  const b = await load(bookingId);
  if (!["CONFIRMED", "CHECK_IN_PENDING"].includes(b.status)) throw conflict(`Booking is ${b.status.replace(/_/g, " ").toLowerCase()} and cannot be checked in`);
  const today = todayIST();
  if (b.checkIn > today && !input.allowEarly) throw badRequest(`Check-in date is ${b.checkIn}. Approve an early check-in to proceed.`);
  if (b.checkOut <= today) throw badRequest("This stay has already ended");
  if (!input.idVerified) throw badRequest("Verify the guest's identity before check-in");

  await db.transaction(async (tx) => {
    let bedIds = (await tx.select({ bedId: bookingBeds.bedId }).from(bookingBeds).where(and(eq(bookingBeds.bookingId, b.id), eq(bookingBeds.active, true)))).map((x) => x.bedId);
    if (input.assignBedIds?.length && input.assignBedIds.join() !== bedIds.join()) {
      if (input.assignBedIds.length !== bedIds.length) throw badRequest(`Assign exactly ${bedIds.length} bed(s)`);
      const from = today > b.checkIn ? today : b.checkIn;
      await releaseInventory(tx, b.id, from);
      const targetRoom = (await tx.select({ roomId: beds.roomId }).from(beds).where(eq(beds.id, input.assignBedIds[0]!)))[0]?.roomId;
      if (!targetRoom) throw badRequest("Unknown bed");
      await claimInventory(tx, { bookingId: b.id, roomId: targetRoom, unit: "BED", bedIds: input.assignBedIds, bedsCount: input.assignBedIds.length, checkIn: from, checkOut: b.checkOut, status: "BOOKED" });
      await tx.update(bookingBeds).set({ active: false }).where(eq(bookingBeds.bookingId, b.id));
      await tx.insert(bookingBeds).values(input.assignBedIds.map((bedId) => ({ bookingId: b.id, bedId })));
      if (targetRoom !== b.roomId) await tx.update(bookings).set({ roomId: targetRoom }).where(eq(bookings.id, b.id));
      bedIds = input.assignBedIds;
    }
    const cash = (input.cashCollected ?? 0) + (input.depositCollected ?? 0);
    if (cash > 0) {
      const [p] = await tx.insert(payments).values({ bookingId: b.id, purpose: "BOOKING", provider: "cash", method: "CASH_AT_PROPERTY", amount: cash, status: "CAPTURED", capturedAt: new Date(), providerPaymentId: `CASH-${Date.now()}` }).returning();
      await tx.insert(paymentTransactions).values({ paymentId: p!.id, event: "cash.collected", status: "CAPTURED", amount: cash, raw: { staffId } });
      await tx.update(bookings).set({ paidAmount: sql`${bookings.paidAmount} + ${cash}` }).where(eq(bookings.id, b.id));
      // any pending pay-at-property placeholder is superseded
      await tx.update(payments).set({ status: "CANCELLED" }).where(and(eq(payments.bookingId, b.id), eq(payments.provider, "cash"), eq(payments.status, "PENDING")));
    }
    await tx.insert(checkIns).values({
      bookingId: b.id,
      staffId,
      idVerified: input.idVerified,
      idDocType: input.idDocType ?? null,
      idLast4: input.idNumber ? last4(input.idNumber) : null,
      idFileId: input.idFileId ?? null,
      depositCollected: input.depositCollected ?? 0,
      assignedBeds: bedIds,
      notes: input.notes ?? null,
    });
    await tx.update(beds).set({ status: "OCCUPIED", currentBookingId: b.id, currentCustomerId: b.customerId }).where(inArray(beds.id, bedIds));
    await setStatus(tx, b, "CHECKED_IN", staffId, "Guest checked in");
  });
  await notify("checkin.completed", { userId: b.customerId, vars: { bookingNumber: b.bookingNumber } });
}

// ───────────────────────────── check-out ─────────────────────────────

export async function checkoutPreview(b: BookingRow, input: { damageCharges?: number; extraCharges?: { description: string; amount: number }[] }) {
  const pending = await db.select().from(bookingServices).where(and(eq(bookingServices.bookingId, b.id), eq(bookingServices.settled, false)));
  const extras = (input.extraCharges ?? []).reduce((a, x) => a + x.amount, 0) + pending.reduce((a, x) => a + x.amount, 0);
  const damage = input.damageCharges ?? 0;
  const pol = (b.cancellationPolicy ?? {}) as { earlyCheckoutRefundBps?: number };
  const today = todayIST();
  const unusedNights = b.checkOut > today ? Math.max(0, nightsBetween(today > b.checkIn ? today : b.checkIn, b.checkOut)) : 0;
  const stayPortion = b.totalAmount - b.securityDeposit;
  const perNight = b.nights ? Math.floor((stayPortion - b.convenienceFee) / b.nights) : 0;
  const earlyRefund = unusedNights ? applyBps(perNight * unusedNights, pol.earlyCheckoutRefundBps ?? 0) : 0;
  const depositHeld = Math.min(b.paidAmount, b.securityDeposit);
  const stayPaid = b.paidAmount - depositHeld;
  const stayDue = Math.max(0, stayPortion - stayPaid);
  // Charges are settled from the deposit first; any remainder is refunded, any shortfall is due.
  const net = extras + damage + stayDue - earlyRefund;
  const refundToCustomer = net >= 0 ? Math.max(0, depositHeld - net) : depositHeld - net;
  const amountDue = net >= 0 ? Math.max(0, net - depositHeld) : 0;
  return { extras, damage, stayDue, unusedNights, earlyRefund, depositHeld, depositRefund: refundToCustomer, amountDue };
}

export async function checkOut(
  bookingId: string,
  staffId: string,
  input: { inspection?: Record<string, unknown>; damageCharges?: number; extraCharges?: { description: string; amount: number }[]; notes?: string | null; cashCollected?: number },
) {
  const b = await load(bookingId);
  if (b.status !== "CHECKED_IN") throw conflict("Only checked-in guests can be checked out");
  const calc = await checkoutPreview(b, input);
  const { "payout.settlementDaysAfterCheckout": days } = await getSettings(["payout.settlementDaysAfterCheckout"]);
  const today = todayIST();

  const refundId = await db.transaction(async (tx) => {
    const extras = [...(input.extraCharges ?? [])];
    if (input.damageCharges) extras.push({ description: "Damage charges", amount: input.damageCharges });
    if (extras.length) {
      await tx.insert(bookingServices).values(extras.map((x) => ({ bookingId: b.id, serviceKey: x.description === "Damage charges" ? "DAMAGE" : "EXTRA", description: x.description, amount: x.amount, addedBy: staffId, atCheckout: true })));
    }
    await tx.update(bookingServices).set({ settled: true }).where(eq(bookingServices.bookingId, b.id));
    const cash = input.cashCollected ?? 0;
    if (cash > 0) {
      const [p] = await tx.insert(payments).values({ bookingId: b.id, purpose: "CHECKOUT_DUES", provider: "cash", method: "CASH_AT_PROPERTY", amount: cash, status: "CAPTURED", capturedAt: new Date(), providerPaymentId: `CASH-${Date.now()}` }).returning();
      await tx.insert(paymentTransactions).values({ paymentId: p!.id, event: "cash.collected", status: "CAPTURED", amount: cash, raw: { staffId } });
    }
    const extrasTotal = calc.extras + calc.damage;
    await tx
      .update(bookings)
      .set({
        totalAmount: b.totalAmount + extrasTotal - calc.earlyRefund,
        paidAmount: b.paidAmount + cash,
        servicesCharge: b.servicesCharge + extrasTotal,
        checkOut: b.checkOut > today ? (today > b.checkIn ? today : addDays(b.checkIn, 1)) : b.checkOut,
      })
      .where(eq(bookings.id, b.id));
    if (b.checkOut > today) await releaseInventory(tx, b.id, today > b.checkIn ? today : addDays(b.checkIn, 1));
    await tx.insert(checkOuts).values({
      bookingId: b.id,
      staffId,
      inspection: input.inspection ?? {},
      damageCharges: calc.damage,
      extraCharges: calc.extras,
      depositRefund: calc.depositRefund,
      amountDue: Math.max(0, calc.amountDue - cash),
      notes: input.notes ?? null,
    });
    const bedIds = (await tx.select({ bedId: bookingBeds.bedId }).from(bookingBeds).where(and(eq(bookingBeds.bookingId, b.id), eq(bookingBeds.active, true)))).map((x) => x.bedId);
    if (bedIds.length) await tx.update(beds).set({ status: "CLEANING", currentBookingId: null, currentCustomerId: null }).where(inArray(beds.id, bedIds));
    await tx.update(rooms).set({ cleaningStatus: "NEEDS_CLEANING" }).where(eq(rooms.id, b.roomId));
    const dueLeft = Math.max(0, calc.amountDue - cash);
    await setStatus(tx, b, dueLeft > 0 ? "CHECKED_OUT" : "COMPLETED", staffId, dueLeft > 0 ? `Checked out — ${formatINR(dueLeft)} due` : "Checked out — stay completed", {
      completedAt: dueLeft > 0 ? null : new Date(),
    });
    await upsertEarning(tx, b.id, { adjustments: calc.damage, eligibleAt: new Date(Date.now() + days * 86400_000) });
    if (calc.depositRefund > 0) {
      const [r] = await tx
        .insert(refunds)
        .values({ bookingId: b.id, amount: calc.depositRefund, reason: calc.earlyRefund ? "Security deposit & early check-out refund" : "Security deposit refund", kind: "DEPOSIT", status: "APPROVED", approvedBy: staffId })
        .returning();
      return r!.id;
    }
    return null;
  });
  if (refundId) await processRefund(refundId, staffId);
  await createInvoice(b.id, "FINAL");
  await notify("checkout.completed", { userId: b.customerId, vars: { bookingNumber: b.bookingNumber, depositRefund: formatINR(calc.depositRefund) } });
  return calc;
}

export async function markBedClean(bedId: string) {
  const [bed] = await db.select().from(beds).where(eq(beds.id, bedId));
  if (!bed) throw notFound("Bed not found");
  if (bed.status === "OCCUPIED") throw conflict("Bed is occupied");
  await db.update(beds).set({ status: "AVAILABLE" }).where(eq(beds.id, bedId));
  const others = await db.select({ status: beds.status }).from(beds).where(eq(beds.roomId, bed.roomId));
  if (!others.some((o) => o.status === "CLEANING")) await db.update(rooms).set({ cleaningStatus: "CLEAN" }).where(eq(rooms.id, bed.roomId));
}

export async function setRoomCleaning(roomId: string, status: "CLEAN" | "NEEDS_CLEANING" | "IN_PROGRESS") {
  await db.update(rooms).set({ cleaningStatus: status }).where(eq(rooms.id, roomId));
  if (status === "CLEAN") await db.update(beds).set({ status: "AVAILABLE" }).where(and(eq(beds.roomId, roomId), eq(beds.status, "CLEANING")));
}

// ───────────────────────────── modifications ─────────────────────────────

export type ModificationRequest =
  | { type: "EXTEND_STAY"; newCheckOut: string }
  | { type: "EARLY_CHECK_IN"; time: string }
  | { type: "LATE_CHECK_OUT"; time: string }
  | { type: "ROOM_CHANGE" | "BED_CHANGE" | "UPGRADE_AC" | "UPGRADE_PRIVATE"; targetRoomId: string; unit: "BED" | "ROOM"; bedIds?: string[]; time?: never }
  | { type: "ADD_GUEST"; guest: { name: string; phone?: string; gender?: "MALE" | "FEMALE" | "OTHER"; age?: number; isChild?: boolean } }
  | { type: "REMOVE_GUEST"; guestId: string };

/**
 * Quote & hold what a modification needs. Price differences are computed with the live pricing
 * engine for the affected nights only. Positive diff → collect payment; negative → partial refund.
 */
export async function requestModification(bookingId: string, actor: { id: string; role: "CUSTOMER" | "OWNER" | "ADMIN" }, req: ModificationRequest) {
  const b = await load(bookingId);
  if (actor.role === "CUSTOMER" && b.customerId !== actor.id) throw forbidden();
  if (!["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN"].includes(b.status)) throw conflict("This booking cannot be modified now");
  const open = await db.select().from(bookingModifications).where(and(eq(bookingModifications.bookingId, b.id), inArray(bookingModifications.status, ["REQUESTED", "AWAITING_PAYMENT", "APPROVED"])));
  if (open.length) throw conflict("Another change request for this booking is still pending");

  const s = await getSettings(["booking.extensionNeedsApproval", "booking.modificationNeedsApproval"]);
  const today = todayIST();
  const fromNight = today > b.checkIn ? today : b.checkIn;
  const activeBeds = (await db.select({ bedId: bookingBeds.bedId }).from(bookingBeds).where(and(eq(bookingBeds.bookingId, b.id), eq(bookingBeds.active, true)))).map((x) => x.bedId);
  let priceDiff = 0;
  let needsApproval = actor.role === "CUSTOMER" && s["booking.modificationNeedsApproval"];
  let payload: Record<string, unknown> = { ...req };

  const [mod] = await db.insert(bookingModifications).values({ bookingId: b.id, type: req.type, payload, requestedBy: actor.id }).returning();
  try {
    if (req.type === "EXTEND_STAY") {
      if (req.newCheckOut <= b.checkOut) throw badRequest("New check-out must be after the current check-out");
      needsApproval = actor.role === "CUSTOMER" && s["booking.extensionNeedsApproval"];
      const { quote: q } = await buildQuote({ roomId: b.roomId, unit: b.unit, bedIds: activeBeds, checkIn: b.checkOut, checkOut: req.newCheckOut, adults: b.adults, children: b.children, services: b.selectedServices, customerId: b.customerId });
      // no second convenience fee, cleaning fee or deposit on an extension
      priceDiff = q.taxableAmount - q.cleaningFee + applyBps(q.taxableAmount - q.cleaningFee, q.taxRateBps);
      payload = { ...payload, extraNights: q.nights, quoteLines: q.lines.filter((l) => !["deposit", "convenience", "convenienceTax", "cleaning"].includes(l.key)) };
      await db.transaction((tx) =>
        claimInventory(tx, { bookingId: b.id, roomId: b.roomId, unit: b.unit, bedIds: activeBeds, bedsCount: activeBeds.length, checkIn: b.checkOut, checkOut: req.newCheckOut, status: "HELD", holdExpiresAt: new Date(Date.now() + 24 * 3600_000) }),
      );
    } else if (req.type === "EARLY_CHECK_IN" || req.type === "LATE_CHECK_OUT") {
      const perNight = Math.round((b.roomCharge + b.extraGuestCharge) / Math.max(1, b.nights));
      priceDiff = Math.round(perNight / 2); // half-day charge
      needsApproval = actor.role === "CUSTOMER";
    } else if (req.type === "ADD_GUEST") {
      if (b.unit !== "ROOM") throw badRequest("To add a guest to a bed booking, please book an additional bed");
      const [room] = await db.select().from(rooms).where(eq(rooms.id, b.roomId));
      if (b.adults + b.children + 1 > room!.maxOccupancy) throw badRequest(`Room allows at most ${room!.maxOccupancy} guests`);
      const nightsLeft = nightsBetween(fromNight, b.checkOut);
      const { quote: before } = await buildQuote({ roomId: b.roomId, unit: "ROOM", bedIds: activeBeds, checkIn: fromNight, checkOut: b.checkOut, adults: b.adults, children: b.children, services: b.selectedServices, customerId: b.customerId });
      const { quote: after } = await buildQuote({ roomId: b.roomId, unit: "ROOM", bedIds: activeBeds, checkIn: fromNight, checkOut: b.checkOut, adults: b.adults + (req.guest.isChild ? 0 : 1), children: b.children + (req.guest.isChild ? 1 : 0), services: b.selectedServices, customerId: b.customerId });
      const diff = after.extraGuestCharge + after.foodCharge - before.extraGuestCharge - before.foodCharge;
      priceDiff = diff + applyBps(diff, after.taxRateBps);
      payload = { ...payload, nightsLeft };
    } else if (req.type === "REMOVE_GUEST") {
      const [g] = await db.select().from(bookingGuests).where(and(eq(bookingGuests.id, req.guestId), eq(bookingGuests.bookingId, b.id)));
      if (!g) throw notFound("Guest not found");
      if (g.isPrimary) throw badRequest("The primary guest cannot be removed");
      priceDiff = 0;
    } else if ("targetRoomId" in req) {
      // Room / bed change & upgrades for the remaining nights.
      const [target] = await db.select().from(rooms).where(eq(rooms.id, req.targetRoomId));
      if (!target || target.propertyId !== b.propertyId) throw badRequest("Pick a room in the same property");
      if (req.type === "UPGRADE_AC" && !target.isAC) throw badRequest("Selected room is not an AC room");
      if (req.type === "UPGRADE_PRIVATE" && !(target.category === "PRIVATE" || req.unit === "ROOM")) throw badRequest("Select a private room or book the entire room");
      const bedsNeeded = req.unit === "ROOM" ? target.totalBeds : Math.max(activeBeds.length, 1);
      const newBeds = await db.transaction((tx) =>
        claimInventory(tx, { bookingId: b.id, roomId: target.id, unit: req.unit, bedIds: req.bedIds, bedsCount: bedsNeeded, checkIn: fromNight, checkOut: b.checkOut, status: "HELD", holdExpiresAt: new Date(Date.now() + 24 * 3600_000) }).catch((e) => {
          throw e;
        }),
      );
      const { quote: oldQ } = await buildQuote({ roomId: b.roomId, unit: b.unit, bedIds: activeBeds, checkIn: fromNight, checkOut: b.checkOut, adults: b.adults, children: b.children, services: b.selectedServices, customerId: b.customerId }).catch(() => ({ quote: null }));
      const { quote: newQ } = await buildQuote({ roomId: target.id, unit: req.unit, bedIds: newBeds, checkIn: fromNight, checkOut: b.checkOut, adults: b.adults, children: b.children, services: b.selectedServices, customerId: b.customerId });
      const oldStay = oldQ ? oldQ.taxableAmount + oldQ.taxAmount - oldQ.cleaningFee : 0;
      priceDiff = newQ.taxableAmount + newQ.taxAmount - newQ.cleaningFee - oldStay;
      payload = { ...payload, newBedIds: newBeds, fromNight, newDeposit: newQ.securityDeposit };
    }
  } catch (e) {
    await db.update(bookingModifications).set({ status: "REJECTED", note: e instanceof Error ? e.message : String(e) }).where(eq(bookingModifications.id, mod!.id));
    // release anything held for this modification (held rows on new nights / other rooms)
    await db.delete(availabilityCalendars).where(and(eq(availabilityCalendars.bookingId, b.id), eq(availabilityCalendars.status, "HELD")));
    throw e;
  }

  await db.update(bookingModifications).set({ payload, priceDiff, status: needsApproval ? "REQUESTED" : "APPROVED" }).where(eq(bookingModifications.id, mod!.id));
  if (!needsApproval) return advanceModification(mod!.id, actor.id);
  return { modificationId: mod!.id, status: "REQUESTED" as const, priceDiff };
}

/** Approve (owner/admin) or reject a pending modification. */
export async function decideModification(modId: string, actorId: string, approve: boolean, note?: string) {
  const [m] = await db.select().from(bookingModifications).where(eq(bookingModifications.id, modId));
  if (!m) throw notFound("Request not found");
  if (m.status !== "REQUESTED") throw conflict("Request already decided");
  if (!approve) {
    await db.update(bookingModifications).set({ status: "REJECTED", decidedBy: actorId, decidedAt: new Date(), note }).where(eq(bookingModifications.id, m.id));
    await db.delete(availabilityCalendars).where(and(eq(availabilityCalendars.bookingId, m.bookingId), eq(availabilityCalendars.status, "HELD")));
    const b = await load(m.bookingId);
    await notify("modification.update", { userId: b.customerId, vars: { bookingNumber: b.bookingNumber, status: "rejected", type: m.type.replace(/_/g, " ").toLowerCase() } });
    return { status: "REJECTED" as const };
  }
  await db.update(bookingModifications).set({ status: "APPROVED", decidedBy: actorId, decidedAt: new Date(), note }).where(eq(bookingModifications.id, m.id));
  return advanceModification(m.id, actorId);
}

async function advanceModification(modId: string, actorId: string) {
  const [m] = await db.select().from(bookingModifications).where(eq(bookingModifications.id, modId));
  const b = await load(m!.bookingId);
  if (m!.priceDiff > 0) {
    const [u] = await db.select().from(users).where(eq(users.id, b.customerId));
    const order = await createPaymentOrder(b.id, m!.type === "EXTEND_STAY" ? "EXTENSION" : "MODIFICATION", m!.priceDiff, { name: u!.name, email: u!.email, phone: u!.phone }, m!.id);
    await db.update(bookingModifications).set({ status: "AWAITING_PAYMENT", paymentId: order.paymentId }).where(eq(bookingModifications.id, m!.id));
    await notify("modification.update", { userId: b.customerId, vars: { bookingNumber: b.bookingNumber, status: `approved — please pay ${formatINR(m!.priceDiff)}`, type: m!.type.replace(/_/g, " ").toLowerCase() } });
    return { modificationId: m!.id, status: "AWAITING_PAYMENT" as const, priceDiff: m!.priceDiff, checkout: order.checkout };
  }
  await applyModification(m!.id, actorId);
  return { modificationId: m!.id, status: "APPLIED" as const, priceDiff: m!.priceDiff };
}

/** Apply a paid/approved modification to the booking and inventory. */
export async function applyModification(modId: string, actorId: string | null) {
  const [m] = await db.select().from(bookingModifications).where(eq(bookingModifications.id, modId));
  if (!m || m.status === "APPLIED") return;
  const b = await load(m.bookingId);
  const p = m.payload as Record<string, unknown>;
  let refundId: string | null = null;
  await db.transaction(async (tx) => {
    const diff = m.priceDiff;
    if (m.type === "EXTEND_STAY") {
      const newCheckOut = p.newCheckOut as string;
      await tx.update(availabilityCalendars).set({ status: "BOOKED", holdExpiresAt: null }).where(and(eq(availabilityCalendars.bookingId, b.id), eq(availabilityCalendars.status, "HELD")));
      await tx.update(bookings).set({ checkOut: newCheckOut, nights: nightsBetween(b.checkIn, newCheckOut), roomCharge: b.roomCharge + diff, totalAmount: b.totalAmount + diff }).where(eq(bookings.id, b.id));
      await tx.insert(bookingStatusHistory).values({ bookingId: b.id, fromStatus: b.status, toStatus: b.status, changedBy: actorId, note: `Stay extended to ${newCheckOut}` });
    } else if (m.type === "EARLY_CHECK_IN" || m.type === "LATE_CHECK_OUT") {
      if (diff) await tx.insert(bookingServices).values({ bookingId: b.id, serviceKey: m.type, description: m.type === "EARLY_CHECK_IN" ? `Early check-in (${p.time})` : `Late check-out (${p.time})`, amount: diff, settled: true });
      await tx.update(bookings).set({ totalAmount: b.totalAmount + diff, servicesCharge: b.servicesCharge + diff }).where(eq(bookings.id, b.id));
    } else if (m.type === "ADD_GUEST") {
      const g = p.guest as { name: string; phone?: string; gender?: "MALE" | "FEMALE" | "OTHER"; age?: number; isChild?: boolean };
      await tx.insert(bookingGuests).values({ bookingId: b.id, name: g.name, phone: g.phone ?? null, gender: g.gender ?? null, age: g.age ?? null });
      await tx.update(bookings).set({ adults: b.adults + (g.isChild ? 0 : 1), children: b.children + (g.isChild ? 1 : 0), extraGuestCharge: b.extraGuestCharge + diff, totalAmount: b.totalAmount + diff }).where(eq(bookings.id, b.id));
    } else if (m.type === "REMOVE_GUEST") {
      await tx.delete(bookingGuests).where(eq(bookingGuests.id, p.guestId as string));
      await tx.update(bookings).set({ adults: Math.max(1, b.adults - 1) }).where(eq(bookings.id, b.id));
    } else {
      const fromNight = p.fromNight as string;
      const newBedIds = p.newBedIds as string[];
      const targetRoomId = p.targetRoomId as string;
      // drop old remaining nights, confirm the new ones
      await tx.delete(availabilityCalendars).where(and(eq(availabilityCalendars.bookingId, b.id), eq(availabilityCalendars.status, "BOOKED"), gte(availabilityCalendars.night, fromNight)));
      await tx.update(availabilityCalendars).set({ status: "BOOKED", holdExpiresAt: null }).where(and(eq(availabilityCalendars.bookingId, b.id), eq(availabilityCalendars.status, "HELD")));
      await tx.update(bookingBeds).set({ active: false }).where(eq(bookingBeds.bookingId, b.id));
      await tx.insert(bookingBeds).values(newBedIds.map((bedId) => ({ bookingId: b.id, bedId })));
      if (b.status === "CHECKED_IN") {
        const old = await tx.select({ bedId: bookingBeds.bedId }).from(bookingBeds).where(and(eq(bookingBeds.bookingId, b.id), eq(bookingBeds.active, false)));
        await tx.update(beds).set({ status: "CLEANING", currentBookingId: null, currentCustomerId: null }).where(inArray(beds.id, old.map((o) => o.bedId)));
        await tx.update(beds).set({ status: "OCCUPIED", currentBookingId: b.id, currentCustomerId: b.customerId }).where(inArray(beds.id, newBedIds));
      }
      await tx.update(bookings).set({ roomId: targetRoomId, unit: p.unit as "BED" | "ROOM", bedsCount: newBedIds.length, roomCharge: b.roomCharge + diff, totalAmount: b.totalAmount + diff }).where(eq(bookings.id, b.id));
      if (diff < 0) {
        const [r] = await tx.insert(refunds).values({ bookingId: b.id, amount: -diff, reason: `Price difference for ${m.type.replace(/_/g, " ").toLowerCase()}`, kind: "MODIFICATION", status: "APPROVED", approvedBy: actorId }).returning();
        refundId = r!.id;
      }
    }
    await tx.update(bookingModifications).set({ status: "APPLIED", decidedAt: m.decidedAt ?? new Date() }).where(eq(bookingModifications.id, m.id));
  });
  if (refundId) await processRefund(refundId, actorId);
  await notify(m.type === "EXTEND_STAY" ? "extension.approved" : "modification.update", {
    userId: b.customerId,
    vars: { bookingNumber: b.bookingNumber, status: "applied", type: m.type.replace(/_/g, " ").toLowerCase(), newCheckOut: String(p.newCheckOut ?? "") },
  });
}

