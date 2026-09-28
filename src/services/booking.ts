import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  bookingBeds,
  bookingGuests,
  bookingModifications,
  bookingRooms,
  bookingStatusHistory,
  bookings,
  cancellationPolicies,
  cancellations,
  cities,
  couponUsage,
  coupons,
  identityDocuments,
  paymentTransactions,
  paymentWebhooks,
  payments,
  properties,
  refunds,
  rooms,
  users,
} from "@/db/schema";
import { nextBookingNumber } from "@/lib/counters";
import { addDays, istDateTime, nightsBetween, todayIST } from "@/lib/dates";
import { AppError, badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getSettings } from "@/lib/settings";
import { applyBps, formatINR } from "@/lib/money";
import { claimInventory, confirmHeldInventory, isUniqueViolation, releaseInventory, sweepExpiredHolds } from "./availability";
import { buildQuote } from "./pricing";
import { computeCancellationRefund, type PolicyTier } from "./pricing-engine";
import { getProvider } from "./payments";
import type { WebhookEvent } from "./payments/types";
import { normaliseMethod } from "./payments/types";
import { notify } from "./notifications";
import { createInvoice } from "./invoice";
import { upsertEarning } from "./settlement";

type BookingRow = typeof bookings.$inferSelect;
type BookingStatus = BookingRow["status"];

export const ACTIVE_STATUSES: BookingStatus[] = ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN"];
export const PENDING_STATUSES: BookingStatus[] = ["DRAFT", "INVENTORY_LOCKED", "PAYMENT_PENDING"];

export async function setStatus(tx: Tx, b: Pick<BookingRow, "id" | "status">, to: BookingStatus, changedBy: string | null, note?: string, extra: Partial<BookingRow> = {}) {
  await tx.update(bookings).set({ status: to, ...extra, updatedBy: changedBy }).where(eq(bookings.id, b.id));
  await tx.insert(bookingStatusHistory).values({ bookingId: b.id, fromStatus: b.status, toStatus: to, changedBy, note });
}

// ───────────────────────────── create ─────────────────────────────

export type CreateBookingInput = {
  roomId: string;
  unit: "BED" | "ROOM";
  bedIds?: string[];
  bedsCount: number;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  services: string[];
  couponCode?: string | null;
  guests: { name: string; phone?: string | null; email?: string | null; gender?: "MALE" | "FEMALE" | "OTHER" | null; age?: number | null }[];
  specialRequests?: string | null;
  idProofFileId?: string | null;
  acceptTerms: boolean;
  paymentOption: "FULL" | "PARTIAL" | "PAY_AT_PROPERTY";
  source?: string;
};

function checkGender(eligibility: string, guests: CreateBookingInput["guests"]) {
  if (eligibility === "MALE_ONLY" && guests.some((g) => g.gender && g.gender !== "MALE")) throw badRequest("This accommodation is for male guests only");
  if (eligibility === "FEMALE_ONLY" && guests.some((g) => g.gender && g.gender !== "FEMALE")) throw badRequest("This accommodation is for female guests only");
  if ((eligibility === "MALE_ONLY" || eligibility === "FEMALE_ONLY") && guests.some((g) => !g.gender)) throw badRequest("Please specify the gender of every guest for this accommodation");
}

