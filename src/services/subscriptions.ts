import "server-only";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { paymentTransactions, payments, properties, subscriptionPlans, subscriptions, users, type PlanBenefits } from "@/db/schema";
import { badRequest, notFound } from "@/lib/errors";
import { getProvider } from "./payments";
import { formatINR } from "@/lib/money";
import { notify } from "./notifications";

/**
 * Subscriptions — plans are created and PRICED by the StayShare admin team.
 *  • CUSTOMER plans (e.g. StayShare Plus): booking discount, waived convenience fee.
 *  • OWNER plans (partner Basic/Pro/Premium): lower commission, featured listing, property limit.
 * A plan activates only after the payment is verified server-side (webhook / verify endpoint).
 */
export type Audience = "CUSTOMER" | "OWNER";

export async function listPlans(audience?: Audience, includeInactive = false) {
  const conds = [];
  if (audience) conds.push(eq(subscriptionPlans.audience, audience));
  if (!includeInactive) conds.push(eq(subscriptionPlans.active, true));
  return db.select().from(subscriptionPlans).where(conds.length ? and(...conds) : undefined).orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.price));
}

export async function getActiveSubscription(userId: string, audience: Audience) {
  const [s] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.audience, audience), eq(subscriptions.status, "ACTIVE"), gt(subscriptions.endsAt, new Date())))
    .orderBy(desc(subscriptions.endsAt))
    .limit(1);
  return s ?? null;
}

export async function getActiveBenefits(userId: string | null, audience: Audience): Promise<(PlanBenefits & { planName: string }) | null> {
  if (!userId) return null;
  const s = await getActiveSubscription(userId, audience);
  return s ? { ...s.planSnapshot.benefits, planName: s.planSnapshot.name } : null;
}

export async function startSubscriptionPurchase(user: { id: string; name: string; email: string | null; phone: string | null; roles: string[] }, planId: string) {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
  if (!plan || !plan.active) throw notFound("Plan not available");
  if (plan.audience === "OWNER" && !user.roles.includes("OWNER")) throw badRequest("Partner plans are only for property partners");
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId: user.id, planId: plan.id, audience: plan.audience, status: "PENDING_PAYMENT", pricePaid: plan.price, planSnapshot: { name: plan.name, benefits: plan.benefits, durationDays: plan.durationDays } })
    .returning();
  if (plan.price === 0) {
    await db.transaction((tx) => activateSubscription(tx, sub!.id, null, 0));
    return { subscriptionId: sub!.id, checkout: null, activated: true };
  }
  const provider = getProvider();
  const [p] = await db.insert(payments).values({ subscriptionId: sub!.id, userId: user.id, purpose: "SUBSCRIPTION", provider: provider.name, amount: plan.price, status: "CREATED" }).returning();
  const order = await provider.createOrder({ amount: plan.price, currency: "INR", receipt: p!.id, notes: { subscriptionId: sub!.id, plan: plan.code }, customer: user });
  await db.update(payments).set({ providerOrderId: order.providerOrderId, status: "PENDING" }).where(eq(payments.id, p!.id));
  await db.update(subscriptions).set({ paymentId: p!.id }).where(eq(subscriptions.id, sub!.id));
  await db.insert(paymentTransactions).values({ paymentId: p!.id, event: "order.created", status: "PENDING", amount: plan.price, raw: { providerOrderId: order.providerOrderId } });
  return { subscriptionId: sub!.id, checkout: order.checkout, activated: false };
}

/** Activate (or stack onto an existing active plan of the same audience). Runs inside the capture transaction. */
export async function activateSubscription(tx: Tx, subscriptionId: string, paymentId: string | null, amount: number, grantedBy?: string) {
  const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!sub) throw notFound("Subscription not found");
  if (sub.status === "ACTIVE") return sub;
  const [current] = await tx
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, sub.userId), eq(subscriptions.audience, sub.audience), eq(subscriptions.status, "ACTIVE"), gt(subscriptions.endsAt, new Date())))
    .orderBy(desc(subscriptions.endsAt))
    .limit(1);
  const start = current?.planId === sub.planId && current.endsAt ? current.endsAt : new Date();
  if (current && current.planId !== sub.planId) {
    // switching plans: the old plan ends now, the new one starts now
    await tx.update(subscriptions).set({ status: "CANCELLED", cancelledAt: new Date() }).where(eq(subscriptions.id, current.id));
  }
  const ends = new Date(start.getTime() + sub.planSnapshot.durationDays * 86400_000);
  const [u] = await tx.update(subscriptions).set({ status: "ACTIVE", startsAt: start, endsAt: ends, paymentId: paymentId ?? sub.paymentId, pricePaid: amount, grantedBy: grantedBy ?? null }).where(eq(subscriptions.id, sub.id)).returning();
  if (sub.audience === "OWNER" && sub.planSnapshot.benefits.featuredListing) {
    await tx.update(properties).set({ isFeatured: true }).where(and(eq(properties.ownerId, sub.userId), eq(properties.approvalStatus, "APPROVED")));
  }
  queueMicrotask(() => {
    void notify("promo.offer", { userId: sub.userId, vars: { title: `${sub.planSnapshot.name} activated`, message: `Your ${sub.planSnapshot.name} plan is active until ${ends.toLocaleDateString("en-IN")}. Paid ${formatINR(amount)}.` } });
  });
  return u!;
}

/** Complimentary plan granted by an admin (e.g. launch partners). */
export async function grantSubscription(adminId: string, userId: string, planId: string) {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
  if (!plan) throw notFound("Plan not found");
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("User not found");
  const [sub] = await db.insert(subscriptions).values({ userId, planId, audience: plan.audience, planSnapshot: { name: plan.name, benefits: plan.benefits, durationDays: plan.durationDays } }).returning();
  return db.transaction((tx) => activateSubscription(tx, sub!.id, null, 0, adminId));
}

export async function cancelSubscription(subscriptionId: string, actor: { id: string; isAdmin: boolean }) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!sub || (!actor.isAdmin && sub.userId !== actor.id)) throw notFound("Subscription not found");
  if (sub.status !== "ACTIVE") throw badRequest("Subscription is not active");
  // Benefits continue until the end date; no auto-renewal. Admin cancellation ends it immediately.
  await db.update(subscriptions).set(actor.isAdmin ? { status: "CANCELLED", cancelledAt: new Date(), endsAt: new Date() } : { cancelledAt: new Date() }).where(eq(subscriptions.id, sub.id));
  if (actor.isAdmin && sub.audience === "OWNER") await db.update(properties).set({ isFeatured: false }).where(eq(properties.ownerId, sub.userId));
}

export async function expireSubscriptions() {
  const expired = await db.update(subscriptions).set({ status: "EXPIRED" }).where(and(eq(subscriptions.status, "ACTIVE"), lt(subscriptions.endsAt, new Date()))).returning();
  for (const s of expired) {
    if (s.audience === "OWNER" && s.planSnapshot.benefits.featuredListing && !(await getActiveSubscription(s.userId, "OWNER"))) {
      await db.update(properties).set({ isFeatured: false }).where(eq(properties.ownerId, s.userId));
    }
  }
  return expired.length;
}

/** Max properties an owner may list (from their partner plan; default from settings-less fallback 3). */
export async function ownerPropertyLimit(ownerId: string) {
  const b = await getActiveBenefits(ownerId, "OWNER");
  return b?.maxProperties ?? 3;
}
