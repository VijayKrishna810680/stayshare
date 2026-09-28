import Link from "next/link";
import { eq } from "drizzle-orm";
import { BedDouble, Building2, CalendarCheck, CalendarClock, IndianRupee, Landmark, LogIn, LogOut, Percent, Star, Ticket, Users, Wrench, Hourglass } from "lucide-react";
import { db } from "@/db";
import { ownerProfiles } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { ownerDashboard } from "@/services/owner-reports";
import { getActiveSubscription, ownerPropertyLimit } from "@/services/subscriptions";
import { prettyDate } from "@/lib/dates";
import { Alert, Card, CardBody, CardHeader, EmptyState, LinkButton, Money, PageHeader, StatCard, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function OwnerDashboard() {
  const u = await pageUser({ role: "OWNER" });
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, u.id));
  const d = await ownerDashboard(u.id);
  const sub = await getActiveSubscription(u.id, "OWNER");
  const limit = await ownerPropertyLimit(u.id);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${u.name.split(" ")[0]}`}
        description="Your business at a glance — today's movements, occupancy and earnings."
        actions={
          <>
            <LinkButton href="/owner/properties/new" variant="primary">
              <Building2 className="h-4 w-4" /> Add property
            </LinkButton>
            <LinkButton href="/owner/check-in" variant="outline">
              <LogIn className="h-4 w-4" /> Check-in
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 space-y-3">
        {op?.kycStatus !== "APPROVED" && (
          <Alert tone={op?.kycStatus === "REJECTED" ? "error" : "warn"} title={op?.kycStatus === "PENDING" ? "KYC under review" : op?.kycStatus === "REJECTED" ? "KYC needs attention" : "Complete your KYC"}>
            {op?.kycStatus === "PENDING"
              ? "The StayShare team is reviewing your documents. Payouts start once KYC is approved."
              : op?.kycStatus === "REJECTED"
                ? `Your KYC was not approved${op.kycNotes ? `: ${op.kycNotes}` : "."} Please update your documents.`
                : "Submit your business and identity documents so your properties can go live and payouts can be released."}{" "}
            <Link href="/owner/kyc" className="font-semibold underline">
              Go to Documents & KYC
            </Link>
          </Alert>
        )}
        {!op?.bankVerified && (
          <Alert tone="info" title={op?.bankAccountLast4 || op?.upiId ? "Bank details awaiting verification" : "Add your bank or UPI details"}>
            {op?.bankAccountLast4 || op?.upiId ? "Our finance team will verify your account shortly." : "We need a verified bank account or UPI ID to send your payouts."}{" "}
            <Link href="/owner/bank" className="font-semibold underline">
              Bank & UPI
            </Link>
          </Alert>
        )}
      </div>

      <section aria-label="Key figures" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Properties" value={d.properties.total} hint={`${d.properties.approved} live · ${d.properties.pending} in review · ${d.properties.draft} draft`} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Rooms / beds" value={`${d.rooms} / ${d.beds.total}`} hint={`${d.beds.occupied} occupied · ${d.beds.available} free tonight`} icon={<BedDouble className="h-5 w-5" />} tone="accent" />
        <StatCard label="Occupancy (30 days)" value={`${d.occupancy.pct}%`} hint={`${d.occupancy.bookedBedNights} of ${d.occupancy.capacityBedNights} bed-nights`} icon={<Percent className="h-5 w-5" />} tone="green" />
        <StatCard label="Current guests" value={d.inHouse.length} hint={`${d.upcomingBookings} upcoming bookings`} icon={<Users className="h-5 w-5" />} tone="slate" />
        <StatCard label="Today's check-ins" value={d.arrivalsToday.length} icon={<LogIn className="h-5 w-5" />} />
        <StatCard label="Due to check out" value={d.departuresToday.length} icon={<LogOut className="h-5 w-5" />} tone="accent" />
        <StatCard label="Net earnings (all time)" value={<Money paise={d.revenue.net} />} hint={<>Gross <Money paise={d.revenue.gross} /></>} icon={<IndianRupee className="h-5 w-5" />} tone="green" />
        <StatCard label="Pending earnings" value={<Money paise={d.pendingEarnings} />} hint={<>Paid out <Money paise={d.completedPayouts.amount} /> in {d.completedPayouts.count} payouts</>} icon={<Hourglass className="h-5 w-5" />} tone="slate" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Today at your properties" description={prettyDate(new Date())} action={<LinkButton href="/owner/guests" variant="ghost" size="sm">All guests</LinkButton>} />
          <CardBody className="grid gap-6 md:grid-cols-2">
            <MovementList title="Arrivals" icon={<CalendarCheck className="h-4 w-4" />} rows={d.arrivalsToday} empty="No arrivals today" href="/owner/check-in" action="Check in" />
            <MovementList title="Departures" icon={<CalendarClock className="h-4 w-4" />} rows={d.departuresToday} empty="No departures due" href="/owner/check-out" action="Check out" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Partner plan" action={<LinkButton href="/owner/subscription" variant="ghost" size="sm">Manage</LinkButton>} />
          <CardBody>
            {sub ? (
              <>
                <p className="text-lg font-semibold">{sub.planSnapshot.name}</p>
                <p className="text-sm text-slate-500">Active until {prettyDate(sub.endsAt)}</p>
              </>
            ) : (
              <p className="text-sm text-slate-600">You are on the free starter tier.</p>
            )}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-slate-600">Property limit</span>
                <span className="font-medium">
                  {d.properties.total} / {limit}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={d.properties.total} aria-label="Properties used">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (d.properties.total / Math.max(1, limit)) * 100)}%` }} />
              </div>
              {d.properties.total >= limit && (
                <LinkButton href="/owner/subscription" variant="accent" size="sm" className="mt-3 w-full">
                  Upgrade to add more properties
                </LinkButton>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Link href="/owner/support" className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                <Ticket className="h-4 w-4 text-brand-600" /> {d.openTickets} open tickets
              </Link>
              <Link href="/owner/properties" className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                <Wrench className="h-4 w-4 text-accent-600" /> {d.openMaintenance} maintenance
              </Link>
              <Link href="/owner/payouts" className="col-span-2 flex items-center gap-2 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                <Landmark className="h-4 w-4 text-brand-600" /> View payouts & request settlement
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Latest reviews" />
          <CardBody>
            {d.latestReviews.length === 0 ? (
              <EmptyState title="No reviews yet" description="Reviews from guests who completed their stay appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.latestReviews.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {r.title ?? "Review"} <span className="text-sm font-normal text-slate-500">— {r.guest}</span>
                      </p>
                      <p className="line-clamp-2 text-sm text-slate-600">{r.text}</p>
                      <Link href={`/owner/properties/${r.propertyId}?tab=reviews`} className="text-xs text-brand-700 hover:underline">
                        {r.propertyName} · reply
                      </Link>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-800">
                      <Star className="h-3.5 w-3.5 fill-current" aria-hidden /> {r.overall}/5
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function MovementList({ title, icon, rows, empty, href, action }: { title: string; icon: React.ReactNode; rows: { id: string; bookingNumber: string; guestName: string; propertyName: string; roomNumber: string; status: string }[]; empty: string; href: string; action: string }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon} {title} <span className="text-slate-400">({rows.length})</span>
      </h4>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.guestName}</p>
                <p className="truncate text-xs text-slate-500">
                  {r.propertyName} · Room {r.roomNumber} · {r.bookingNumber}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={r.status} />
                <Link href={`${href}?q=${encodeURIComponent(r.bookingNumber)}`} className="text-xs font-medium text-brand-700 hover:underline">
                  {action}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