export async function createBooking(customer: { id: string; name: string; email: string | null; phone: string | null }, input: CreateBookingInput) {
  if (!input.acceptTerms) throw badRequest("Please accept the terms, house rules and cancellation policy");
  const today = todayIST();
  if (input.checkIn < today) throw badRequest("Check-in date cannot be in the past");
  const s = await getSettings([
    "booking.holdMinutes",
    "booking.maxAdvanceDays",
    "booking.allowCashAtProperty",
    "booking.allowPartialPayment",
    "booking.partialPaymentBps",
  ]);
  if (input.checkIn > addDays(today, s["booking.maxAdvanceDays"])) throw badRequest(`Bookings can be made up to ${s["booking.maxAdvanceDays"]} days in advance`);
  const persons = input.adults + input.children;
  if (input.guests.length < 1) throw badRequest("Please add the primary guest's details");
  if (input.unit === "BED" && input.bedsCount < input.adults) throw badRequest("Each adult needs a bed");

  await sweepExpiredHolds();

  const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId));
  if (!room || room.deletedAt || !room.active || room.approvalStatus !== "APPROVED") throw notFound("Room is not available for booking");
  const [property] = await db.select().from(properties).where(eq(properties.id, room.propertyId));
  if (!property || property.approvalStatus !== "APPROVED" || !property.active || property.blocked || property.deletedAt) throw notFound("Property is not available for booking");
  const [city] = await db.select().from(cities).where(eq(cities.id, property.cityId));

  checkGender(room.genderEligibility !== "ANY" ? room.genderEligibility : property.genderEligibility, input.guests);
  if (persons > room.maxOccupancy && input.unit === "ROOM") throw badRequest(`Maximum ${room.maxOccupancy} guests allowed in this room`);

  if (property.idProofRequired && !input.idProofFileId) {
    const docs = await db.select({ id: identityDocuments.id }).from(identityDocuments).where(and(eq(identityDocuments.userId, customer.id), sql`${identityDocuments.deletedAt} IS NULL`));
    if (!docs.length) throw badRequest("This property requires a government ID. Please upload an ID proof to continue.", { needsIdProof: true });
  }

  if (input.paymentOption === "PAY_AT_PROPERTY" && !(property.allowCashAtProperty && s["booking.allowCashAtProperty"])) throw badRequest("Pay at property is not available for this property");
  if (input.paymentOption === "PARTIAL" && !s["booking.allowPartialPayment"]) throw badRequest("Partial payment is not enabled");

  const [policy] = property.cancellationPolicyId
    ? await db.select().from(cancellationPolicies).where(eq(cancellationPolicies.id, property.cancellationPolicyId))
    : [];

  const holdUntil = new Date(Date.now() + s["booking.holdMinutes"] * 60_000);
  const payAtProperty = input.paymentOption === "PAY_AT_PROPERTY";

  const result = await db.transaction(async (tx) => {
    const number = await nextBookingNumber(city?.code ?? "IND", tx);
    const [b] = await tx
      .insert(bookings)
      .values({
        bookingNumber: number,
        customerId: customer.id,
        propertyId: property.id,
        roomId: room.id,
        unit: input.unit,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: nightsBetween(input.checkIn, input.checkOut),
        adults: input.adults,
        children: input.children,
        bedsCount: input.unit === "ROOM" ? room.totalBeds : input.bedsCount,
        status: "DRAFT",
        selectedServices: input.services,
        specialRequests: input.specialRequests ?? null,
        termsAcceptedAt: new Date(),
        idProofFileId: input.idProofFileId ?? null,
        payAtProperty,
        lockExpiresAt: payAtProperty ? null : holdUntil,
        source: input.source ?? "WEB",
        createdBy: customer.id,
        cancellationPolicy: policy
          ? { key: policy.key, name: policy.name, description: policy.description, tiers: policy.tiers, refundConvenienceFee: policy.refundConvenienceFee, noShowChargeBps: policy.noShowChargeBps, earlyCheckoutRefundBps: policy.earlyCheckoutRefundBps, checkInTime: property.checkInTime }
          : { key: "DEFAULT", tiers: [{ hoursBeforeCheckIn: 24, refundBps: 10000 }, { hoursBeforeCheckIn: 0, refundBps: 0 }], checkInTime: property.checkInTime },
      })
      .returning();
    const booking = b!;
    await tx.insert(bookingStatusHistory).values({ bookingId: booking.id, toStatus: "DRAFT", changedBy: customer.id, note: "Booking started" });

    const bedIds = await claimInventory(tx, {
      bookingId: booking.id,
      roomId: room.id,
      unit: input.unit,
      bedIds: input.bedIds,
      bedsCount: input.bedsCount,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      status: payAtProperty ? "BOOKED" : "HELD",
      holdExpiresAt: holdUntil,
    });

    const { quote: q } = await buildQuote({
      roomId: room.id,
      unit: input.unit,
      bedIds,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: input.adults,
      children: input.children,
      services: input.services,
      couponCode: input.couponCode,
      customerId: customer.id,
    });

    await tx
      .update(bookings)
      .set({
        roomCharge: q.roomCharge + q.acCharge,
        extraGuestCharge: q.extraGuestCharge,
        servicesCharge: q.foodCharge + q.laundryCharge,
        cleaningFee: q.cleaningFee,
        convenienceFee: q.convenienceFee + q.convenienceTax,
        taxAmount: q.taxAmount,
        couponDiscount: q.couponDiscount,
        promoDiscount: q.promoDiscount,
        securityDeposit: q.securityDeposit,
        totalAmount: q.totalAmount,
        priceBreakdown: {
          lines: q.lines,
          nightly: q.nightly,
          tierApplied: q.tierLabel,
          taxRateBps: q.taxRateBps,
          convenienceFee: q.convenienceFee,
          convenienceTax: q.convenienceTax,
          appliedRules: q.appliedRules,
        } as never,
        couponCode: q.couponDiscount ? input.couponCode!.toUpperCase() : null,
        couponFundedBy: q.couponFundedBy,
        nonRefundable: q.nonRefundable,
        bedsCount: bedIds.length,
      })
      .where(eq(bookings.id, booking.id));

    await tx.insert(bookingRooms).values({ bookingId: booking.id, roomId: room.id, unit: input.unit });
    await tx.insert(bookingBeds).values(bedIds.map((bedId) => ({ bookingId: booking.id, bedId })));
    await tx.insert(bookingGuests).values(
      input.guests.map((g, i) => ({ bookingId: booking.id, name: g.name, phone: g.phone ?? null, email: g.email ?? null, gender: g.gender ?? null, age: g.age ?? null, isPrimary: i === 0 })),
    );

    let paymentAmount = q.totalAmount;
    if (input.paymentOption === "PARTIAL") {
      paymentAmount = Math.min(q.totalAmount, Math.ceil(applyBps(q.totalAmount, s["booking.partialPaymentBps"]) / 100) * 100);
    }

    if (payAtProperty) {
      await setStatus(tx, { id: booking.id, status: "DRAFT" }, "CONFIRMED", customer.id, "Confirmed — pay at property", { confirmedAt: new Date() });
      await tx.insert(payments).values({ bookingId: booking.id, provider: "cash", method: "CASH_AT_PROPERTY", amount: q.totalAmount, status: "PENDING" });
      await recordCouponUsage(tx, { ...booking, couponCode: q.couponDiscount ? input.couponCode!.toUpperCase() : null, couponDiscount: q.couponDiscount });
      await tx.update(properties).set({ bookingCount: sql`${properties.bookingCount} + 1` }).where(eq(properties.id, property.id));
    } else {
      await setStatus(tx, { id: booking.id, status: "DRAFT" }, "INVENTORY_LOCKED", customer.id, `Inventory held until ${holdUntil.toISOString()}`);
    }
    return { bookingId: booking.id, bookingNumber: number, paymentAmount, total: q.totalAmount };
  });

  if (payAtProperty) {
    await afterConfirmed(result.bookingId);
    return { ...result, status: "CONFIRMED" as const, checkout: null };
  }

  try {
    const order = await createPaymentOrder(result.bookingId, "BOOKING", result.paymentAmount, customer);
    return { ...result, status: "PAYMENT_PENDING" as const, checkout: order.checkout, paymentId: order.paymentId, holdExpiresAt: holdUntil };
  } catch (e) {
    await db.transaction(async (tx) => {
      await releaseInventory(tx, result.bookingId);
      await setStatus(tx, { id: result.bookingId, status: "INVENTORY_LOCKED" }, "CANCELLED", null, "Payment gateway unavailable", { cancelledAt: new Date() });
    });
    throw e;
  }
}

