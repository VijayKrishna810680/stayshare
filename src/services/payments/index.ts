import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { mockProvider } from "./mock";
import { razorpayProvider } from "./razorpay";
import type { PaymentProvider } from "./types";

/** Placeholder adapters: implement createOrder/parseWebhook/refund with each provider's SDK or REST API. */
function notImplemented(name: string): PaymentProvider {
  const fail = async (): Promise<never> => {
    throw new AppError(501, "GATEWAY_NOT_IMPLEMENTED", `${name} adapter is a placeholder. See docs/INTEGRATIONS.md`);
  };
  return { name, createOrder: fail, parseWebhook: fail, refund: fail };
}

const providers: Record<string, PaymentProvider> = {
  mock: mockProvider,
  razorpay: razorpayProvider,
  cashfree: notImplemented("cashfree"),
  payu: notImplemented("payu"),
  stripe: notImplemented("stripe"),
};

export function getProvider(name?: string): PaymentProvider {
  const p = providers[name ?? env.paymentProvider];
  if (!p) throw new AppError(500, "GATEWAY_UNKNOWN", `Unknown payment provider ${name}`);
  return p;
}
export type { PaymentProvider } from "./types";
