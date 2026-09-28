import { randomUUID } from "crypto";
import { env } from "@/lib/env";
import { hmacSha256Hex, safeEqual } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import type { PaymentProvider, WebhookEvent } from "./types";

/**
 * Development gateway that behaves like a real one: orders, a hosted checkout page, and
 * HMAC-signed webhooks. The hosted page (/pay/mock/[orderId]) asks the "gateway" endpoint to
 * emit a signed webhook — the booking is confirmed only when that webhook verifies on the backend.
 */
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

export function signMockPayload(body: string) {
  return hmacSha256Hex(env.mockWebhookSecret, body);
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  async createOrder(input) {
    const providerOrderId = `mock_order_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    return { providerOrderId, checkout: { kind: "redirect", url: `/pay/mock/${providerOrderId}?amount=${input.amount}` } };
  },
  async parseWebhook(rawBody, headers): Promise<WebhookEvent> {
    const sig = headers.get(MOCK_SIGNATURE_HEADER) ?? "";
    if (!safeEqual(sig, signMockPayload(rawBody))) throw new AppError(400, "BAD_SIGNATURE", "Invalid webhook signature");
    const p = JSON.parse(rawBody) as {
      id: string;
      event: string;
      orderId: string;
      paymentId?: string;
      amount?: number;
      method?: string;
      reason?: string;
      refundId?: string;
    };
    if (p.event === "payment.captured")
      return { type: "payment.captured", eventId: p.id, providerOrderId: p.orderId, providerPaymentId: p.paymentId!, amount: p.amount!, method: p.method ?? "upi", raw: p };
    if (p.event === "payment.failed")
      return { type: "payment.failed", eventId: p.id, providerOrderId: p.orderId, providerPaymentId: p.paymentId, reason: p.reason ?? "Payment declined", raw: p };
    if (p.event === "refund.processed")
      return { type: "refund.processed", eventId: p.id, providerRefundId: p.refundId!, providerPaymentId: p.paymentId!, amount: p.amount!, raw: p };
    return { type: "ignored", eventId: p.id, raw: p };
  },
  async refund() {
    return { providerRefundId: `mock_rfnd_${randomUUID().slice(0, 12)}`, status: "COMPLETED" };
  },
};