// ───────────────────────────── payments ─────────────────────────────

export async function createPaymentOrder(
  bookingId: string,
  purpose: "BOOKING" | "EXTENSION" | "MODIFICATION" | "CHECKOUT_DUES" | "SECURITY_DEPOSIT" | "SERVICE",
  amount: number,
  customer: { name: string; email: string | null; phone: string | null },
  modificationId?: string,
) {
  if (amount <= 0) throw badRequest("Nothing to pay");
  const provider = getProvider();
  const [p] = await db.insert(payments).values({ bookingId, purpose, provider: provider.name, amount, status: "CREATED", modificationId: modificationId ?? null }).returning();
  const [b] = await db.select({ bookingNumber: bookings.bookingNumber }).from(bookings).where(eq(bookings.id, bookingId));
  const order = await provider.createOrder({
    amount,
    currency: "INR",
    receipt: p!.id,
    notes: { bookingId, bookingNumber: b?.bookingNumber ?? "", purpose },
    customer,
  });
  await db.update(payments).set({ providerOrderId: order.providerOrderId, status: "PENDING" }).where(eq(payments.id, p!.id));
  await db.insert(paymentTransactions).values({ paymentId: p!.id, event: "order.created", status: "PENDING", amount, raw: { providerOrderId: order.providerOrderId } });
  if (purpose === "BOOKING") {
    await db.update(bookings).set({ status: "PAYMENT_PENDING" }).where(and(eq(bookings.id, bookingId), inArray(bookings.status, ["INVENTORY_LOCKED", "PAYMENT_PENDING"])));
    await db.insert(bookingStatusHistory).values({ bookingId, fromStatus: "INVENTORY_LOCKED", toStatus: "PAYMENT_PENDING", note: `Payment order ${order.providerOrderId}` });
  }
  return { paymentId: p!.id, providerOrderId: order.providerOrderId, checkout: order.checkout };
}

