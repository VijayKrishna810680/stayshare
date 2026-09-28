import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { badRequest } from "@/lib/errors";
import { fetchRazorpayPayment, verifyRazorpayCheckoutSignature } from "@/services/payments/razorpay";
import { capturePayment } from "@/services/booking";

const schema = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() });

/**
 * Called by the Razorpay Checkout handler. The signature is verified server-side AND the payment is
 * re-fetched from Razorpay's API before we mark it captured. The webhook remains the source of truth
 * for late/async captures; both paths are idempotent.
 */
export const POST = api(async (req) => {
  await requireUser();
  const b = await parseBody(req, schema);
  if (!verifyRazorpayCheckoutSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) throw badRequest("Payment signature verification failed");
  const p = await fetchRazorpayPayment(b.razorpay_payment_id);
  if (p.order_id !== b.razorpay_order_id) throw badRequest("Order mismatch");
  if (p.status !== "captured") return { status: p.status };
  const out = await capturePayment({ providerOrderId: p.order_id, providerPaymentId: p.id, amount: p.amount, method: p.method, fee: p.fee });
  return { status: "captured", bookingId: out.bookingId };
});
