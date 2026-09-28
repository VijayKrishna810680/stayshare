import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { priceHistory, properties, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar } from "@/components/admin/widgets";
import { one, pageArgs, usersWithRole, type SearchParams } from "../../_lib/query";
import { PricingTabs } from "../tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price history" };

const NON_MONEY = ["daysOfWeek", "unit", "scope", "scopeId", "adjustmentType", "ruleType", "active", "startDate", "endDate", "minNights", "priority", "discountType", "validFrom", "validTo", "durationDays", "benefits", "isExemptionRule", "minNightsExempt", "fees.convenienceType", "fees.gatewayFeeBorneBy", "payout.settlementDaysAfterCheckout"];
const isBps = (f: string) => /Bps$/.test(f) || f === "rateBps";

function Val({ field, v, adj }: { field: string; v: string | null; adj?: boolean }) {
  if (v == null) return <span className="text-slate-400">—</span>;
  if (isBps(field)) return <span className="tabular-nums">{Number(v) / 100}%</span>;
  if (field === "value" && adj) return <span className="tabular-nums">{v}</span>;
  if (!NON_MONEY.includes(field) && /^-?\d+$/.test(v)) return <Money paise={Number(v)} />;
  return <span className="break-all text-xs">{v.length > 60 ? v.slice(0, 60) + "…" : v}</span>;
}

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  await pageUser({ perm: "pricing.manage" });
  const sp = await searchParams;
  const { page, pageSize, offset } = pageArgs(sp, 50);
  const conds: SQL[] = [];
  if (one(sp.type)) conds.push(eq(priceHistory.entityType, one(sp.type)));
  if (one(sp.entity)) conds.push(eq(priceHistory.entityId, one(sp.entity)));
  if (one(sp.field)) conds.push(ilike(priceHistory.field, `%${one(sp.field)}%`));
  if (one(sp.by)) conds.push(eq(priceHistory.changedBy, one(sp.by)));
  if (one(sp.from)) conds.push(gte(priceHistory.createdAt, new Date(`${one(sp.from)}T00:00:00+05:30`)));
  if (one(sp.to)) conds.push(lte(priceHistory.createdAt, new Date(`${one(sp.to)}T23:59:59+05:30`)));
  const where = conds.length ? and(...conds) : undefined;
  const rm = alias(rooms, "rm");
  const [rows, total, admins, supers] = await Promise.all([
    db
      .select({ h: priceHistory, by: users.name, roomNo: rm.roomNumber, prop: properties.name })
      .from(priceHistory)
      .leftJoin(users, eq(users.id, priceHistory.changedBy))
      .leftJoin(rm, sql`${priceHistory.entityType} = 'ROOM' and ${rm.id}::text = ${priceHistory.entityId}`)
      .leftJoin(properties, eq(properties.id, rm.propertyId))
      .where(where)
      .orderBy(desc(priceHistory.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(priceHistory)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    usersWithRole("ADMIN"),
    usersWithRole("SUPER_ADMIN"),
  ]);
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader title="Pricing" description="Every change to room prices, rules, taxes, commissions, coupons, subscription plans and fee settings — with who changed it, when and why." />
      <PricingTabs active="history" />
      <FilterBar
        fields={[
          { name: "type", label: "Entity", type: "select", options: ["ROOM", "PRICING_RULE", "TAX_RULE", "COMMISSION", "COUPON", "SUBSCRIPTION_PLAN", "SETTING"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase() })) },
          { name: "field", label: "Field", type: "text", placeholder: "e.g. nightlyBed" },
          { name: "by", label: "Changed by", type: "select", options: [...supers, ...admins].map((u) => ({ value: u.id, label: u.name })) },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      {!rows.length ? (
        <EmptyState title="No price changes found" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Entity</TH>
              <TH>Field</TH>
              <TH className="text-right">Old</TH>
              <TH className="text-right">New</TH>
              <TH>Effective</TH>
              <TH>Reason</TH>
              <TH>By</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ h, by, roomNo, prop }) => (
              <TR key={h.id}>
                <TD className="whitespace-nowrap text-xs">{prettyDateTime(h.createdAt)}</TD>
                <TD>
                  <StatusBadge status={h.entityType} />
                  <p className="mt-0.5 text-xs text-slate-500">
                    {h.entityType === "ROOM" ? (
                      <Link className="hover:underline" href={`/admin/pricing/rooms/${h.entityId}`}>
                        {prop} · {roomNo}
                      </Link>
                    ) : (
                      <Link className="hover:underline" href={`?type=${h.entityType}&entity=${h.entityId}`}>
                        {h.entityId.slice(0, 24)}
                      </Link>
                    )}
                  </p>
                </TD>
                <TD>
                  <code className="text-xs">{h.field}</code>
                </TD>
                <TD className="text-right">
                  <Val field={h.field} v={h.oldValue} adj={h.entityType === "PRICING_RULE"} />
                </TD>
                <TD className="text-right">
                  <Val field={h.field} v={h.newValue} adj={h.entityType === "PRICING_RULE"} />
                </TD>
                <TD className="whitespace-nowrap text-xs">
                  {h.effectiveFrom ? prettyDateTime(h.effectiveFrom) : "—"}
                  {h.effectiveTo && ` → ${prettyDateTime(h.effectiveTo)}`}
                </TD>
                <TD className="max-w-xs text-xs">{h.reason}</TD>
                <TD className="text-xs">{by ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/pricing/history" query={query} />
    </>
  );
}