/** Retry payment for a booking whose hold is still valid. */
export async function retryBookingPayment(bookingId: string, customer: { id: string; name: string; email: string | null; phone: string | null }) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.customerId !== customer.id) throw notFound("Booking not found");
  if (!PENDING_STATUSES.includes(b.status)) throw badRequest("This booking is not awaiting payment");
  if (!b.lockExpiresAt || b.lockExpiresAt < new Date()) throw badRequest("The payment window has expired. Please start a new booking.");
  return createPaymentOrder(b.id, "BOOKING", b.totalAmount - b.paidAmount, customer);
}

/** Store & process a verified webhook exactly once. */
export async function processWebhook(providerName: string, event: WebhookEvent) {
  try {
    await db.insert(paymentWebhooks).values({ provider: providerName, eventId: event.eventId, eventType: event.type, signatureOk: true, payload: event.raw as object });
  } catch (e) {
    if (isUniqueViolation(e)) return { duplicate: true };
    throw e;
  }
  try {
    if (event.type === "payment.captured") {
      await capturePayment({ providerOrderId: event.providerOrderId, providerPaymentId: event.providerPaymentId, amount: event.amount, method: event.method, fee: event.fee, raw: event.raw });
    } else if (event.type === "payment.failed") {
      await failPayment(event.providerOrderId, event.reason, event.providerPaymentId, event.raw);
    } else if (event.type === "refund.processed") {
      await db.update(refunds).set({ status: "COMPLETED", processedAt: new Date() }).where(eq(refunds.providerRefundId, event.providerRefundId));
    }
    await db.update(paymentWebhooks).set({ processedAt: new Date() }).where(and(eq(paymentWebhooks.provider, providerName), eq(paymentWebhooks.eventId, event.eventId)));
    return { duplicate: false };
  } catch (e) {
    await db
      .update(paymentWebhooks)
      .set({ error: e instanceof Error ? e.message : String(e) })
      .where(and(eq(paymentWebhooks.provider, providerName), eq(paymentWebhooks.eventId, event.eventId)));
    throw e;
  }
}

async function recordCouponUsage(tx: Tx, b: Pick<BookingRow, "id" | "customerId" | "couponCode" | "couponDiscount">) {
  if (!b.couponCode || !b.couponDiscount) return;
  const [c] = await tx.select().from(coupons).where(eq(coupons.code, b.couponCode));
  if (!c) return;
  await tx.insert(couponUsage).values({ couponId: c.id, userId: b.customerId, bookingId: b.id, discount: b.couponDiscount }).onConflictDoNothing();
  await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, c.id));
}

