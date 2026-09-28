import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { LifeBuoy } from "lucide-react";
import { db } from "@/db";
import { bookings, properties, supportTickets } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { humanize } from "@/lib/site/labels";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { NewTicketToggle } from "@/components/site/new-ticket";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Help & support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ new?: string; booking?: string }> }) {
  const user = await pageUser({ next: "/account/support" });
  const sp = await searchParams;
  const [tickets, myBookings] = await Promise.all([
    db
      .select({ id: supportTickets.id, ticketNumber: supportTickets.ticketNumber, subject: supportTickets.subject, category: supportTickets.category, priority: supportTickets.priority, status: supportTickets.status, updatedAt: supportTickets.updatedAt, bookingNumber: bookings.bookingNumber })
      .from(supportTickets)
      .leftJoin(bookings, eq(bookings.id, supportTickets.bookingId))
      .where(eq(supportTickets.raisedById, user.id))
      .orderBy(desc(supportTickets.updatedAt)),
    db.select({ id: bookings.id, bookingNumber: bookings.bookingNumber, propertyName: properties.name }).from(bookings).innerJoin(properties, eq(properties.id, bookings.propertyId)).where(eq(bookings.customerId, user.id)).orderBy(desc(bookings.createdAt)).limit(30),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Help & support" description="Raise a ticket and follow the conversation with our team." breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Support" }]} />
      <NewTicketToggle bookings={myBookings} defaultOpen={sp.new === "1"} />
      {tickets.length === 0 ? (
        <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No tickets yet" description="If something isn't right with a booking, payment or stay, raise a ticket and we'll help." />
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/account/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{t.subject}</span>
                  <span className="block text-xs text-slate-500">
                    {t.ticketNumber} · {humanize(t.category)}
                    {t.bookingNumber ? ` · ${t.bookingNumber}` : ""} · updated {prettyDateTime(t.updatedAt)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {["HIGH", "URGENT"].includes(t.priority) && <StatusBadge status={t.priority} />}
                  <StatusBadge status={t.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
