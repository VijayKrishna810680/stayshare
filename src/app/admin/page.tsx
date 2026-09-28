import Link from "next/link";
import { BedDouble, Building2, CalendarCheck, ClipboardCheck, CreditCard, IndianRupee, LifeBuoy, LogIn, LogOut, MessagesSquare, Percent, Undo2, Users, Wallet, XCircle, Briefcase, CheckCircle2, DoorOpen, CalendarPlus, TrendingUp } from "lucide-react";
import { loadDashboard } from "./_lib/dashboard";
import { pageUser } from "@/lib/auth/page";
import { todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { BarChart, LineChart, RankBars } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const u = await pageUser({ perm: "admin.access" });
  const today = todayIST();
  const fin = u.has("reports.financial") || u.has("payments.view");

  const { k, series: s, topCities, topProps } = await loadDashboard(today);
  const occ = k.live_beds ? Math.round((1000 * k.occupied_beds) / k.live_beds) / 10 : 0;
  const platformRevenue = k.commission + k.convenience;
  const pts = (rows: unknown[]) => (rows as { label: string; value: string | number }[]).map((r) => ({ label: r.label, value: Number(r.value) }));

  return (
    <>
      <PageHeader title={`Welcome, ${u.name.split(" ")[0]}`} description={`Platform overview · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}`} />
      {(k.pending_props > 0 || k.pending_rooms > 0 || k.refund_requests > 0) && (
        <div className="mb-6 flex flex-wrap gap-3">
          {k.pending_props + k.pending_rooms > 0 && u.has("properties.approve") && (
            <Link href="/admin/approvals" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100">
              <ClipboardCheck className="h-4 w-4" /> {k.pending_props} propert{k.pending_props === 1 ? "y" : "ies"} & {k.pending_rooms} room(s) awaiting approval
            </Link>
          )}
          {k.refund_requests > 0 && u.has("refunds.approve") && (
            <Link href="/admin/refunds" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100">
              <Undo2 className="h-4 w-4" /> {k.refund_requests} refund request(s) to review
            </Link>
          )}
        </div>
      )}
      <section aria-label="Inventory & users" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <StatCard label="Total users" value={k.users.toLocaleString("en-IN")} icon={<Users className="h-5 w-5" />} tone="slate" />
        <StatCard label="Property owners" value={k.owners} icon={<Briefcase className="h-5 w-5" />} tone="slate" />
        <StatCard label="Properties" value={k.properties} hint={`${k.pending_props} pending approval`} icon={<Building2 className="h-5 w-5" />} tone="slate" />
        <StatCard label="Pending approvals" value={k.pending_props + k.pending_rooms} hint={`${k.pending_props} properties · ${k.pending_rooms} rooms`} icon={<ClipboardCheck className="h-5 w-5" />} tone={k.pending_props ? "accent" : "slate"} />
        <StatCard label="Rooms" value={k.rooms} icon={<DoorOpen className="h-5 w-5" />} tone="slate" />
        <StatCard label="Beds" value={k.beds} icon={<BedDouble className="h-5 w-5" />} tone="slate" />
      </section>
      <section aria-label="Bookings" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <StatCard label="Active bookings" value={k.active_bookings} icon={<CalendarCheck className="h-5 w-5" />} />
        <StatCard label="Completed" value={k.completed} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard label="Cancelled" value={k.cancelled} icon={<XCircle className="h-5 w-5" />} tone="red" />
        <StatCard label="Today's bookings" value={k.today_bookings} icon={<CalendarPlus className="h-5 w-5" />} />
        <StatCard label="Check-ins today" value={k.today_checkins} icon={<LogIn className="h-5 w-5" />} />
        <StatCard label="Check-outs today" value={k.today_checkouts} icon={<LogOut className="h-5 w-5" />} />
      </section>
      <section aria-label="Money & service" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {fin && (
          <>
            <StatCard label="Gross booking value" value={formatINR(k.gbv)} icon={<IndianRupee className="h-5 w-5" />} tone="accent" />
            <StatCard label="Platform revenue" value={formatINR(platformRevenue)} hint={`Commission ${formatINR(k.commission)} + fees ${formatINR(k.convenience)}`} icon={<TrendingUp className="h-5 w-5" />} tone="green" />
            <StatCard label="Owner payable" value={formatINR(k.owner_payable)} icon={<Wallet className="h-5 w-5" />} tone="accent" />
            <StatCard label="Refunded" value={formatINR(k.refunded)} icon={<Undo2 className="h-5 w-5" />} tone="red" />
          </>
        )}
        <StatCard label="Occupancy tonight" value={`${occ}%`} hint={`${k.occupied_beds} of ${k.live_beds} live beds`} icon={<Percent className="h-5 w-5" />} />
        <StatCard label="Failed payments" value={k.failed_payments} icon={<CreditCard className="h-5 w-5" />} tone={k.failed_payments ? "red" : "slate"} />
        <StatCard label="Open tickets" value={k.open_tickets} icon={<LifeBuoy className="h-5 w-5" />} tone={k.open_tickets ? "accent" : "slate"} />
        <StatCard label="Open live chats" value={k.open_chats} hint={k.unread_chats ? `${k.unread_chats} unread messages` : undefined} icon={<MessagesSquare className="h-5 w-5" />} tone={k.unread_chats ? "accent" : "slate"} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bookings · last 30 days" description="By booking date (IST)" />
          <CardBody>
            <BarChart title="Bookings per day, last 30 days" data={s.map((r) => ({ label: r.label, value: Number(r.bookings) }))} />
          </CardBody>
        </Card>
        {fin ? (
          <Card>
            <CardHeader title="Revenue · last 30 days" description="Gross booking value (line) — platform revenue shown in tooltip totals below" />
            <CardBody>
              <LineChart title="Gross booking value per day, last 30 days" money data={s.map((r) => ({ label: r.label, value: Number(r.gbv) }))} />
              <p className="mt-2 text-xs text-slate-500">
                30-day GBV {formatINR(s.reduce((a, r) => a + Number(r.gbv), 0))} · platform revenue {formatINR(s.reduce((a, r) => a + Number(r.revenue), 0))}
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Top cities by bookings" />
            <CardBody>
              <RankBars data={pts(topCities)} />
            </CardBody>
          </Card>
        )}
        {fin && (
          <Card>
            <CardHeader title="Top cities by bookings" />
            <CardBody>
              <RankBars data={pts(topCities)} />
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Top properties by booking value" action={u.has("reports.view") ? <Link href="/admin/reports?report=occupancy" className="text-sm text-brand-700 hover:underline">Occupancy report</Link> : undefined} />
          <CardBody>
            <RankBars data={pts(topProps)} money />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
