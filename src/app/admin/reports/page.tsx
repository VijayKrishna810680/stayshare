import Link from "next/link";
import { pageUser } from "@/lib/auth/page";
import { formatINR } from "@/lib/money";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { ExportButtons, FilterBar, type FilterField } from "@/components/admin/widgets";
import { cn } from "@/lib/cn";
import { getReport, parseReportFilters, REPORTS, type FilterKey } from "@/services/reports";
import { cityOptions, one, ownerOptions, propertyOptions, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

const BOOKING_STATUSES = ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT", "COMPLETED", "PAYMENT_PENDING", "CANCELLED", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "NO_SHOW", "REJECTED"];
const TICKET_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "WAITING_FOR_PROPERTY", "RESOLVED", "CLOSED"];
const SUB_STATUSES = ["ACTIVE", "PENDING_PAYMENT", "EXPIRED", "CANCELLED"];
const opt = (v: string[]) => v.map((x) => ({ value: x, label: x.replace(/_/g, " ").toLowerCase() }));

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: "reports.view" });
  const sp = await searchParams;
  const available = REPORTS.filter((r) => !r.financial || u.has("reports.financial"));
  const rep = getReport(one(sp.report)) ?? available[0]!;
  const locked = rep.financial && !u.has("reports.financial");
  const q = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  const f = parseReportFilters(q);
  const [cities, props, owners] = await Promise.all([cityOptions(), propertyOptions(), ownerOptions()]);
  const statusOpts = rep.key === "support" ? TICKET_STATUSES : rep.key === "subscriptions" ? SUB_STATUSES : BOOKING_STATUSES;
  const all: Record<FilterKey, FilterField[]> = {
    date: [
      { name: "from", label: "From", type: "date" },
      { name: "to", label: "To", type: "date" },
    ],
    city: [{ name: "city", label: "City", type: "select", options: cities }],
    property: [{ name: "property", label: "Property", type: "select", options: props }],
    owner: [{ name: "owner", label: "Owner", type: "select", options: owners }],
    status: [{ name: "status", label: "Status", type: "select", options: opt(statusOpts) }],
    category: [{ name: "category", label: "Room category", type: "select", options: opt(["PRIVATE", "SHARED", "FAMILY", "DORMITORY"]) }],
    sharing: [{ name: "sharing", label: "Sharing", type: "select", options: [1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => ({ value: String(n), label: `${n}-sharing` })) }],
    paymentStatus: [{ name: "paymentStatus", label: "Payment status", type: "select", options: opt(["CAPTURED", "PENDING", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED", "CREATED", "CANCELLED"]) }],
    unit: [{ name: "unit", label: "Unit", type: "select", options: [{ value: "BED", label: "Bed" }, { value: "ROOM", label: "Entire room" }] }],
  };
  const fields = rep.filters.flatMap((k) => all[k]);
  const rows = locked ? [] : await rep.run(f);
  const preview = rows.slice(0, 200);
  const exportQs = new URLSearchParams(Object.entries({ from: f.from, to: f.to, city: q.city, property: q.property, owner: q.owner, status: q.status, category: q.category, sharing: q.sharing, paymentStatus: q.paymentStatus, unit: q.unit }).filter(([, v]) => v) as [string, string][]).toString();
  const totals = rep.columns.filter((c) => c.money).map((c) => ({ label: c.label, value: rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) }));
  const groups = [...new Set(available.map((r) => r.group))];

  return (
    <>
      <PageHeader title="Reports" description="Filter, preview and download any report as PDF, CSV or Excel. Money is in rupees; booking reports use the booking date, occupancy reports use stay nights in the range." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Reports" className="space-y-4">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</p>
              <ul>
                {available
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <li key={r.key}>
                      <Link href={`/admin/reports?report=${r.key}&from=${f.from}&to=${f.to}`} aria-current={r.key === rep.key ? "page" : undefined} className={cn("block rounded-lg px-2 py-1.5 text-sm", r.key === rep.key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100")}>
                        {r.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {available.length < REPORTS.length && <p className="px-2 text-xs text-slate-500">Financial reports are hidden — they need the “reports.financial” permission.</p>}
        </nav>
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{rep.label}</h2>
              <p className="text-sm text-slate-500">{rep.description}</p>
            </div>
            {!locked && <ExportButtons href={`/api/admin/reports/${rep.key}?${exportQs}`} />}
          </div>
          <FilterBar key={rep.key} fields={fields} />
          {locked ? (
            <Alert tone="warn">You need the reports.financial permission to view this report.</Alert>
          ) : !rows.length ? (
            <EmptyState title="No data for these filters" description="Try widening the date range or clearing filters." />
          ) : (
            <>
              {totals.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {totals.slice(0, 6).map((t) => (
                    <div key={t.label} className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                      <span className="text-slate-500">{t.label}: </span>
                      <span className="font-semibold tabular-nums">{formatINR(t.value)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Card className="overflow-hidden">
                <div className="max-h-[65vh] overflow-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        {rep.columns.map((c) => (
                          <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2.5", (c.money || c.pct) && "text-right")}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/60">
                          {rep.columns.map((c) => {
                            const v = r[c.key];
                            return (
                              <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", (c.money || c.pct || typeof v === "number") && "text-right tabular-nums")}>
                                {v == null || v === "" ? "—" : c.money ? formatINR(Number(v)) : c.pct ? `${v}%` : String(v)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="mt-2 text-xs text-slate-500">
                {rows.length} row{rows.length === 1 ? "" : "s"} · {f.from} to {f.to}
                {rows.length > preview.length && ` · showing first ${preview.length}; download for the full report`}
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
