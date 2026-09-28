import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate } from "@/lib/dates";
import { expireSubscriptions, getActiveSubscription, listPlans, ownerPropertyLimit } from "@/services/subscriptions";
import { Alert, EmptyState, Money, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { PlanGrid } from "@/components/owner/subscription-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner plan" };

export default async function SubscriptionPage() {
  const u = await pageUser({ role: "OWNER" });
  await expireSubscriptions();
  const [plans, active, limit, history] = await Promise.all([
    listPlans("OWNER"),
    getActiveSubscription(u.id, "OWNER"),
    ownerPropertyLimit(u.id),
    db.select().from(subscriptions).where(and(eq(subscriptions.userId, u.id), eq(subscriptions.audience, "OWNER"))).orderBy(desc(subscriptions.createdAt)).limit(50),
  ]);
  return (
    <>
      <PageHeader title="Partner plan" description="Plans and prices are set by StayShare. Higher plans unlock more properties, lower commission and featured placement." />
      <div className="mb-6">
        {active ? (
          <Alert tone="success" title={`Current plan: ${active.planSnapshot.name}`}>
            Active until {prettyDate(active.endsAt)} · up to {limit} properties
            {active.planSnapshot.benefits.commissionBps !== undefined ? ` · ${active.planSnapshot.benefits.commissionBps / 100}% commission` : ""}
            {active.cancelledAt ? " · won't renew" : ""}
          </Alert>
        ) : (
          <Alert tone="info" title="No active partner plan">You can list up to {limit} properties on the free tier.</Alert>
        )}
      </div>
      {plans.length === 0 ? <EmptyState title="No partner plans available" description="StayShare hasn't published partner plans yet." /> : <PlanGrid currentPlanId={active?.planId ?? null} plans={plans.map((p) => ({ id: p.id, name: p.name, description: p.description, price: p.price, durationDays: p.durationDays, features: p.features, isPopular: p.isPopular, maxProperties: p.benefits.maxProperties, commissionBps: p.benefits.commissionBps, featuredListing: p.benefits.featuredListing, prioritySupport: p.benefits.prioritySupport }))} />}
      <h2 className="mb-3 mt-10 text-lg font-semibold">History</h2>
      {history.length === 0 ? (
        <p className="text-sm text-slate-500">No purchases yet.</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Plan</TH>
              <TH>Period</TH>
              <TH className="text-right">Paid</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {history.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">
                  {s.planSnapshot.name}
                  {s.grantedBy && <span className="ml-2 text-xs text-brand-700">Complimentary</span>}
                </TD>
                <TD className="text-sm">{s.startsAt ? `${prettyDate(s.startsAt)} – ${prettyDate(s.endsAt)}` : prettyDate(s.createdAt)}</TD>
                <TD className="text-right">
                  <Money paise={s.pricePaid} />
                </TD>
                <TD>
                  <StatusBadge status={s.status === "PENDING_PAYMENT" ? "PAYMENT_PENDING" : s.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
