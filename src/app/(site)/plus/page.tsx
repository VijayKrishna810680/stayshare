import type { Metadata } from "next";
import { Crown, Headset, Percent, Receipt } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current";
import { prettyDate } from "@/lib/dates";
import { getActiveSubscription, listPlans } from "@/services/subscriptions";
import { PlanCard } from "@/components/site/plan-card";
import { BuyPlanButton } from "@/components/site/plan-actions";
import { LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "StayShare Plus membership" };

export default async function PlusPage() {
  const user = await getCurrentUser();
  const [plans, active] = await Promise.all([listPlans("CUSTOMER"), user ? getActiveSubscription(user.id, "CUSTOMER") : Promise.resolve(null)]);
  const best = Math.max(0, ...plans.map((p) => p.benefits.bookingDiscountBps ?? 0));
  return (
    <>
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 text-white">
        <div className="container-page py-14 text-center lg:py-20">
          <Crown className="mx-auto h-12 w-12 text-accent-400" aria-hidden />
          <h1 className="mt-4 text-3xl font-extrabold text-white sm:text-5xl">StayShare Plus</h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-white/85">{best ? `Save up to ${best / 100}% on every booking` : "Member-only savings on every booking"}, skip convenience fees and get priority support — for nightly and monthly stays.</p>
          {active && <p className="mx-auto mt-4 inline-flex rounded-full bg-accent-500 px-4 py-1 text-sm font-semibold">You&apos;re a member · {active.planSnapshot.name} until {prettyDate(active.endsAt)}</p>}
        </div>
      </section>
      <section className="container-page py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Percent, t: "Instant discount", d: "Applied automatically at checkout on every eligible stay." },
            { icon: Receipt, t: "No convenience fee", d: "Selected plans waive the platform fee on bookings." },
            { icon: Headset, t: "Priority support", d: "Jump the queue on live chat and support tickets." },
          ].map((x) => (
            <div key={x.t} className="card p-5">
              <x.icon className="h-6 w-6 text-brand-600" aria-hidden />
              <p className="mt-2 font-semibold">{x.t}</p>
              <p className="text-sm text-slate-600">{x.d}</p>
            </div>
          ))}
        </div>
        <h2 className="mt-12 text-2xl font-bold">Choose your plan</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} current={active?.planId === p.id && !active.cancelledAt}>
              {user ? (
                <BuyPlanButton planId={p.id} variant={p.isPopular ? "accent" : "primary"} label={active ? "Extend / switch" : "Join Plus"} />
              ) : (
                <LinkButton href="/login?next=/plus" className="w-full" variant={p.isPopular ? "accent" : "primary"}>
                  Log in to join
                </LinkButton>
              )}
            </PlanCard>
          ))}
        </div>
        <p className="mt-6 text-sm text-slate-500">Plans are priced by StayShare, never auto-renew, and can be cancelled any time (benefits continue until the end date). Discounts can&apos;t be combined with some coupons.</p>
      </section>
    </>
  );
}
