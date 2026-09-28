import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, payments } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { forbidden, notFound } from "@/lib/errors";
import { MOCK_SIGNATURE_HEADER, signMockPayload } from "@/services/payments/mock";

const schema = z.object({ orderId: z.string(), outcome: z.enum(["success", "failure"]), method: z.enum(["upi", "card", "netbanking", "wallet"]).default("upi") });

/**
 * Plays the role of the payment gateway in development: it builds a gateway event, signs it with
 * MOCK_WEBHOOK_SECRET and delivers it to our own webhook endpoint over HTTP — exactly the path a real
 * gateway uses. Disabled unless PAYMENT_PROVIDER=mock.
 */
export const POST = api(async (req) => {
  if (env.paymentProvider !== "mock") throw forbidden("Mock gateway is disabled");
  const u = await requireUser();
  const { orderId, outcome, method } = await parseBody(req, schema);
  const [p] = await db.select().from(payments).where(eq(payments.providerOrderId, orderId));
  if (!p) throw notFound("Order not found");
  let ownerId = p.userId;
  if (p.bookingId) {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, p.bookingId));
    ownerId = b?.customerId ?? null;
  }
  if (ownerId !== u.id && !u.isAdmin) throw forbidden();
  const payload = JSON.stringify(
    outcome === "success"
      ? { id: `evt_${randomUUID()}`, event: "payment.captured", orderId, paymentId: `mock_pay_${randomUUID().slice(0, 14)}`, amount: p.amount, method }
      : { id: `evt_${randomUUID()}`, event: "payment.failed", orderId, paymentId: `mock_pay_${randomUUID().slice(0, 14)}`, reason: "Payment declined by bank (simulated)" },
  );
  const origin = req.nextUrl.origin;
  const res = await fetch(`${origin}/api/webhooks/payments/mock`, { method: "POST", headers: { "Content-Type": "application/json", [MOCK_SIGNATURE_HEADER]: signMockPayload(payload) }, body: payload });
  const out = await res.json().catch(() => ({}));
  return { delivered: res.ok, bookingId: p.bookingId, subscriptionId: p.subscriptionId, purpose: p.purpose, webhook: out };
});
