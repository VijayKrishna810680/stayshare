import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import * as t from "@/db/schema";
import { addDays, todayIST } from "@/lib/dates";
import { cancelBooking, capturePayment, cancellationPreview, createBooking, failPayment, processWebhook } from "@/services/booking";
import { checkIn, checkOut, requestModification } from "@/services/stay";
import { createPayout, ownerBalance, transitionPayout } from "@/services/settlement";
import { buildQuote } from "@/services/pricing";
import { mockProvider, signMockPayload, MOCK_SIGNATURE_HEADER } from "@/services/payments/mock";
import { AppError } from "@/lib/errors";

type U = { id: string; name: string; email: string | null; phone: string | null };
let cust: U, cust2: U, staffId: string, ownerId: string, adminId: string;
let studio: typeof t.rooms.$inferSelect, twin: typeof t.rooms.$inferSelect, four: typeof t.rooms.$inferSelect;

const g = (name: string, gender: "MALE" | "FEMALE" = "FEMALE") => [{ name, gender }];
const today = todayIST();

async function user(email: string): Promise<U> {
  const [u] = await db.select().from(t.users).where(eq(t.users.email, email));
  return { id: u!.id, name: u!.name, email: u!.email, phone: u!.phone };
}
async function pay(bookingId: string) {
  const [p] = await db.select().from(t.payments).where(and(eq(t.payments.bookingId, bookingId), eq(t.payments.status, "PENDING")));
  return capturePayment({ providerOrderId: p!.providerOrderId!, providerPaymentId: `pay_${bookingId.slice(0, 6)}`, amount: p!.amount, method: "upi" });
}
const status = async (id: string) => (await db.select({ s: t.bookings.status }).from(t.bookings).where(eq(t.bookings.id, id)))[0]!.s;

beforeAll(async () => {
  cust = await user("customer@stayshare.demo");
  cust2 = await user("guest2@stayshare.demo");
  staffId = (await user("staff@stayshare.demo")).id;
  ownerId = (await user("owner@stayshare.demo")).id;
  adminId = (await user("admin@stayshare.demo")).id;
  const [prop] = await db.select().from(t.properties).where(eq(t.properties.slug, "nest-co-living-madhapur"));
  const rooms = await db.select().from(t.rooms).where(eq(t.rooms.propertyId, prop!.id));
  studio = rooms.find((r) => r.category === "PRIVATE")!;
  twin = rooms.find((r) => /Twin/.test(r.name ?? ""))!;
  four = rooms.find((r) => /Four/.test(r.name ?? ""))!;
});
afterAll(async () => {
  await pool.end();
});

