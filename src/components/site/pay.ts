"use client";
import { apiFetch } from "@/lib/client-api";

export type Checkout =
  | { kind: "redirect"; url: string }
  | { kind: "razorpay"; keyId: string; orderId: string; amount: number; currency: string; name: string; prefill: Record<string, string> }
  | null
  | undefined;

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: unknown) => void) => void };

function loadRazorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Payment gateway failed to load")));
    s.onerror = () => reject(new Error("Could not load the payment gateway. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

/**
 * Hand off to the gateway. Mock gateway → full-page redirect. Razorpay → open Checkout, verify the
 * signature on our server, then go to `doneUrl`. Resolves "dismissed" if the user closes the modal.
 */
export async function startPayment(checkout: Checkout, opts: { doneUrl: string; description?: string }): Promise<"redirected" | "paid" | "dismissed" | "none"> {
  if (!checkout) return "none";
  if (checkout.kind === "redirect") {
    window.location.href = checkout.url;
    return "redirected";
  }
  const Rzp = await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new Rzp({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name || "StayShare",
      description: opts.description ?? "StayShare booking",
      prefill: checkout.prefill,
      theme: { color: "#1c7b6e" },
      handler: async (resp: Record<string, string>) => {
        try {
          await apiFetch("/api/payments/razorpay/verify", { method: "POST", json: resp });
          window.location.href = opts.doneUrl;
          resolve("paid");
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => resolve("dismissed") },
    });
    rzp.on("payment.failed", () => {
      /* Razorpay shows its own retry UI; the webhook records the failure. */
    });
    rzp.open();
  });
}
