import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Crown } from "lucide-react";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { expireSubscriptions, getActiveSubscription, listPlans } from "@/services/subscriptions";
import { Alert, Card, CardBody, CardHeader, PageHeader, StatusBadge } from "@/components/ui";
import { PlanCard } from "@/components/site/plan-card";
import { BuyPlanButton, CancelPlanButton } from "@/components/site/plan-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "StayShare Plus" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await pageUser({ next: "/account/subscriptions" });
  const { payment } = await searchParams;
  await expireSubscriptions();
  const [plans, active, history] = await Promise.all([listPlans("CUSTOMER"), getActiveSubscription(user.id, "CUSTOMER"), db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).orderBy(desc(subscriptions.createdAt))]);
  const mine = history.filter((h) => h.audience === "CUSTOMER");
  return (
    <div className="space-y-6">
      <PageHeader title="StayShare Plus" description="Member discounts on every stay. Plans never auto-renew." breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Plus membership" }]} />
      {payment === "success" && !active && <Alert tone="info" title="Payment received">Your membership will activate as soon as the payment is confirmed. Refresh in a moment.</Alert>}
      {payment === "success" && active && <Alert tone="success" title="Welcome to Plus!">Your membership is active.</Alert>}
      {payment === "failure" && <Alert tone="error" title="Payment failed">No money was taken. Please try again.</Alert>}
      {active && (
        <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-slate-900 to-brand-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-accent-400">
              <Crown className="h-4 w-4" aria-hidden /> Active membership
            </p>
            <p className="mt-1 text-2xl font-bold text-white">{active.planSnapshot.name}</p>
            <p className="text-sm text-white/80">
              Valid until {prettyDate(active.endsAt)}
              {active.cancelledAt ? " · cancelled, benefits continue until then" : ""}
            </p>
          </div>
          {!active.cancelledAt && active.endsAt && <CancelPlanButton subscriptionId={active.id} endsAt={active.endsAt.toISOString()} />}
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} current={active?.planId === p.id && !active.cancelledAt}>
            <BuyPlanButton planId={p.id} variant={p.isPopular ? "accent" : "primary"} label={active ? (active.planId === p.id ? "Extend membership" : "Switch to this plan") : "Join now"} />
          </PlanCard>
        ))}
      </div>
      {mine.length > 0 && (
        <Card>
          <CardHeader title="Membership history" />
          <CardBody>
            <ul className="divide-y divide-slate-100 text-sm">
              {mine.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-medium">{s.planSnapshot.name}</span>
                    <span className="block text-xs text-slate-500">
                      {s.startsAt ? `${prettyDate(s.startsAt)} – ${prettyDate(s.endsAt)}` : `Started ${prettyDate(s.createdAt)}`}
                      {s.grantedBy ? " · complimentary" : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatINR(s.pricePaid)}</span>
                    <StatusBadge status={s.status === "PENDING_PAYMENT" ? "PAYMENT_PENDING" : s.status} />
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