export async function capturePayment(args: { providerOrderId: string; providerPaymentId: string; amount: number; method: string; fee?: number; raw?: unknown }) {
  const outcome = await db.transaction(async (tx) => {
    const res = await tx.execute<{ id: string }>(sql`SELECT id FROM payments WHERE provider_order_id = ${args.providerOrderId} FOR UPDATE`);
    const pid = res.rows[0]?.id;
    if (!pid) throw notFound(`Unknown order ${args.providerOrderId}`);
    const [p] = await tx.select().from(payments).where(eq(payments.id, pid));
    if (!p) throw notFound();
    if (p.status === "CAPTURED") return { kind: "noop" as const, bookingId: p.bookingId ?? "" };
    if (args.amount !== p.amount) {
      await tx.update(payments).set({ status: "FAILED", failureReason: `Amount mismatch: expected ${p.amount}, got ${args.amount}` }).where(eq(payments.id, p.id));
      logger.error("payment.amount_mismatch", { paymentId: p.id, expected: p.amount, got: args.amount });
      return { kind: "mismatch" as const, bookingId: p.bookingId ?? "" };
    }
    const { "fees.gatewayFeeBps": feeBps } = await getSettings(["fees.gatewayFeeBps"]);
    await tx
      .update(payments)
      .set({ status: "CAPTURED", providerPaymentId: args.providerPaymentId, method: normaliseMethod(args.method), gatewayFee: args.fee ?? applyBps(p.amount, feeBps), capturedAt: new Date() })
      .where(eq(payments.id, p.id));
    await tx.insert(paymentTransactions).values({ paymentId: p.id, event: "payment.captured", status: "CAPTURED", amount: p.amount, raw: (args.raw ?? {}) as object });
    if (p.purpose === "SUBSCRIPTION" || !p.bookingId) {
      const { activateSubscription } = await import("./subscriptions");
      await activateSubscription(tx, p.subscriptionId!, p.id, p.amount);
      return { kind: "subscription" as const, bookingId: "", subscriptionId: p.subscriptionId! };
    }
    await tx.update(bookings).set({ paidAmount: sql`${bookings.paidAmount} + ${p.amount}` }).where(eq(bookings.id, p.bookingId));
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, p.bookingId));
    if (!b) throw notFound();

    if (p.purpose === "BOOKING" && (PENDING_STATUSES.includes(b.status) || b.status === "CANCELLED")) {
      let ok = (await confirmHeldInventory(tx, b.id)) > 0;
      if (!ok) {
        // Hold lapsed before payment landed — try to re-claim the same beds.
        const bb = await tx.select({ bedId: bookingBeds.bedId }).from(bookingBeds).where(eq(bookingBeds.bookingId, b.id));
        try {
          await claimInventory(tx, { bookingId: b.id, roomId: b.roomId, unit: b.unit, bedIds: bb.map((x) => x.bedId), bedsCount: bb.length, checkIn: b.checkIn, checkOut: b.checkOut, status: "BOOKED" });
          ok = true;
        } catch (e) {
          if (!(e instanceof AppError && e.status === 409)) throw e;
        }
      }
      if (!ok) {
        await setStatus(tx, b, "REJECTED", null, "Payment received after inventory was released — auto refund");
        const [r] = await tx.insert(refunds).values({ bookingId: b.id, paymentId: p.id, amount: p.amount, reason: "Inventory no longer available when payment completed", kind: "CANCELLATION", status: "APPROVED" }).returning();
        return { kind: "rejected" as const, bookingId: b.id, refundId: r!.id };
      }
      await setStatus(tx, b, "CONFIRMED", null, `Payment ${args.providerPaymentId} captured`, { confirmedAt: new Date(), lockExpiresAt: null });
      await recordCouponUsage(tx, b);
      await tx.update(properties).set({ bookingCount: sql`${properties.bookingCount} + 1` }).where(eq(properties.id, b.propertyId));
      return { kind: "confirmed" as const, bookingId: b.id };
    }
    if ((p.purpose === "EXTENSION" || p.purpose === "MODIFICATION") && p.modificationId) {
      return { kind: "modification" as const, bookingId: b.id, modificationId: p.modificationId };
    }
    return { kind: "paid" as const, bookingId: b.id, purpose: p.purpose };
  });

  if (outcome.kind === "confirmed") await afterConfirmed(outcome.bookingId);
  if (outcome.kind === "rejected") await processRefund(outcome.refundId, null);
  if (outcome.kind === "modification") {
    const { applyModification } = await import("./stay");
    await applyModification(outcome.modificationId, null);
  }
  if (outcome.kind === "paid") {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, outcome.bookingId));
    if (b) await notify("payment.success", { userId: b.customerId, vars: { name: "", bookingNumber: b.bookingNumber, amount: formatINR(args.amount) } });
    if (b && b.status === "CHECKED_OUT" && b.paidAmount >= b.totalAmount) {
      await db.transaction((tx) => setStatus(tx, b, "COMPLETED", null, "All dues cleared", { completedAt: new Date() }));
    }
  }
  return outcome;
}

