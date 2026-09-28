import Link from "next/link";
import { and, count, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { BedDouble, CalendarCheck, CalendarClock, Sparkles, Users, Wrench } from "lucide-react";
import { db } from "@/db";
import { beds, maintenanceIssues, rooms } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { inIds } from "@/lib/owner-access";
import { deskContext, toLookupRows } from "@/lib/owner-data";
import { prettyDate, todayIST } from "@/lib/dates";
import { arrivalsDepartures } from "@/services/owner-reports";
import { Card, CardBody, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { PropertyPicker } from "@/components/staff/board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

export default async function StaffHome({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await pageUser({ role: ["STAFF", "OWNER"] });
  const sp = await searchParams;
  const ctx = await deskContext(u, sp.p);
  if (!ctx.properties.length) return <EmptyState title="No properties assigned" description="Ask your property owner to assign you to a property." />;
  const today = todayIST();
  const ad = await arrivalsDepartures(ctx.scope, today);
  const [cleaning] = await db
    .select({ n: count(rooms.id) })
    .from(rooms)
    .where(and(inIds(rooms.propertyId, ctx.scope), isNull(rooms.deletedAt), eq(rooms.active, true), or(ne(rooms.cleaningStatus, "CLEAN"), inArray(rooms.id, db.select({ id: beds.roomId }).from(beds).where(eq(beds.status, "CLEANING"))))));
  const [maint] = await db.select({ n: count(maintenanceIssues.id) }).from(maintenanceIssues).where(and(inIds(maintenanceIssues.propertyId, ctx.scope), ne(maintenanceIssues.status, "RESOLVED")));
  const q = ctx.selected ? `?p=${ctx.selected}` : "";
  return (
    <>
      <PageHeader title={`Good day, ${u.name.split(" ")[0]}`} description={prettyDate(today)} actions={<PropertyPicker properties={ctx.properties} value={ctx.selected ?? ""} allowAll />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Arrivals today" value={ad.arrivals.length} icon={<CalendarCheck className="h-5 w-5" />} />
        <StatCard label="Departures due" value={ad.departures.length} icon={<CalendarClock className="h-5 w-5" />} tone="accent" />
        <StatCard label="Guests in house" value={ad.inHouse.length} icon={<Users className="h-5 w-5" />} tone="slate" />
        <StatCard label="Rooms to clean" value={Number(cleaning?.n ?? 0)} icon={<Sparkles className="h-5 w-5" />} tone="green" />
        <StatCard label="Open maintenance" value={Number(maint?.n ?? 0)} icon={<Wrench className="h-5 w-5" />} tone="red" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <LinkButton href={`/staff/check-in${q}`} size="lg">
          <CalendarCheck className="h-5 w-5" /> Check in a guest
        </LinkButton>
        <LinkButton href={`/staff/check-out${q}`} size="lg" variant="outline">
          <CalendarClock className="h-5 w-5" /> Check out
        </LinkButton>
        <LinkButton href={`/staff/board${q}`} size="lg" variant="outline">
          <BedDouble className="h-5 w-5" /> Rooms & beds
        </LinkButton>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <GuestCard title="Arriving today" rows={toLookupRows(ad.arrivals)} href="/staff/check-in" action="Check in" empty="No arrivals today" />
        <GuestCard title="Departing" rows={toLookupRows(ad.departures)} href="/staff/check-out" action="Check out" empty="No departures due" />
        <GuestCard title="In house" rows={toLookupRows(ad.inHouse)} href="/staff/check-out" action="Check out" empty="No guests checked in" />
      </div>
    </>
  );
}

function GuestCard({ title, rows, href, action, empty }: { title: string; rows: ReturnType<typeof toLookupRows>; href: string; action: string; empty: string }) {
  return (
    <Card>
      <CardHeader title={`${title} (${rows.length})`} />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">{empty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.guestName}</p>
                  <p className="truncate text-xs text-slate-500">
                    Room {r.roomNumber} · {r.propertyName} · until {r.checkOut}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={r.status} />
                  <Link href={`${href}?q=${encodeURIComponent(r.bookingNumber)}`} className="text-xs font-medium text-brand-700 hover:underline">
                    {action}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
