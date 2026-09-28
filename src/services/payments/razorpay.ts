import { env } from "@/lib/env";
import { hmacSha256Hex, safeEqual } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import type { PaymentProvider, WebhookEvent } from "./types";

/**
 * Razorpay integration (https://razorpay.com/docs/api/). Requires RAZORPAY_KEY_ID,
 * RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET. Keys are read from env only — never hard-coded.
 * Webhook events used: payment.captured, payment.failed, refund.processed.
 */
const API = "https://api.razorpay.com/v1";

function authHeader() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) throw new AppError(500, "GATEWAY_NOT_CONFIGURED", "Razorpay keys are not configured");
  return "Basic " + Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: authHeader(), ...(init.headers ?? {}) },
  });
  const json = (await res.json()) as T & { error?: { description?: string } };
  if (!res.ok) throw new AppError(502, "GATEWAY_ERROR", json.error?.description ?? "Payment gateway error");
  return json;
}

/** Verify the checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyRazorpayCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  return safeEqual(hmacSha256Hex(env.razorpayKeySecret, `${orderId}|${paymentId}`), signature);
}

export async function fetchRazorpayPayment(paymentId: string) {
  return call<{ id: string; order_id: string; amount: number; status: string; method: string; fee?: number }>(`/payments/${paymentId}`);
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",
  async createOrder(input) {
    const order = await call<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({ amount: input.amount, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes }),
    });
    return {
      providerOrderId: order.id,
      checkout: {
        kind: "razorpay",
        keyId: env.razorpayKeyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "StayShare",
        prefill: { name: input.customer.name, email: input.customer.email ?? "", contact: input.customer.phone ?? "" },
      },
    };
  },
  async parseWebhook(rawBody, headers): Promise<WebhookEvent> {
    const sig = headers.get("x-razorpay-signature") ?? "";
    if (!env.razorpayWebhookSecret || !safeEqual(hmacSha256Hex(env.razorpayWebhookSecret, rawBody), sig)) {
      throw new AppError(400, "BAD_SIGNATURE", "Invalid webhook signature");
    }
    const body = JSON.parse(rawBody);
    const eventId = headers.get("x-razorpay-event-id") ?? `${body.event}:${body.created_at}:${body.payload?.payment?.entity?.id ?? body.payload?.refund?.entity?.id}`;
    const pay = body.payload?.payment?.entity;
    if (body.event === "payment.captured")
      return { type: "payment.captured", eventId, providerOrderId: pay.order_id, providerPaymentId: pay.id, amount: pay.amount, method: pay.method, fee: pay.fee, raw: body };
    if (body.event === "payment.failed")
      return { type: "payment.failed", eventId, providerOrderId: pay.order_id, providerPaymentId: pay.id, reason: pay.error_description ?? "Payment failed", raw: body };
    if (body.event === "refund.processed") {
      const r = body.payload.refund.entity;
      return { type: "refund.processed", eventId, providerRefundId: r.id, providerPaymentId: r.payment_id, amount: r.amount, raw: body };
    }
    return { type: "ignored", eventId, raw: body };
  },
  async refund({ providerPaymentId, amount, notes }) {
    const r = await call<{ id: string; status: string }>(`/payments/${providerPaymentId}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount, notes, speed: "normal" }),
    });
    return { providerRefundId: r.id, status: r.status === "processed" ? "COMPLETED" : "PROCESSING" };
  },
};
