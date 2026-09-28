import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { Crown, IndianRupee, Users } from "lucide-react";
import { db } from "@/db";
import { subscriptionPlans, subscriptions, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { Badge, EmptyState, Money, PageHeader, Pagination, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ResourceManager } from "@/components/admin/resource-manager";
import { ActionButton, FilterBar, FormDialogButton } from "@/components/admin/widgets";
import { loadRows } from "../_lib/resource-page";
import { customerOptions, one, ownerOptions, pageArgs, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: ["pricing.manage", "users.manage"] });
  const sp = await searchParams;
  const { page, pageSize, offset } = pageArgs(sp, 25);
  const conds: SQL[] = [];
  if (one(sp.audience)) conds.push(eq(subscriptions.audience, one(sp.audience)));
  if (one(sp.status)) conds.push(eq(subscriptions.status, one(sp.status)));
  if (one(sp.plan)) conds.push(eq(subscriptions.planId, one(sp.plan)));
  const where = conds.length ? and(...conds) : undefined;
  const [plans, subs, total, stats, customers, owners] = await Promise.all([
    loadRows("subscription-plans"),
    db
      .select({ s: subscriptions, user: users.name, email: users.email, plan: subscriptionPlans.name })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
      .where(where)
      .orderBy(desc(subscriptions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    db
      .execute(
        sql`SELECT count(*) FILTER (WHERE status = 'ACTIVE' AND ends_at > now() AND audience = 'CUSTOMER')::int AS cust, count(*) FILTER (WHERE status = 'ACTIVE' AND ends_at > now() AND audience = 'OWNER')::int AS own,
          coalesce(sum(price_paid) FILTER (WHERE status IN ('ACTIVE','EXPIRED','CANCELLED')), 0)::bigint AS revenue,
          coalesce(sum(price_paid) FILTER (WHERE status IN ('ACTIVE','EXPIRED','CANCELLED') AND created_at > now() - interval '30 days'), 0)::bigint AS revenue30
          FROM subscriptions`,
      )
      .then((r) => r.rows[0] as { cust: number; own: number; revenue: string; revenue30: string }),
    customerOptions(),
    ownerOptions(),
  ]);
  const planOpts = plans.map((p) => ({ value: p.id, label: `${p.name} (${String(p.audience).toLowerCase()}, ${formatINR(Number(p.price))} / ${p.durationDays} days)` }));
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  const canUsers = u.has("users.manage") || u.has("pricing.manage");
  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Membership plans for customers (e.g. StayShare Plus) and partner plans for property owners. Prices and benefits are set here by the StayShare team; price changes are written to price history."
        actions={
          canUsers ? (
            <FormDialogButton
              url="/api/admin/subscriptions/grant"
              label="Grant complimentary plan"
              variant="primary"
              title="Grant a complimentary plan"
              description="Activates the plan immediately at no charge (stacks onto an existing active plan of the same type)."
              fields={[
                { name: "planId", label: "Plan", type: "select", required: true, options: planOpts },
                { name: "userId", label: "User", type: "select", required: true, options: [...customers.map((c) => ({ ...c, label: `Customer · ${c.label}` })), ...owners.map((o) => ({ ...o, label: `Owner · ${o.label}` }))] },
                { name: "note", label: "Internal note", type: "textarea" },
              ]}
              submitText="Grant plan"
              success="Plan granted"
            />
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active customer members" value={stats.cust} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active partner plans" value={stats.own} icon={<Crown className="h-5 w-5" />} tone="accent" />
        <StatCard label="Subscription revenue (30 days)" value={formatINR(Number(stats.revenue30))} icon={<IndianRupee className="h-5 w-5" />} tone="green" />
        <StatCard label="Subscription revenue (all time)" value={formatINR(Number(stats.revenue))} icon={<IndianRupee className="h-5 w-5" />} tone="slate" />
      </div>
      <h2 className="mb-3 text-lg font-semibold">Plans</h2>
      <ResourceManager resource="subscription-plans" rows={plans} title="Plans" canEdit={u.has("pricing.manage")} />
      <h2 className="mb-3 mt-8 text-lg font-semibold">Subscribers</h2>
      <FilterBar
        fields={[
          { name: "audience", label: "Audience", type: "select", options: [{ value: "CUSTOMER", label: "Customers" }, { value: "OWNER", label: "Partners" }] },
          { name: "status", label: "Status", type: "select", options: ["ACTIVE", "PENDING_PAYMENT", "EXPIRED", "CANCELLED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) },
          { name: "plan", label: "Plan", type: "select", options: plans.map((p) => ({ value: p.id, label: String(p.name) })) },
        ]}
      />
      {!subs.length ? (
        <EmptyState title="No subscriptions found" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Subscriber</TH>
              <TH>Plan</TH>
              <TH>Status</TH>
              <TH>Period</TH>
              <TH className="text-right">Paid</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {subs.map(({ s, user, email, plan }) => (
              <TR key={s.id}>
                <TD>
                  <p className="font-medium">{user}</p>
                  <p className="text-xs text-slate-500">{email}</p>
                </TD>
                <TD>
                  {plan} <Badge>{s.audience.toLowerCase()}</Badge>
                </TD>
                <TD>
                  <StatusBadge status={s.status} />
                  {s.grantedBy && <Badge tone="purple">Complimentary</Badge>}
                  {s.cancelledAt && s.status === "ACTIVE" && <p className="text-xs text-slate-500">Won&apos;t renew</p>}
                </TD>
                <TD className="whitespace-nowrap text-xs">
                  {prettyDate(s.startsAt)} → {prettyDate(s.endsAt)}
                </TD>
                <TD className="text-right">
                  <Money paise={s.pricePaid} />
                </TD>
                <TD className="text-right">
                  {s.status === "ACTIVE" && canUsers && (
                    <ActionButton url={`/api/admin/subscriptions/${s.id}/cancel`} label="Cancel" danger confirm="Cancel this subscription now? Benefits end immediately." note={{ field: "reason", label: "Reason", required: true }} success="Subscription cancelled" />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/subscriptions" query={query} />
    </>
  );
}
