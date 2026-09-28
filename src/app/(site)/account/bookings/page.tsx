import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import { pageUser } from "@/lib/auth/page";
import { cn } from "@/lib/cn";
import { listMyBookings } from "@/lib/site/bookings";
import { BOOKING_BUCKETS, type BookingBucket } from "@/lib/site/labels";
import { EmptyState, LinkButton, PageHeader, Pagination } from "@/components/ui";
import { BookingCard } from "@/components/site/booking-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My bookings" };

const TABS: { key: BookingBucket; label: string; empty: string }[] = [
  { key: "upcoming", label: "Upcoming", empty: "No upcoming bookings yet." },
  { key: "current", label: "Current stay", empty: "You're not checked in anywhere right now." },
  { key: "past", label: "Past", empty: "Your completed stays will appear here." },
  { key: "cancelled", label: "Cancelled", empty: "No cancelled bookings." },
];

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const user = await pageUser({ next: "/account/bookings" });
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "upcoming") as BookingBucket;
  const all = await listMyBookings(user.id);
  const counts = Object.fromEntries(TABS.map((t) => [t.key, all.filter((b) => (BOOKING_BUCKETS[t.key] as readonly string[]).includes(b.status)).length]));
  let rows = all.filter((b) => (BOOKING_BUCKETS[tab] as readonly string[]).includes(b.status));
  if (tab === "upcoming") rows = rows.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 10;
  const pageRows = rows.slice((page - 1) * size, page * size);
  const cur = TABS.find((t) => t.key === tab)!;
  return (
    <div>
      <PageHeader title="My bookings" breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Bookings" }]} />
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Booking status">
        {TABS.map((t) => (
          <Link key={t.key} href={`/account/bookings?tab=${t.key}`} role="tab" aria-selected={tab === t.key} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium", tab === t.key ? "bg-brand-600 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {t.label} <span className={cn("ml-1 text-xs", tab === t.key ? "text-white/80" : "text-slate-400")}>{counts[t.key]}</span>
          </Link>
        ))}
      </div>
      <div role="tabpanel">
        {pageRows.length === 0 ? (
          <EmptyState icon={<CalendarX className="h-6 w-6" />} title={cur.empty} action={<LinkButton href="/search">Explore stays</LinkButton>} />
        ) : (
          <div className="space-y-3">
            {pageRows.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
            <Pagination page={page} pageSize={size} total={rows.length} basePath="/account/bookings" query={{ tab }} />
          </div>
        )}
      </div>
    </div>
  );
}
