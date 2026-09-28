import { Check, Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import type { PlanBenefits } from "@/db/schema";

export function benefitsList(b: PlanBenefits, features: string[]) {
  const out = [...features];
  if (b.bookingDiscountBps) out.unshift(`${b.bookingDiscountBps / 100}% off every booking${b.maxDiscountPerBooking ? ` (up to ${formatINR(b.maxDiscountPerBooking)})` : ""}`);
  if (b.waiveConvenienceFee) out.push("No convenience fee");
  if (b.commissionBps) out.unshift(`Commission ${b.commissionBps / 100}%`);
  if (b.featuredListing) out.push("Featured listing in search");
  if (b.maxProperties) out.push(`Up to ${b.maxProperties} properties`);
  if (b.prioritySupport) out.push("Priority support");
  return [...new Set(out)];
}

export function PlanCard({ plan, current, children }: { plan: { id: string; name: string; description: string | null; price: number; durationDays: number; benefits: PlanBenefits; features: string[]; isPopular: boolean }; current?: boolean; children?: React.ReactNode }) {
  const period = plan.durationDays >= 360 ? "year" : plan.durationDays >= 28 && plan.durationDays <= 31 ? "month" : `${plan.durationDays} days`;
  return (
    <div className={cn("relative flex flex-col rounded-3xl border bg-white p-6 shadow-sm", plan.isPopular ? "border-accent-400 ring-2 ring-accent-200" : "border-slate-200")}>
      {plan.isPopular && <span className="absolute -top-3 left-6 rounded-full bg-accent-500 px-3 py-0.5 text-xs font-bold text-white">Most popular</span>}
      <p className="flex items-center gap-2 font-semibold">
        <Crown className="h-4 w-4 text-accent-500" aria-hidden /> {plan.name}
      </p>
      {plan.description && <p className="mt-1 text-sm text-slate-600">{plan.description}</p>}
      <p className="mt-4">
        <span className="text-3xl font-extrabold tabular-nums">{plan.price === 0 ? "Free" : formatINR(plan.price)}</span>
        {plan.price > 0 && <span className="text-sm text-slate-500"> / {period}</span>}
      </p>
      <ul className="mt-4 flex-1 space-y-2 text-sm">
        {benefitsList(plan.benefits, plan.features).map((f) => (
          <li key={f} className="flex gap-2 text-slate-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {f}
          </li>
        ))}
      </ul>
      <div className="mt-6">{current ? <p className="rounded-xl bg-emerald-50 py-2.5 text-center text-sm font-semibold text-emerald-700">Your current plan</p> : children}</div>
    </div>
  );
}
