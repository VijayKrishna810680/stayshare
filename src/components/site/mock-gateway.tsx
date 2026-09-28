"use client";
import { useState } from "react";
import { Building2, CreditCard, FlaskConical, Landmark, Loader2, ShieldCheck, Smartphone, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { HoldCountdown } from "./countdown";

const METHODS = [
  { v: "upi", label: "UPI", icon: Smartphone, hint: "Google Pay, PhonePe, Paytm, BHIM" },
  { v: "card", label: "Card", icon: CreditCard, hint: "Credit or debit card" },
  { v: "netbanking", label: "Net banking", icon: Landmark, hint: "All major banks" },
  { v: "wallet", label: "Wallet", icon: Wallet, hint: "Paytm, Amazon Pay, Mobikwik" },
] as const;

/** DEVELOPMENT-only hosted checkout that plays the payment gateway (emits a signed webhook). */
export function MockGateway({ orderId, amount, status, enabled, context, purpose, subscription, returnTo }: { orderId: string; amount: number; status: string; enabled: boolean; context: { title: string; subtitle: string; holdExpiresAt: string | null; bookingId: string | null }; purpose: string; subscription: boolean; returnTo?: string }) {
  const [method, setMethod] = useState<(typeof METHODS)[number]["v"]>("upi");
  const [busy, setBusy] = useState<"success" | "failure" | null>(null);
  const done = status === "CAPTURED";

  async function simulate(outcome: "success" | "failure") {
    setBusy(outcome);
    try {
      const r = await apiFetch<{ delivered: boolean; bookingId: string | null; subscriptionId: string | null; purpose: string }>("/api/payments/mock/simulate", { method: "POST", json: { orderId, outcome, method } });
      if (!r.delivered) toast.error("The gateway webhook was not accepted. Please try again.");
      if (r.subscriptionId) window.location.href = `${returnTo ?? "/account/subscriptions"}?payment=${outcome}`;
      else if (r.bookingId && (r.purpose === "EXTENSION" || r.purpose === "MODIFICATION" || r.purpose === "CHECKOUT_DUES" || r.purpose === "SERVICE" || r.purpose === "SECURITY_DEPOSIT")) window.location.href = `/account/bookings/${r.bookingId}?payment=${outcome}`;
      else if (r.bookingId) window.location.href = `/booking/${r.bookingId}/status`;
      else window.location.href = "/account";
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 bg-amber-400 px-4 py-2 text-sm font-bold uppercase tracking-wide text-amber-950">
        <FlaskConical className="h-4 w-4" aria-hidden /> Development · Test payment gateway
      </div>
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
        <p className="flex items-center gap-2 text-sm text-white/70">
          <Building2 className="h-4 w-4" aria-hidden /> StayShare
        </p>
        <p className="mt-2 text-lg font-semibold">{context.title}</p>
        <p className="text-sm text-white/70">{context.subtitle}</p>
        <p className="mt-4 text-4xl font-extrabold tabular-nums">{formatINR(amount, { exact: amount % 100 !== 0 })}</p>
        <p className="mt-1 text-xs text-white/60">Order {orderId}</p>
      </div>
      <div className="space-y-4 p-6">
        {!enabled && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">The mock gateway is disabled because a live payment provider is configured.</p>}
        {done ? (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">This order has already been paid.</p>
        ) : (
          <>
            {context.holdExpiresAt && <HoldCountdown until={context.holdExpiresAt} label="Complete payment within" />}
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Choose a payment method</legend>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <label key={m.v} className={cn("flex cursor-pointer flex-col gap-1 rounded-2xl border p-3", method === m.v ? "border-brand-600 bg-brand-50 ring-1 ring-brand-200" : "border-slate-200 hover:border-slate-300")}>
                    <input type="radio" name="method" value={m.v} checked={method === m.v} onChange={() => setMethod(m.v)} className="sr-only" />
                    <m.icon className="h-5 w-5 text-slate-600" aria-hidden />
                    <span className="text-sm font-semibold">{m.label}</span>
                    <span className="text-[11px] text-slate-500">{m.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="button" disabled={!enabled || busy !== null} onClick={() => simulate("success")} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy === "success" && <Loader2 className="h-4 w-4 animate-spin" />} Pay {formatINR(amount, { exact: amount % 100 !== 0 })}
            </button>
            <button type="button" disabled={!enabled || busy !== null} onClick={() => simulate("failure")} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
              {busy === "failure" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" aria-hidden />} Simulate failure
            </button>
          </>
        )}
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> No real money moves. The result is delivered as a signed webhook{purpose && !subscription ? ` (${purpose.toLowerCase()})` : ""}.
        </p>
      </div>
    </div>
  );
}
