export type CreateOrderInput = {
  amount: number; // paise
  currency: "INR";
  receipt: string; // our payment id
  notes: Record<string, string>;
  customer: { name: string; email?: string | null; phone?: string | null };
};

export type CreatedOrder = {
  providerOrderId: string;
  /** Data the frontend needs to open the provider checkout. Never contains secrets. */
  checkout:
    | { kind: "redirect"; url: string }
    | { kind: "razorpay"; keyId: string; orderId: string; amount: number; currency: string; name: string; prefill: Record<string, string> };
};

export type WebhookEvent =
  | { type: "payment.captured"; eventId: string; providerOrderId: string; providerPaymentId: string; amount: number; method: string; fee?: number; raw: unknown }
  | { type: "payment.failed"; eventId: string; providerOrderId: string; providerPaymentId?: string; reason: string; raw: unknown }
  | { type: "refund.processed"; eventId: string; providerRefundId: string; providerPaymentId: string; amount: number; raw: unknown }
  | { type: "ignored"; eventId: string; raw: unknown };

export interface PaymentProvider {
  name: string;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  /** Verify signature on the RAW body and normalise the event. Throws on bad signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent>;
  refund(args: { providerPaymentId: string; amount: number; notes?: Record<string, string> }): Promise<{ providerRefundId: string; status: "PROCESSING" | "COMPLETED" }>;
}

export function normaliseMethod(m: string | undefined): "UPI" | "CARD" | "NETBANKING" | "WALLET" | "UNKNOWN" {
  switch ((m ?? "").toLowerCase()) {
    case "upi":
      return "UPI";
    case "card":
    case "credit_card":
    case "debit_card":
      return "CARD";
    case "netbanking":
    case "nb":
      return "NETBANKING";
    case "wallet":
      return "WALLET";
    default:
      return "UNKNOWN";
  }
}
