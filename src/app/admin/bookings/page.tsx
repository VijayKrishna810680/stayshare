import Link from "next/link";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { bookingModifications, bookings, checkIns, checkOuts, cities, properties, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { Badge, EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LinkTabs } from "@/components/admin/ui";
import { ActionButton, ExportButtons, FilterBar } from "@/components/admin/widgets";
import { cityOptions, one, ownerOptions, pageArgs, propertyOptions, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

const STATUSES = ["PAYMENT_PENDING", "CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT", "COMPLETED", "CANCELLATION_REQUESTED", "CANCELLED", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "NO_SHOW", "REJECTED", "INVENTORY_LOCKED", "DRAFT"] as const;
const opt = (v: readonly string[]) => v.map((x) => ({ value: x, label: x.replace(/_/g, " ").toLowerCase() }));

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: "bookings.view" });
  const sp = await searchParams;
  const tab = one(sp.tab) || "all";
  const [pendingMods] = await db.select({ n: sql<number>`count(*)::int` }).from(bookingModifications).where(eq(bookingModifications.status, "REQUESTED"));
  return (
    <>
      <PageHeader title="Bookings" description="Search every booking, review stays, check-in/out records and change requests." />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "all", label: "All bookings", href: "/admin/bookings" },
          { key: "stays", label: "Check-ins & check-outs", href: "/admin/bookings?tab=stays" },
          { key: "mods", label: "Modification requests", href: "/admin/bookings?tab=mods", count: pendingMods?.n ?? 0 },
        ]}
      />
      {tab === "stays" ? <StaysLog sp={sp} /> : tab === "mods" ? <Modifications canManage={u.has("bookings.manage")} /> : <AllBookings sp={sp} canReports={u.has("reports.view")} />}
    </>
  );
}