async function afterConfirmed(bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) return;
  const [p] = await db.select().from(properties).where(eq(properties.id, b.propertyId));
  const [u] = await db.select().from(users).where(eq(users.id, b.customerId));
  await createInvoice(b.id, "BOOKING").catch((e) => logger.error("invoice.failed", { bookingId, err: String(e) }));
  const vars = {
    name: u?.name,
    bookingNumber: b.bookingNumber,
    propertyName: p?.name,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    amount: formatINR(b.paidAmount || b.totalAmount),
    link: `${process.env.APP_URL ?? ""}/account/bookings/${b.id}`,
  };
  await notify("booking.confirmed", { userId: b.customerId, vars, data: { bookingId: b.id } });
  if (b.paidAmount) await notify("payment.success", { userId: b.customerId, vars });
  if (p) await notify("booking.confirmed", { userId: p.ownerId, vars: { ...vars, name: "Partner" }, data: { bookingId: b.id, owner: true } });
}

export async function failPayment(providerOrderId: string, reason: string, providerPaymentId?: string, raw?: unknown) {
  const [p] = await db.select().from(payments).where(eq(payments.providerOrderId, providerOrderId));
  if (!p || p.status === "CAPTURED") return;
  await db.update(payments).set({ status: "FAILED", failureReason: reason, providerPaymentId: providerPaymentId ?? p.providerPaymentId }).where(eq(payments.id, p.id));
  await db.insert(paymentTransactions).values({ paymentId: p.id, event: "payment.failed", status: "FAILED", amount: p.amount, raw: (raw ?? { reason }) as object });
  if (!p.bookingId) return;
  const [b] = await db.select().from(bookings).where(eq(bookings.id, p.bookingId));
  if (b) await notify("payment.failed", { userId: b.customerId, vars: { bookingNumber: b.bookingNumber, reason, amount: formatINR(p.amount) }, data: { bookingId: b.id } });
}

// ───────────────────────────── cancellation & refunds ─────────────────────────────

type PolicySnapshot = { tiers?: PolicyTier[]; refundConvenienceFee?: boolean; noShowChargeBps?: number; earlyCheckoutRefundBps?: number; checkInTime?: string; name?: string };

export function cancellationPreview(b: BookingRow, overrideRefundBps?: number | null) {
  const pol = (b.cancellationPolicy ?? {}) as PolicySnapshot;
  const checkInAt = istDateTime(b.checkIn, pol.checkInTime ?? "12:00");
  const hoursBefore = (checkInAt.getTime() - Date.now()) / 3_600_000;
  const bd = (b.priceBreakdown ?? {}) as { convenienceFee?: number; convenienceTax?: number };
  return computeCancellationRefund({
    paidAmount: b.paidAmount,
    securityDeposit: b.securityDeposit,
    convenienceFee: bd.convenienceFee ?? b.convenienceFee,
    convenienceTax: bd.convenienceTax ?? 0,
    tiers: pol.tiers ?? [],
    hoursBefore,
    nonRefundable: b.nonRefundable,
    refundConvenienceFee: Boolean(pol.refundConvenienceFee),
    checkedIn: b.status === "CHECKED_IN",
    overrideRefundBps,
  });
}