describe("inventory & concurrency", () => {
  it("10 simultaneous requests for the same single-bed room → exactly one succeeds", async () => {
    const ci = addDays(today, 100);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createBooking(i % 2 ? cust2 : cust, { roomId: studio.id, unit: "ROOM", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 3), adults: 1, children: 0, services: [], guests: g(`Racer ${i}`), acceptTerms: true, paymentOption: "FULL" }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const conflicts = results.filter((r) => r.status === "rejected" && (r.reason as AppError).status === 409);
    expect(ok.length).toBe(1);
    expect(conflicts.length).toBe(9);
    const nights = await db.select().from(t.availabilityCalendars).where(eq(t.availabilityCalendars.roomId, studio.id));
    const keys = nights.map((n) => `${n.bedId}:${n.night}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shared room: remaining beds stay bookable; entire room is then blocked", async () => {
    const ci = addDays(today, 110);
    await createBooking(cust, { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 2), adults: 1, children: 0, services: [], guests: g("Bed one"), acceptTerms: true, paymentOption: "FULL" });
    const second = await createBooking(cust2, { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 2), adults: 1, children: 0, services: [], guests: g("Bed two"), acceptTerms: true, paymentOption: "FULL" });
    expect(second.bookingId).toBeTruthy();
    await expect(
      createBooking(cust, { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 2), adults: 1, children: 0, services: [], guests: g("Third"), acceptTerms: true, paymentOption: "FULL" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("entire-room booking blocks every bed", async () => {
    const ci = addDays(today, 120);
    await createBooking(cust, { roomId: twin.id, unit: "ROOM", bedsCount: 2, checkIn: ci, checkOut: addDays(ci, 2), adults: 2, children: 0, services: [], guests: [...g("A"), ...g("B")], acceptTerms: true, paymentOption: "FULL" });
    await expect(
      createBooking(cust2, { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: addDays(ci, 1), checkOut: addDays(ci, 3), adults: 1, children: 0, services: [], guests: g("C"), acceptTerms: true, paymentOption: "FULL" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("gender eligibility is enforced (male-only room)", async () => {
    await expect(
      createBooking(cust, { roomId: four.id, unit: "BED", bedsCount: 1, checkIn: addDays(today, 130), checkOut: addDays(today, 132), adults: 1, children: 0, services: [], guests: g("Priya", "FEMALE"), acceptTerms: true, paymentOption: "FULL" }),
    ).rejects.toThrow(/male/i);
  });
});

describe("payments", () => {
  it("booking stays PAYMENT_PENDING until the verified webhook; capture is idempotent", async () => {
    const ci = addDays(today, 140);
    const b = await createBooking(cust, { roomId: four.id, unit: "BED", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 5), adults: 1, children: 0, services: [], guests: g("Rahul", "MALE"), acceptTerms: true, paymentOption: "FULL" });
    expect(await status(b.bookingId)).toBe("PAYMENT_PENDING");
    const [p] = await db.select().from(t.payments).where(eq(t.payments.bookingId, b.bookingId));
    const body = JSON.stringify({ id: "evt_test_1", event: "payment.captured", orderId: p!.providerOrderId, paymentId: "pay_t1", amount: p!.amount, method: "card" });
    const ev = await mockProvider.parseWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockPayload(body) }));
    await processWebhook("mock", ev);
    expect(await status(b.bookingId)).toBe("CONFIRMED");
    const dup = await processWebhook("mock", ev);
    expect(dup.duplicate).toBe(true);
    const [bk] = await db.select().from(t.bookings).where(eq(t.bookings.id, b.bookingId));
    expect(bk!.paidAmount).toBe(p!.amount);
    const invs = await db.select().from(t.invoices).where(eq(t.invoices.bookingId, b.bookingId));
    expect(invs.length).toBe(1);
  });

  it("forged webhook signatures are rejected", async () => {
    await expect(mockProvider.parseWebhook('{"id":"x"}', new Headers({ [MOCK_SIGNATURE_HEADER]: "bad" }))).rejects.toMatchObject({ code: "BAD_SIGNATURE" });
  });

  it("amount mismatch never confirms a booking", async () => {
    const ci = addDays(today, 150);
    const b = await createBooking(cust, { roomId: four.id, unit: "BED", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 2), adults: 1, children: 0, services: [], guests: g("M", "MALE"), acceptTerms: true, paymentOption: "FULL" });
    const [p] = await db.select().from(t.payments).where(eq(t.payments.bookingId, b.bookingId));
    await capturePayment({ providerOrderId: p!.providerOrderId!, providerPaymentId: "pay_x", amount: 1, method: "upi" });
    expect(await status(b.bookingId)).toBe("PAYMENT_PENDING");
  });

  it("failed payment keeps the hold so the customer can retry", async () => {
    const ci = addDays(today, 160);
    const b = await createBooking(cust, { roomId: four.id, unit: "BED", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 2), adults: 1, children: 0, services: [], guests: g("F", "MALE"), acceptTerms: true, paymentOption: "FULL" });
    const [p] = await db.select().from(t.payments).where(eq(t.payments.bookingId, b.bookingId));
    await failPayment(p!.providerOrderId!, "Declined");
    const [p2] = await db.select().from(t.payments).where(eq(t.payments.id, p!.id));
    expect(p2!.status).toBe("FAILED");
    expect(await status(b.bookingId)).toBe("PAYMENT_PENDING");
  });
});

describe("cancellation, extension, stay, settlement", () => {
  it("cancellation refund follows policy and releases inventory", async () => {
    const ci = addDays(today, 30);
    const b = await createBooking(cust, { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 3), adults: 1, children: 0, services: [], guests: g("Canceller"), acceptTerms: true, paymentOption: "FULL" });
    await pay(b.bookingId);
    const [bk] = await db.select().from(t.bookings).where(eq(t.bookings.id, b.bookingId));
    const preview = cancellationPreview(bk!);
    expect(preview.refundBps).toBe(10000); // LONG_STAY: >7 days before → 100%
    await cancelBooking(b.bookingId, { id: cust.id, role: "CUSTOMER" }, "Plans changed");
    // 100% of the stay + deposit refunded; the convenience fee is non-refundable under this policy
    expect(await status(b.bookingId)).toBe("PARTIALLY_REFUNDED");
    const [after] = await db.select().from(t.bookings).where(eq(t.bookings.id, b.bookingId));
    expect(after!.paidAmount - after!.refundedAmount).toBe(after!.convenienceFee);
    const left = await db.select().from(t.availabilityCalendars).where(eq(t.availabilityCalendars.bookingId, b.bookingId));
    expect(left.length).toBe(0);
  });

  it("customers cannot cancel someone else's booking", async () => {
    const ci = addDays(today, 40);
    const b = await createBooking(cust, { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 2), adults: 1, children: 0, services: [], guests: g("Mine"), acceptTerms: true, paymentOption: "FULL" });
    await expect(cancelBooking(b.bookingId, { id: cust2.id, role: "CUSTOMER" }, "x")).rejects.toMatchObject({ status: 403 });
  });

  it("stay extension re-prices extra nights, collects payment, extends checkout", async () => {
    const ci = addDays(today, 50);
    const b = await createBooking(cust, { roomId: studio.id, unit: "ROOM", bedsCount: 1, checkIn: ci, checkOut: addDays(ci, 2), adults: 1, children: 0, services: [], guests: g("Extender"), acceptTerms: true, paymentOption: "FULL" });
    await pay(b.bookingId);
    const r = await requestModification(b.bookingId, { id: cust.id, role: "CUSTOMER" }, { type: "EXTEND_STAY", newCheckOut: addDays(ci, 4) });
    expect(r.status).toBe("AWAITING_PAYMENT");
    expect(r.priceDiff).toBeGreaterThan(0);
    const [p] = await db.select().from(t.payments).where(and(eq(t.payments.bookingId, b.bookingId), eq(t.payments.purpose, "EXTENSION")));
    await capturePayment({ providerOrderId: p!.providerOrderId!, providerPaymentId: "pay_ext", amount: p!.amount, method: "upi" });
    const [bk] = await db.select().from(t.bookings).where(eq(t.bookings.id, b.bookingId));
    expect(bk!.checkOut).toBe(addDays(ci, 4));
    expect(bk!.nights).toBe(4);
  });

  it("check-in → check-out: deposit refund, beds to cleaning, owner earning created", async () => {
    const b = await createBooking(cust2, { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: today, checkOut: addDays(today, 2), adults: 1, children: 0, services: [], guests: g("Stayer"), acceptTerms: true, paymentOption: "FULL" }).catch(async () =>
      createBooking(cust2, { roomId: four.id, unit: "BED", bedsCount: 1, checkIn: today, checkOut: addDays(today, 2), adults: 1, children: 0, services: [], guests: g("Stayer", "MALE"), acceptTerms: true, paymentOption: "FULL" }),
    );
    await pay(b.bookingId);
    await expect(checkIn(b.bookingId, staffId, { idVerified: false })).rejects.toThrow(/identity/i);
    await checkIn(b.bookingId, staffId, { idVerified: true, idDocType: "AADHAAR", idNumber: "999988887777" });
    expect(await status(b.bookingId)).toBe("CHECKED_IN");
    const calc = await checkOut(b.bookingId, staffId, { damageCharges: 50000, inspection: { ok: true } });
    expect(["COMPLETED", "CHECKED_OUT"]).toContain(await status(b.bookingId));
    expect(calc.damage).toBe(50000);
    const [e] = await db.select().from(t.ownerEarnings).where(eq(t.ownerEarnings.bookingId, b.bookingId));
    expect(e!.netPayable).toBeGreaterThan(0);
    const [ci] = await db.select().from(t.checkIns).where(eq(t.checkIns.bookingId, b.bookingId));
    expect(ci!.idLast4).toBe("7777");
  });

  it("owner payout lifecycle: request → approve → processing → paid", async () => {
    const bal = await ownerBalance(ownerId);
    expect(bal.eligible).toBeGreaterThan(0);
    const po = await createPayout(ownerId, { id: ownerId, isOwner: true });
    expect(po.amount).toBe(bal.eligible);
    await transitionPayout(po.id, "APPROVED", adminId);
    await transitionPayout(po.id, "PROCESSING", adminId);
    await transitionPayout(po.id, "PAID", adminId, { reference: "UTR123" });
    await expect(transitionPayout(po.id, "APPROVED", adminId)).rejects.toMatchObject({ status: 409 });
    const after = await ownerBalance(ownerId);
    expect(after.paid).toBeGreaterThanOrEqual(po.amount);
  });

  it("coupons: first-booking-only coupon rejected for returning customer", async () => {
    await expect(buildQuote({ roomId: studio.id, unit: "ROOM", bedIds: [], checkIn: addDays(today, 200), checkOut: addDays(today, 202), adults: 1, children: 0, services: [], couponCode: "WELCOME10", customerId: cust.id })).rejects.toThrow(/first booking/);
  });

  it("rooms without an admin-approved price cannot be booked", async () => {
    const [pending] = await db.select().from(t.rooms).where(eq(t.rooms.approvalStatus, "PENDING"));
    await expect(createBooking(cust, { roomId: pending!.id, unit: "BED", bedsCount: 1, checkIn: addDays(today, 5), checkOut: addDays(today, 6), adults: 1, children: 0, services: [], guests: g("X"), acceptTerms: true, paymentOption: "FULL" })).rejects.toMatchObject({ status: 404 });
  });
});
