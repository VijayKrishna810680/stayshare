import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { IndianRupee } from "lucide-react";
import { db } from "@/db";
import { bookings, ownerEarnings, properties } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { ownerBalance } from "@/services/settlement";
import { EmptyState, Money, PageHeader, Pagination, Select, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ExportLinks } from "@/components/owner/common";

export const dynamic = "force-dynamic";
export const metadata = { title: "Earnings" };

const STATUSES = ["PENDING", "ELIGIBLE", "ON_HOLD", "IN_PAYOUT", "PAID", "REVERSED"] as const;
const PAGE = 25;

export default async function Earnings({ searchParams }: { searchParams: Promise<{ propertyId?: string; status?: string; page?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const bal = await ownerBalance(u.id);
  const props = await db.select({ id: properties.id, name: properties.name }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt))).orderBy(asc(properties.name));
  const propertyId = props.some((p) => p.id === sp.propertyId) ? sp.propertyId : undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const where = and(eq(ownerEarnings.ownerId, u.id), propertyId ? eq(ownerEarnings.propertyId, propertyId) : undefined, status ? eq(ownerEarnings.status, status) : undefined);
  const [{ total }] = (await db.select({ total: count(ownerEarnings.id) }).from(ownerEarnings).where(where)) as [{ total: number }];
  const rows = await db
    .select({ e: ownerEarnings, bookingNumber: bookings.bookingNumber, checkIn: bookings.checkIn, checkOut: bookings.checkOut, property: properties.name })
    .from(ownerEarnings)
    .innerJoin(bookings, eq(bookings.id, ownerEarnings.bookingId))
    .innerJoin(properties, eq(properties.id, ownerEarnings.propertyId))
    .where(where)
    .orderBy(desc(ownerEarnings.createdAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);
  const q = new URLSearchParams(Object.entries({ propertyId, status }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Earnings" description="Per-booking settlement breakdown. Earnings become eligible for payout a few days after check-out." actions={<ExportLinks href={`/api/owner/earnings/export${q ? `?${q}` : ""}`} label="Statement" />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Pending (stay not settled)" value={<Money paise={bal.pending} />} tone="slate" icon={<IndianRupee className="h-5 w-5" />} />
        <StatCard label="Eligible for payout" value={<Money paise={bal.eligible} />} tone="green" />
        <StatCard label="In payout" value={<Money paise={bal.inPayout} />} />
        <StatCard label="Paid out" value={<Money paise={bal.paid} />} tone="accent" />
        <StatCard label="On hold" value={<Money paise={bal.onHold} />} tone="red" />
      </div>
      <form className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Select name="propertyId" defaultValue={propertyId ?? ""} aria-label="Property" className="sm:max-w-xs">
          <option value="">All properties</option>
          {props.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="sm:max-w-[200px]">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </Select>
        <button className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">Filter</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No earnings yet" description="Earnings are created when bookings at your properties are paid." />
      ) : (
        <Table className="[&_table]:min-w-[1100px]">
          <THead>
            <tr>
              <TH>Booking</TH>
              <TH className="text-right">Gross</TH>
              <TH className="text-right">Taxes</TH>
              <TH className="text-right">Commission</TH>
              <TH className="text-right">Gateway fee</TH>
              <TH className="text-right">Discounts (platform / property)</TH>
              <TH className="text-right">Penalties</TH>
              <TH className="text-right">Refund deductions</TH>
              <TH className="text-right">Net payable</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ e, bookingNumber, checkIn, checkOut, property }) => (
              <TR key={e.id}>
                <TD>
                  <p className="font-medium">{bookingNumber}</p>
                  <p className="text-xs text-slate-500">
                    {property} · {checkIn} → {checkOut}
                  </p>
                </TD>
                <TD className="text-right"><Money paise={e.grossBookingValue} /></TD>
                <TD className="text-right"><Money paise={e.taxes} /></TD>
                <TD className="text-right">
                  <Money paise={e.commission} />
                  <p className="text-xs text-slate-500">{e.commissionBps / 100}%</p>
                </TD>
                <TD className="text-right"><Money paise={e.gatewayFee} /></TD>
                <TD className="text-right text-xs">
                  <Money paise={e.platformDiscount} /> / <Money paise={e.propertyDiscount} />
                </TD>
                <TD className="text-right"><Money paise={e.penalties} /></TD>
                <TD className="text-right"><Money paise={e.refundDeduction} /></TD>
                <TD className="text-right font-semibold"><Money paise={e.netPayable} /></TD>
                <TD>
                  <StatusBadge status={e.status} />
                  {e.eligibleAt && e.status === "PENDING" && <p className="text-xs text-slate-500">from {e.eligibleAt.toLocaleDateString("en-IN")}</p>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE} total={Number(total)} basePath="/owner/earnings" query={{ propertyId, status }} />
    </>
  );
}
