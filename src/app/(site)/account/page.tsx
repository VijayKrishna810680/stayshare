import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, inArray, isNull, sum } from "drizzle-orm";
import { ArrowRight, BadgePercent, Bell, CalendarCheck, Crown, Heart, House, LifeBuoy, ReceiptIndianRupee, Users } from "lucide-react";
import { db } from "@/db";
import { bookings, favourites, identityDocuments, notifications, refunds, savedGuests, supportTickets } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate, prettyDateTime, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { listMyBookings } from "@/lib/site/bookings";
import { publicCoupons } from "@/lib/site/coupons";
import { loadProfile } from "@/lib/site/profile";
import { BOOKING_BUCKETS } from "@/lib/site/labels";
import { getActiveSubscription } from "@/services/subscriptions";
import { LinkButton } from "@/components/ui";
import { AccountMobileList } from "@/components/site/account-nav";
import { BookingCard } from "@/components/site/booking-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await pageUser({ next: "/account" });
  const [profile, all, favCount, guestCount, docCount, notifs, unreadRow, ticketRows, refundRows, offers, plus] = await Promise.all([
    loadProfile(user.id),
    listMyBookings(user.id),
    db.select({ n: count() }).from(favourites).where(eq(favourites.userId, user.id)),
    db.select({ n: count() }).from(savedGuests).where(eq(savedGuests.userId, user.id)),
    db.select({ n: count() }).from(identityDocuments).where(and(eq(identityDocuments.userId, user.id), isNull(identityDocuments.deletedAt))),
    db.select({ id: notifications.id, title: notifications.title, body: notifications.body, readAt: notifications.readAt, createdAt: notifications.createdAt }).from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.channel, "IN_APP"))).orderBy(desc(notifications.createdAt)).limit(3),
    db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.channel, "IN_APP"), isNull(notifications.readAt))),
    db.select({ status: supportTickets.status }).from(supportTickets).where(eq(supportTickets.raisedById, user.id)),
    db.select({ status: refunds.status, amount: sum(refunds.amount) }).from(refunds).innerJoin(bookings, eq(bookings.id, refunds.bookingId)).where(eq(bookings.customerId, user.id)).groupBy(refunds.status),
    publicCoupons(),
    getActiveSubscription(user.id, "CUSTOMER"),
  ]);
  const today = todayIST();
  const inBucket = (k: keyof typeof BOOKING_BUCKETS) => all.filter((b) => (BOOKING_BUCKETS[k] as readonly string[]).includes(b.status));
  const current = inBucket("current")[0];
  const upcoming = inBucket("upcoming").filter((b) => b.checkIn >= today || b.status !== "CONFIRMED").sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  const past = inBucket("past");
  const cancelled = inBucket("cancelled");
  const openTickets = ticketRows.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status)).length;
  const refundPending = refundRows.filter((r) => ["REQUESTED", "APPROVED", "PROCESSING"].includes(r.status)).reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const refundDone = refundRows.filter((r) => r.status === "COMPLETED").reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const checks = [
    { ok: Boolean(profile.name), label: "Name" },
    { ok: Boolean(profile.email), label: "Email" },
    { ok: Boolean(profile.phone), label: "Mobile number" },
    { ok: Boolean(profile.profile.gender), label: "Gender" },
    { ok: Boolean(profile.profile.dateOfBirth), label: "Date of birth" },
    { ok: Boolean(profile.profile.occupation), label: "Occupation" },
    { ok: Boolean(profile.profile.emergencyName && profile.profile.emergencyPhone), label: "Emergency contact" },
    { ok: Number(docCount[0]?.n ?? 0) > 0, label: "ID document" },
  ];
  const pct = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const unread = Number(unreadRow[0]?.n ?? 0);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-white/80">Welcome back</p>
            <h1 className="text-2xl font-bold text-white">{user.name}</h1>
            {plus ? (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent-500/90 px-2.5 py-0.5 text-xs font-semibold">
                <Crown className="h-3.5 w-3.5" aria-hidden /> {plus.planSnapshot.name} · until {prettyDate(plus.endsAt)}
              </p>
            ) : (
              <Link href="/account/subscriptions" className="mt-1 inline-flex items-center gap-1 text-sm text-white/90 underline underline-offset-2">
                <Crown className="h-3.5 w-3.5" aria-hidden /> Join StayShare Plus for member discounts
              </Link>
            )}
          </div>
          <div className="w-full max-w-xs rounded-2xl bg-white/10 p-4 ring-1 ring-white/20">
            <div className="flex items-center justify-between text-sm">
              <span>Profile completion</span>
              <span className="font-bold">{pct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
              <div className="h-full rounded-full bg-accent-400" style={{ width: `${pct}%` }} />
            </div>
            {missing.length > 0 && (
              <p className="mt-2 text-xs text-white/80">
                Add: {missing.slice(0, 3).join(", ")}
                {missing.length > 3 ? "…" : ""} ·{" "}
                <Link href={missing.includes("ID document") && missing.length === 1 ? "/account/documents" : "/account/profile"} className="font-semibold underline">
                  Complete
                </Link>
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/account/bookings?tab=past", label: "Past stays", value: past.length, icon: House },
          { href: "/account/bookings?tab=cancelled", label: "Cancelled", value: cancelled.length, icon: CalendarCheck },
          { href: "/account/favourites", label: "Saved", value: Number(favCount[0]?.n ?? 0), icon: Heart },
          { href: "/account/guests", label: "Saved guests", value: Number(guestCount[0]?.n ?? 0), icon: Users },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="card flex items-center gap-3 p-4 hover:shadow-md">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <s.icon className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-xl font-bold">{s.value}</span>
              <span className="block text-xs text-slate-500">{s.label}</span>
            </span>
          </Link>
        ))}
      </div>

      {current && (
        <section aria-labelledby="current-h">
          <h2 id="current-h" className="mb-2 text-lg font-semibold">
            Current stay
          </h2>
          <BookingCard b={current} />
        </section>
      )}
      <section aria-labelledby="upcoming-h">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="upcoming-h" className="text-lg font-semibold">
            Upcoming booking
          </h2>
          <Link href="/account/bookings" className="text-sm font-medium text-brand-700 hover:underline">
            All bookings
          </Link>
        </div>
        {upcoming ? (
          <BookingCard b={upcoming} />
        ) : (
          <div className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">No upcoming stays. Where to next?</p>
            <LinkButton href="/search">Find a stay</LinkButton>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5" aria-labelledby="refunds-h">
          <h2 id="refunds-h" className="flex items-center gap-2 font-semibold">
            <ReceiptIndianRupee className="h-4 w-4 text-brand-600" aria-hidden /> Refunds
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">In progress</dt>
              <dd className="text-lg font-bold">{formatINR(refundPending)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Refunded</dt>
              <dd className="text-lg font-bold text-emerald-700">{formatINR(refundDone)}</dd>
            </div>
          </dl>
          <Link href="/account/refunds" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            Track refunds <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
        <section className="card p-5" aria-labelledby="support-h">
          <h2 id="support-h" className="flex items-center gap-2 font-semibold">
            <LifeBuoy className="h-4 w-4 text-brand-600" aria-hidden /> Support tickets
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            {openTickets ? `${openTickets} open ticket${openTickets > 1 ? "s" : ""}` : "No open tickets"} · {ticketRows.length} total
          </p>
          <div className="mt-3 flex gap-3">
            <Link href="/account/support" className="text-sm font-medium text-brand-700 hover:underline">
              View tickets
            </Link>
            <Link href="/account/support?new=1" className="text-sm font-medium text-brand-700 hover:underline">
              Raise a ticket
            </Link>
          </div>
        </section>
        <section className="card p-5" aria-labelledby="notif-h">
          <div className="flex items-center justify-between">
            <h2 id="notif-h" className="flex items-center gap-2 font-semibold">
              <Bell className="h-4 w-4 text-brand-600" aria-hidden /> Notifications {unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">{unread}</span>}
            </h2>
            <Link href="/account/notifications" className="text-sm font-medium text-brand-700 hover:underline">
              See all
            </Link>
          </div>
          {notifs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">You&apos;re all caught up.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {notifs.map((n) => (
                <li key={n.id} className="text-sm">
                  <p className={n.readAt ? "text-slate-600" : "font-semibold text-slate-900"}>{n.title}</p>
                  <p className="text-xs text-slate-400">{prettyDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5" aria-labelledby="offers-h">
          <h2 id="offers-h" className="flex items-center gap-2 font-semibold">
            <BadgePercent className="h-4 w-4 text-brand-600" aria-hidden /> Offers for you
          </h2>
          {offers.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No offers right now — check back soon.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {offers.slice(0, 4).map((o) => (
                <li key={o.code} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/50 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{o.title}</span>
                    <span className="block text-xs text-slate-500">
                      {o.discountType === "PERCENT" ? `${o.value / 100}% off` : `${formatINR(o.value)} off`}
                      {o.minNights > 1 ? ` · min ${o.minNights} nights` : ""} · valid till {prettyDate(o.validTo)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-white px-2 py-1 font-mono text-xs font-bold text-brand-800 ring-1 ring-brand-200">{o.code}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AccountMobileList unread={unread} />
    </div>
  );
}
