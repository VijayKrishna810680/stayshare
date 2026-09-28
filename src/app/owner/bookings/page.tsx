import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { CalendarCheck } from "lucide-react";
import { db } from "@/db";
import { bookingModifications, bookings, properties, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { todayIST } from "@/lib/dates";
import { EmptyState, Input, PageHeader, Pagination, Select } from "@/components/ui";
import { BookingsTable } from "@/components/owner/bookings-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

const GROUPS: Record<string, { label: string; statuses: (typeof bookings.status.enumValues)[number][] }> = {
  upcoming: { label: "Upcoming", statuses: ["CONFIRMED", "CHECK_IN_PENDING"] },
  inhouse: { label: "Checked in", statuses: ["CHECKED_IN"] },
  completed: { label: "Completed", statuses: ["CHECKED_OUT", "COMPLETED"] },
  pending: { label: "Awaiting payment", statuses: ["PAYMENT_PENDING", "INVENTORY_LOCKED"] },
  cancelled: { label: "Cancelled / refunds", statuses: ["CANCELLATION_REQUESTED", "CANCELLED", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "REJECTED"] },
  noshow: { label: "No-show", statuses: ["NO_SHOW"] },
};
const PAGE = 20;

export default async function OwnerBookings({ searchParams }: { searchParams: Promise<{ propertyId?: string; status?: string; from?: string; to?: string; q?: string; page?: string; open?: string; mods?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const props = await db.select({ id: properties.id, name: properties.name }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt))).orderBy(asc(properties.name));
  const ids = props.map((p) => p.id);
  const propertyId = ids.includes(sp.propertyId ?? "") ? sp.propertyId! : undefined;
  const group = GROUPS[sp.status ?? ""];
  const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const from = date(sp.from);
  const to = date(sp.to);
  const pendingMods = sql<number>`(SELECT count(*)::int FROM ${bookingModifications} m WHERE m.booking_id = ${bookings.id} AND m.status = 'REQUESTED')`;
  const where = and(
    inArray(bookings.propertyId, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    propertyId ? eq(bookings.propertyId, propertyId) : undefined,
    group ? inArray(bookings.status, group.statuses) : sql`${bookings.status} <> 'DRAFT'`,
    from ? gte(bookings.checkIn, from) : undefined,
    to ? lte(bookings.checkIn, to) : undefined,
    sp.q ? or(ilike(bookings.bookingNumber, `%${sp.q}%`), ilike(users.name, `%${sp.q}%`)) : undefined,
    sp.mods === "1" ? sql`${pendingMods} > 0` : undefined,
  );
  const [{ total }] = (await db.select({ total: count(bookings.id) }).from(bookings).innerJoin(users, eq(users.id, bookings.customerId)).where(where)) as [{ total: number }];
  const rows = await db
    .select({ id: bookings.id, bookingNumber: bookings.bookingNumber, status: bookings.status, checkIn: bookings.checkIn, checkOut: bookings.checkOut, nights: bookings.nights, unit: bookings.unit, bedsCount: bookings.bedsCount, guestName: users.name, propertyName: properties.name, roomNumber: rooms.roomNumber, totalAmount: bookings.totalAmount, paidAmount: bookings.paidAmount, pendingMods })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.customerId))
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .where(where)
    .orderBy(desc(bookings.checkIn), desc(bookings.createdAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);
  const query = { propertyId, status: sp.status, from, to, q: sp.q, mods: sp.mods };
  return (
    <>
      <PageHeader title="Bookings" description="All bookings at your properties. Click a booking for guests, payments and requests." />
      <form className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_150px_150px_auto]" role="search">
        <Input name="q" defaultValue={sp.q} placeholder="Booking # or guest" aria-label="Search bookings" />
        <Select name="propertyId" defaultValue={propertyId ?? ""} aria-label="Property">
          <option value="">All properties</option>
          {props.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(GROUPS).map(([k, g]) => (
            <option key={k} value={k}>
              {g.label}
            </option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={from} aria-label="Check-in from" />
        <Input type="date" name="to" defaultValue={to} aria-label="Check-in to" />
        <div className="flex gap-2">
          <label className="flex items-center gap-1 whitespace-nowrap text-sm text-slate-600">
            <input type="checkbox" name="mods" value="1" defaultChecked={sp.mods === "1"} className="h-4 w-4 accent-brand-600" /> Requests
          </label>
          <button className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Filter</button>
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="No bookings found" description="Try different filters. New bookings appear here as soon as guests pay." />
      ) : (
        <BookingsTable rows={rows.map((r) => ({ ...r, pendingMods: Number(r.pendingMods) }))} today={todayIST()} openId={sp.open} />
      )}
      <Pagination page={page} pageSize={PAGE} total={Number(total)} basePath="/owner/bookings" query={query} />
    </>
  );
}
