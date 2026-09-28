import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bookings, ownerEarnings, properties } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { addDays, todayIST } from "@/lib/dates";
import { REPORT_COLUMNS, bookingsReport, occupancyReport, revenueReport } from "@/services/owner-reports";
import { EmptyState, Input, Money, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ExportLinks, TabNav } from "@/components/owner/common";
import { humanize } from "@/components/owner/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

type Type = "occupancy" | "bookings" | "revenue";

export default async function Reports({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string; propertyId?: string; status?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const sp = await searchParams;
  const type: Type = sp.type === "occupancy" || sp.type === "revenue" ? sp.type : "bookings";
  const d = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const to = d(sp.to) ?? addDays(todayIST(), 1);
  const from = d(sp.from) ?? addDays(to, -30);
  const props = await db.select({ id: properties.id, name: properties.name }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt))).orderBy(asc(properties.name));
  const propertyId = props.some((p) => p.id === sp.propertyId) ? sp.propertyId : undefined;
  const statuses: readonly string[] = type === "bookings" ? bookings.status.enumValues : type === "revenue" ? ownerEarnings.status.enumValues : [];
  const status = statuses.includes(sp.status ?? "") ? sp.status : undefined;
  const f = { from, to, propertyId, status };
  const rows: Record<string, unknown>[] = type === "occupancy" ? await occupancyReport(u.id, f) : type === "revenue" ? await revenueReport(u.id, f) : await bookingsReport(u.id, f);
  const cols = REPORT_COLUMNS[type];
  const qs = new URLSearchParams(Object.entries({ type, from, to, propertyId, status }).filter(([, v]) => v) as [string, string][]).toString();
  const totals = type === "revenue" ? (["bookings", "gross", "commission", "net"] as const).map((k) => [k, rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)] as const) : type === "bookings" ? ([["bookings", rows.length], ["total", rows.reduce((a, r) => a + Number(r.total ?? 0), 0)]] as const) : null;
  return (
    <>
      <PageHeader title="Reports" description="Occupancy, bookings and revenue by property. Export to CSV, Excel or PDF." actions={<ExportLinks href={`/api/owner/reports?${qs}`} />} />
      <TabNav
        tabs={[
          { key: "bookings", label: "Bookings" },
          { key: "occupancy", label: "Occupancy" },
          { key: "revenue", label: "Revenue" },
        ]}
        active={type}
        basePath="/owner/reports"
        param="type"
        query={{ from, to, propertyId }}
      />
      <form className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_160px_1fr_1fr_auto]">
        <input type="hidden" name="type" value={type} />
        <Input type="date" name="from" defaultValue={from} aria-label="From date" />
        <Input type="date" name="to" defaultValue={to} aria-label="To date" />
        <Select name="propertyId" defaultValue={propertyId ?? ""} aria-label="Property">
          <option value="">All properties</option>
          {props.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" disabled={!statuses.length}>
          <option value="">{statuses.length ? "All statuses" : "—"}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <button className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Apply</button>
      </form>
      <p className="mb-3 text-sm text-slate-500">
        {type === "occupancy" ? "Bed-nights" : "Check-ins"} from {from} to {to} (end date exclusive) · {rows.length} rows
      </p>
      {totals && (
        <div className="mb-4 flex flex-wrap gap-3">
          {totals.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white px-4 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">{humanize(k)}</p>
              <p className="font-semibold">{k === "bookings" ? v : <Money paise={v} />}</p>
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No data for these filters" description="Try a wider date range." />
      ) : (
        <Table>
          <THead>
            <tr>
              {cols.map((c) => (
                <TH key={c.key} className={"money" in c && c.money ? "text-right" : undefined}>
                  {c.label}
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {rows.slice(0, 500).map((r, i) => (
              <TR key={i}>
                {cols.map((c) => (
                  <TD key={c.key} className={"money" in c && c.money ? "text-right" : "text-sm"}>
                    {"money" in c && c.money ? (
                      <Money paise={Number(r[c.key] ?? 0)} />
                    ) : c.key === "occupancyPct" ? (
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                          <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Number(r[c.key]))}%` }} />
                        </span>
                        {String(r[c.key])}%
                      </span>
                    ) : c.key === "status" ? (
                      humanize(String(r[c.key]))
                    ) : (
                      String(r[c.key] ?? "—")
                    )}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {rows.length > 500 && <p className="mt-2 text-xs text-slate-500">Showing the first 500 rows — export for the full report.</p>}
    </>
  );
}