export async function cancelBooking(
  bookingId: string,
  actor: { id: string; role: "CUSTOMER" | "ADMIN" | "OWNER" },
  reason: string,
  opts: { overrideRefundBps?: number | null; adminNotes?: string } = {},
) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw notFound("Booking not found");
  if (actor.role === "CUSTOMER" && b.customerId !== actor.id) throw forbidden();
  if (actor.role !== "ADMIN" && opts.overrideRefundBps != null) throw forbidden("Only administrators can override refunds");
  const cancellable: BookingStatus[] = [...PENDING_STATUSES, "CONFIRMED", "CHECK_IN_PENDING"];
  if (!cancellable.includes(b.status)) throw conflict(b.status === "CHECKED_IN" ? "You are checked in — please request an early check-out instead" : "This booking can no longer be cancelled");

  const calc = cancellationPreview(b, opts.overrideRefundBps);
  const res = await db.transaction(async (tx) => {
    await releaseInventory(tx, b.id);
    await tx.insert(cancellations).values({
      bookingId: b.id,
      reason,
      requestedBy: actor.id,
      requestedRole: actor.role,
      approvedBy: actor.role === "ADMIN" ? actor.id : null,
      refundAmount: calc.totalRefund,
      penalty: calc.retained,
      status: "APPROVED",
      adminNotes: opts.adminNotes,
    });
    let refundId: string | null = null;
    if (calc.totalRefund > 0) {
      const [r] = await tx
        .insert(refunds)
        .values({ bookingId: b.id, amount: calc.totalRefund, reason: `Cancellation: ${reason}`, kind: "CANCELLATION", status: "APPROVED", requestedBy: actor.id, approvedBy: actor.role === "ADMIN" ? actor.id : null, adminNotes: opts.adminNotes })
        .returning();
      refundId = r!.id;
      await setStatus(tx, b, "REFUND_PENDING", actor.id, `Cancelled by ${actor.role.toLowerCase()} — refund ${formatINR(calc.totalRefund)}`, { cancelledAt: new Date() });
    } else {
      await setStatus(tx, b, "CANCELLED", actor.id, `Cancelled by ${actor.role.toLowerCase()}`, { cancelledAt: new Date() });
    }
    // Owner keeps its share of any retained stay amount.
    if (b.paidAmount > 0 && calc.refundableBase > 0) {
      await upsertEarning(tx, b.id, { retainedShareBps: 10000 - calc.refundBps });
    }
    return { refundId };
  });
  if (res.refundId) await processRefund(res.refundId, actor.role === "ADMIN" ? actor.id : null);
  const [u] = await db.select().from(users).where(eq(users.id, b.customerId));
  await notify("booking.cancelled", { userId: b.customerId, vars: { name: u?.name, bookingNumber: b.bookingNumber, refundAmount: formatINR(calc.totalRefund) }, data: { bookingId: b.id } });
  return calc;
}

/** Send an approved refund to the gateway, splitting across captured payments (newest first). */
export async function processRefund(refundId: string, actorId: string | null) {
  const [r] = await db.select().from(refunds).where(eq(refunds.id, refundId));
  if (!r) throw notFound("Refund not found");
  if (!["APPROVED", "FAILED"].includes(r.status)) throw conflict(`Refund is ${r.status.toLowerCase()}`);
  const pays = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, r.bookingId), inArray(payments.status, ["CAPTURED", "PARTIALLY_REFUNDED"])));
  pays.sort((a, b) => (b.capturedAt?.getTime() ?? 0) - (a.capturedAt?.getTime() ?? 0));
  let remaining = r.amount;
  let lastRef: string | null = null;
  let allDone = true;
  await db.update(refunds).set({ status: "PROCESSING", approvedBy: r.approvedBy ?? actorId }).where(eq(refunds.id, r.id));
  try {
    for (const p of pays) {
      if (remaining <= 0) break;
      const avail = p.amount - p.refundedAmount;
      if (avail <= 0) continue;
      const amt = Math.min(avail, remaining);
      let providerRefundId: string;
      let status: "PROCESSING" | "COMPLETED";
      if (p.provider === "cash") {
        providerRefundId = `CASH-${r.id.slice(0, 8)}`;
        status = "COMPLETED";
      } else {
        const out = await getProvider(p.provider).refund({ providerPaymentId: p.providerPaymentId!, amount: amt, notes: { refundId: r.id } });
        providerRefundId = out.providerRefundId;
        status = out.status;
      }
      if (status !== "COMPLETED") allDone = false;
      lastRef = providerRefundId;
      const newRefunded = p.refundedAmount + amt;
      await db.update(payments).set({ refundedAmount: newRefunded, status: newRefunded >= p.amount ? "REFUNDED" : "PARTIALLY_REFUNDED" }).where(eq(payments.id, p.id));
      await db.insert(paymentTransactions).values({ paymentId: p.id, event: "refund.created", status: newRefunded >= p.amount ? "REFUNDED" : "PARTIALLY_REFUNDED", amount: amt, raw: { refundId: r.id, providerRefundId } });
      remaining -= amt;
    }
    if (remaining > 0 && pays.length === 0) {
      // Nothing captured (e.g. pay-at-property not yet collected) — nothing to send back.
      remaining = 0;
    }
  } catch (e) {
    await db.update(refunds).set({ status: "FAILED", adminNotes: `${r.adminNotes ?? ""}\nGateway error: ${e instanceof Error ? e.message : e}`.trim() }).where(eq(refunds.id, r.id));
    throw e;
  }
  await db.update(refunds).set({ status: allDone ? "COMPLETED" : "PROCESSING", providerRefundId: lastRef, processedAt: allDone ? new Date() : null }).where(eq(refunds.id, r.id));

  await db.transaction(async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, r.bookingId));
    if (!b) return;
    const refunded = b.refundedAmount + r.amount;
    const extra: Partial<BookingRow> = { refundedAmount: refunded };
    if (r.kind === "DEPOSIT") extra.depositRefunded = b.depositRefunded + r.amount;
    if (["REFUND_PENDING", "CANCELLED", "REJECTED", "NO_SHOW", "PARTIALLY_REFUNDED"].includes(b.status)) {
      const to: BookingStatus = !allDone ? "REFUND_PENDING" : refunded >= b.paidAmount ? "REFUNDED" : "PARTIALLY_REFUNDED";
      if (to !== b.status) await setStatus(tx, b, to, actorId, `Refund ${formatINR(r.amount)} ${allDone ? "completed" : "initiated"}`, extra);
      else await tx.update(bookings).set(extra).where(eq(bookings.id, b.id));
    } else {
      await tx.update(bookings).set(extra).where(eq(bookings.id, b.id));
    }
  });
  const [b] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
  if (b) await notify(allDone ? "refund.completed" : "refund.initiated", { userId: b.customerId, vars: { bookingNumber: b.bookingNumber, amount: formatINR(r.amount), refundId: lastRef ?? "" }, data: { bookingId: b.id } });
}