async function AllBookings({ sp, canReports }: { sp: Record<string, string | string[] | undefined>; canReports: boolean }) {
  const { page, pageSize, offset } = pageArgs(sp, 25);
  const q = one(sp.q).trim();
  const dateField = one(sp.dateField) === "booked" ? sql`(coalesce(${bookings.confirmedAt}, ${bookings.createdAt}) AT TIME ZONE 'Asia/Kolkata')::date` : sql`${bookings.checkIn}`;
  const conds: SQL[] = [];
  if (q) {
    const digits = q.replace(/\D/g, "");
    conds.push(or(ilike(bookings.bookingNumber, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`), ...(digits.length >= 4 ? [ilike(users.phone, `%${digits}%`)] : []))!);
  }
  if (one(sp.from)) conds.push(sql`${dateField} >= ${one(sp.from)}::date`);
  if (one(sp.to)) conds.push(sql`${dateField} <= ${one(sp.to)}::date`);
  if (one(sp.city)) conds.push(eq(properties.cityId, one(sp.city)));
  if (one(sp.property)) conds.push(eq(properties.id, one(sp.property)));
  if (one(sp.owner)) conds.push(eq(properties.ownerId, one(sp.owner)));
  if (one(sp.status)) conds.push(eq(bookings.status, one(sp.status) as (typeof STATUSES)[number]));
  if (one(sp.unit)) conds.push(eq(bookings.unit, one(sp.unit) as "BED" | "ROOM"));
  if (one(sp.sharing)) conds.push(eq(rooms.sharingCapacity, Number(one(sp.sharing))));
  if (one(sp.paymentStatus)) conds.push(sql`exists (select 1 from payments pay where pay.booking_id = ${bookings.id} and pay.status::text = ${one(sp.paymentStatus)})`);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total, cities_, props, owners] = await Promise.all([
    db
      .select({ b: bookings, customer: users.name, phone: users.phone, email: users.email, prop: properties.name, city: cities.name, roomNo: rooms.roomNumber, sharing: rooms.sharingCapacity })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.customerId))
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .innerJoin(cities, eq(cities.id, properties.cityId))
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .where(where)
      .orderBy(desc(bookings.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.customerId))
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    cityOptions(),
    propertyOptions(),
    ownerOptions(),
  ]);
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  const exportQs = new URLSearchParams(Object.entries({ from: one(sp.from), to: one(sp.to), city: one(sp.city), property: one(sp.property), owner: one(sp.owner), status: one(sp.status), unit: one(sp.unit), sharing: one(sp.sharing), paymentStatus: one(sp.paymentStatus) }).filter(([, v]) => v)).toString();
  return (
    <>
      <FilterBar
        fields={[
          { name: "q", label: "Search", type: "text", placeholder: "Booking #, phone, email or name" },
          { name: "dateField", label: "Date type", type: "select", options: [{ value: "checkin", label: "Check-in date" }, { value: "booked", label: "Booked on" }] },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
          { name: "city", label: "City", type: "select", options: cities_ },
          { name: "property", label: "Property", type: "select", options: props },
          { name: "owner", label: "Owner", type: "select", options: owners },
          { name: "status", label: "Status", type: "select", options: opt(STATUSES) },
          { name: "unit", label: "Unit", type: "select", options: [{ value: "BED", label: "Bed" }, { value: "ROOM", label: "Entire room" }] },
          { name: "sharing", label: "Sharing", type: "select", options: [1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: `${n}-sharing` })) },
          { name: "paymentStatus", label: "Payment", type: "select", options: opt(["CAPTURED", "PENDING", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]) },
        ]}
      />
      {canReports && (
        <div className="mb-3 flex items-center justify-end gap-2 text-sm text-slate-500">
          Export (booked-on dates): <ExportButtons href={`/api/admin/reports/bookings?${exportQs}`} />
        </div>
      )}
      {!rows.length ? (
        <EmptyState title="No bookings found" description="Try a different search or filters." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Booking</TH>
              <TH>Guest</TH>
              <TH>Property</TH>
              <TH>Stay</TH>
              <TH>Status</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Paid</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ b, customer, phone, email, prop, city, roomNo, sharing }) => (
              <TR key={b.id}>
                <TD>
                  <Link href={`/admin/bookings/${b.id}`} className="font-medium text-brand-700 hover:underline">
                    {b.bookingNumber}
                  </Link>
                  <p className="text-xs text-slate-500">{prettyDateTime(b.createdAt)}</p>
                </TD>
                <TD>
                  <p>{customer}</p>
                  <p className="text-xs text-slate-500">{phone ?? email}</p>
                </TD>
                <TD>
                  <p className="max-w-[220px] truncate">{prop}</p>
                  <p className="text-xs text-slate-500">
                    {city} · Room {roomNo} · {b.unit === "BED" ? `${b.bedsCount} bed${b.bedsCount > 1 ? "s" : ""}` : "entire room"} · {sharing}-share
                  </p>
                </TD>
                <TD className="whitespace-nowrap text-xs">
                  {prettyDate(b.checkIn)} → {prettyDate(b.checkOut)}
                  <p className="text-slate-500">
                    {b.nights} night{b.nights > 1 ? "s" : ""} · {b.adults + b.children} guest{b.adults + b.children > 1 ? "s" : ""}
                  </p>
                </TD>
                <TD>
                  <StatusBadge status={b.status} />
                  {b.payAtProperty && <Badge tone="amber">Pay at property</Badge>}
                </TD>
                <TD className="text-right">
                  <Money paise={b.totalAmount} />
                </TD>
                <TD className="text-right">
                  <Money paise={b.paidAmount} />
                  {b.refundedAmount > 0 && (
                    <p className="text-xs text-purple-700">
                      −<Money paise={b.refundedAmount} /> refunded
                    </p>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/bookings" query={query} />
    </>
  );
}

async function StaysLog({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const staff = alias(users, "staff");
  const staff2 = alias(users, "staff2");
  const conds: SQL[] = [];
  if (one(sp.from)) conds.push(gte(bookings.checkIn, one(sp.from)));
  if (one(sp.to)) conds.push(lte(bookings.checkIn, one(sp.to)));
  if (one(sp.property)) conds.push(eq(properties.id, one(sp.property)));
  const [rows, props] = await Promise.all([
    db
      .select({ b: bookings, prop: properties.name, guest: users.name, ci: checkIns, co: checkOuts, ciStaff: staff.name, coStaff: staff2.name })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .innerJoin(users, eq(users.id, bookings.customerId))
      .leftJoin(checkIns, eq(checkIns.bookingId, bookings.id))
      .leftJoin(checkOuts, eq(checkOuts.bookingId, bookings.id))
      .leftJoin(staff, eq(staff.id, checkIns.staffId))
      .leftJoin(staff2, eq(staff2.id, checkOuts.staffId))
      .where(and(or(sql`${checkIns.id} is not null`, sql`${checkOuts.id} is not null`, inArray(bookings.status, ["CHECKED_IN", "CHECKED_OUT", "COMPLETED"])), ...conds))
      .orderBy(desc(sql`coalesce(${checkOuts.actualTime}, ${checkIns.actualTime}, ${bookings.updatedAt})`))
      .limit(200),
    propertyOptions(),
  ]);
  return (
    <>
      <FilterBar
        fields={[
          { name: "from", label: "Check-in from", type: "date" },
          { name: "to", label: "Check-in to", type: "date" },
          { name: "property", label: "Property", type: "select", options: props },
        ]}
      />
      {!rows.length ? (
        <EmptyState title="No check-in or check-out records yet" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Booking</TH>
              <TH>Property</TH>
              <TH>Check-in</TH>
              <TH>ID verified</TH>
              <TH>Check-out</TH>
              <TH className="text-right">Damages / extras</TH>
              <TH className="text-right">Deposit refund</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ b, prop, guest, ci, co, ciStaff, coStaff }) => (
              <TR key={b.id}>
                <TD>
                  <Link href={`/admin/bookings/${b.id}`} className="font-medium text-brand-700 hover:underline">
                    {b.bookingNumber}
                  </Link>
                  <p className="text-xs text-slate-500">{guest}</p>
                </TD>
                <TD className="text-sm">{prop}</TD>
                <TD className="whitespace-nowrap text-xs">
                  {ci ? prettyDateTime(ci.actualTime) : <StatusBadge status={b.status} />}
                  {ciStaff && <p className="text-slate-500">by {ciStaff}</p>}
                </TD>
                <TD className="text-xs">{ci ? (ci.idVerified ? `${ci.idDocType ?? "ID"} ••${ci.idLast4 ?? ""}` : "No") : "—"}</TD>
                <TD className="whitespace-nowrap text-xs">
                  {co ? prettyDateTime(co.actualTime) : "—"}
                  {coStaff && <p className="text-slate-500">by {coStaff}</p>}
                </TD>
                <TD className="text-right text-xs">{co ? <Money paise={co.damageCharges + co.extraCharges} /> : "—"}</TD>
                <TD className="text-right text-xs">{co ? <Money paise={co.depositRefund} /> : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

async function Modifications({ canManage }: { canManage: boolean }) {
  const rows = await db
    .select({ m: bookingModifications, bn: bookings.bookingNumber, bookingId: bookings.id, guest: users.name })
    .from(bookingModifications)
    .innerJoin(bookings, eq(bookings.id, bookingModifications.bookingId))
    .innerJoin(users, eq(users.id, bookings.customerId))
    .orderBy(sql`case when ${bookingModifications.status} = 'REQUESTED' then 0 else 1 end`, desc(bookingModifications.createdAt))
    .limit(200);
  if (!rows.length) return <EmptyState title="No modification requests" />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Requested</TH>
          <TH>Booking</TH>
          <TH>Type</TH>
          <TH>Details</TH>
          <TH className="text-right">Price difference</TH>
          <TH>Status</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map(({ m, bn, bookingId, guest }) => (
          <TR key={m.id}>
            <TD className="whitespace-nowrap text-xs">{prettyDateTime(m.createdAt)}</TD>
            <TD>
              <Link href={`/admin/bookings/${bookingId}`} className="font-medium text-brand-700 hover:underline">
                {bn}
              </Link>
              <p className="text-xs text-slate-500">{guest}</p>
            </TD>
            <TD className="text-xs">{m.type.replace(/_/g, " ").toLowerCase()}</TD>
            <TD className="max-w-xs text-xs text-slate-600">{describeMod(m.payload)}</TD>
            <TD className="text-right">
              <Money paise={m.priceDiff} />
            </TD>
            <TD>
              <StatusBadge status={m.status} />
              {m.note && <p className="text-xs text-slate-500">{m.note}</p>}
            </TD>
            <TD className="space-x-1 whitespace-nowrap text-right">
              {m.status === "REQUESTED" && canManage && (
                <>
                  <ActionButton url={`/api/admin/modifications/${m.id}`} body={{ approve: true }} label="Approve" variant="primary" note={{ field: "note", label: "Note (optional)" }} success="Approved" />
                  <ActionButton url={`/api/admin/modifications/${m.id}`} body={{ approve: false }} label="Reject" danger note={{ field: "note", label: "Reason", required: true }} success="Rejected" />
                </>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function describeMod(p: Record<string, unknown>) {
  const parts: string[] = [];
  if (p.newCheckOut) parts.push(`new check-out ${p.newCheckOut}`);
  if (p.time) parts.push(`at ${p.time}`);
  if (p.unit) parts.push(`as ${String(p.unit).toLowerCase()}`);
  if (p.guest && typeof p.guest === "object") parts.push(`guest ${(p.guest as { name?: string }).name ?? ""}`);
  if (p.extraNights) parts.push(`${p.extraNights} extra nights`);
  return parts.join(" · ") || "—";
}
