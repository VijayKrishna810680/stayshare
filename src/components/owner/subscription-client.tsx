"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Crown } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Badge, Button, Money } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/dialog";

type Checkout = { kind: "redirect"; url: string } | { kind: "razorpay"; keyId: string; orderId: string; amount: number; currency: string; name: string; prefill: Record<string, string> };
export type PlanCard = { id: string; name: string; description: string | null; price: number; durationDays: number; features: string[]; isPopular: boolean; maxProperties?: number; commissionBps?: number; featuredListing?: boolean; prioritySupport?: boolean };

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((res) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res(true);
    s.onerror = () => res(false);
    document.body.appendChild(s);
  });
}

export function PlanGrid({ plans, currentPlanId }: { plans: PlanCard[]; currentPlanId: string | null }) {
  const router = useRouter();
  const [buy, setBuy] = useState<PlanCard | null>(null);
  const [busy, setBusy] = useState(false);
  const purchase = async () => {
    setBusy(true);
    try {
      const r = await apiFetch<{ subscriptionId: string; checkout: Checkout | null; activated: boolean }>("/api/subscriptions", { method: "POST", json: { planId: buy!.id } });
      if (r.activated || !r.checkout) {
        toast.success(`${buy!.name} activated`);
        setBuy(null);
        router.refresh();
        return;
      }
      if (r.checkout.kind === "redirect") {
        window.location.href = r.checkout.url;
        return;
      }
      const c = r.checkout;
      if (!(await loadRazorpay()) || !window.Razorpay) throw new Error("Couldn't load the payment window. Check your connection and try again.");
      new window.Razorpay({
        key: c.keyId,
        order_id: c.orderId,
        amount: c.amount,
        currency: c.currency,
        name: c.name,
        prefill: c.prefill,
        theme: { color: "#1c7b6e" },
        handler: async (resp: Record<string, string>) => {
          try {
            await apiFetch("/api/payments/razorpay/verify", { method: "POST", json: resp });
            toast.success("Payment received — your plan is active");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Verification failed");
          }
        },
      }).open();
      setBuy(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start payment");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => {
          const current = p.id === currentPlanId;
          return (
            <li key={p.id} className={cn("card relative flex flex-col p-5", p.isPopular && "border-brand-400 ring-2 ring-brand-200")}>
              {p.isPopular && (
                <Badge tone="brand" className="absolute right-4 top-4">
                  Most popular
                </Badge>
              )}
              <Crown className="mb-2 h-6 w-6 text-accent-500" aria-hidden />
              <h3 className="text-lg font-semibold">{p.name}</h3>
              {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
              <p className="mt-3 text-3xl font-bold">
                {p.price === 0 ? "Free" : <Money paise={p.price} />}
                <span className="text-sm font-normal text-slate-500"> / {p.durationDays} days</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.maxProperties !== undefined && <Feature>Up to {p.maxProperties} properties</Feature>}
                {p.commissionBps !== undefined && <Feature>{p.commissionBps / 100}% platform commission</Feature>}
                {p.featuredListing && <Feature>Featured listing in search</Feature>}
                {p.prioritySupport && <Feature>Priority partner support</Feature>}
                {p.features.map((f) => (
                  <Feature key={f}>{f}</Feature>
                ))}
              </ul>
              <Button className="mt-5 w-full" variant={current ? "outline" : p.isPopular ? "primary" : "secondary"} onClick={() => setBuy(p)}>
                {current ? "Renew / extend" : "Choose plan"}
              </Button>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!buy}
        onClose={() => setBuy(null)}
        title={`Buy ${buy?.name}?`}
        description={buy ? `${buy.price ? `You'll pay ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(buy.price / 100)} securely.` : "This plan is free."} ${buy.id === currentPlanId ? "Your current plan is extended." : "Switching plans ends your current plan and starts this one."} The plan activates only after payment is verified.` : undefined}
        confirmText={buy?.price ? "Continue to payment" : "Activate"}
        loading={busy}
        onConfirm={purchase}
      />
    </>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden /> {children}
    </li>
  );
}