/** Customer asks for an exceptional refund (goodwill). Admin approves/rejects later. */
export async function requestRefund(bookingId: string, customerId: string, amount: number, reason: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.customerId !== customerId) throw notFound("Booking not found");
  const refundable = b.paidAmount - b.refundedAmount;
  if (refundable <= 0) throw badRequest("There is nothing left to refund on this booking");
  const amt = Math.min(amount, refundable);
  const [open] = await db.select().from(refunds).where(and(eq(refunds.bookingId, b.id), eq(refunds.status, "REQUESTED")));
  if (open) throw conflict("A refund request is already pending for this booking");
  const [r] = await db.insert(refunds).values({ bookingId: b.id, amount: amt, reason, kind: "GOODWILL", status: "REQUESTED", requestedBy: customerId }).returning();
  return r!;
}

export async function decideRefund(refundId: string, adminId: string, approve: boolean, notes?: string, amount?: number) {
  const [r] = await db.select().from(refunds).where(eq(refunds.id, refundId));
  if (!r) throw notFound("Refund not found");
  if (r.status !== "REQUESTED") throw conflict("Refund was already decided");
  if (!approve) {
    await db.update(refunds).set({ status: "REJECTED", approvedBy: adminId, adminNotes: notes }).where(eq(refunds.id, r.id));
    return;
  }
  await db.update(refunds).set({ status: "APPROVED", approvedBy: adminId, adminNotes: notes, amount: amount ?? r.amount }).where(eq(refunds.id, r.id));
  await processRefund(r.id, adminId);
}

/** Mark a confirmed booking as a no-show after its check-in date; applies the policy's no-show charge. */
export async function markNoShow(bookingId: string, actorId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw notFound();
  if (!["CONFIRMED", "CHECK_IN_PENDING"].includes(b.status)) throw conflict("Only confirmed bookings can be marked as no-show");
  if (b.checkIn > todayIST()) throw badRequest("Check-in date has not arrived yet");
  const pol = (b.cancellationPolicy ?? {}) as PolicySnapshot;
  const chargeBps = pol.noShowChargeBps ?? 10000;
  const calc = cancellationPreview({ ...b, status: "CONFIRMED" }, 10000 - chargeBps);
  const refundId = await db.transaction(async (tx) => {
    await releaseInventory(tx, b.id);
    await setStatus(tx, b, "NO_SHOW", actorId, `No-show — ${chargeBps / 100}% charged`);
    await upsertEarning(tx, b.id, { retainedShareBps: chargeBps });
    if (calc.totalRefund > 0) {
      const [r] = await tx.insert(refunds).values({ bookingId: b.id, amount: calc.totalRefund, reason: "No-show refund per policy", kind: "CANCELLATION", status: "APPROVED", approvedBy: actorId }).returning();
      return r!.id;
    }
    return null;
  });
  if (refundId) await processRefund(refundId, actorId);
}

export async function getBookingModifications(bookingId: string) {
  return db.select().from(bookingModifications).where(eq(bookingModifications.bookingId, bookingId));
}
