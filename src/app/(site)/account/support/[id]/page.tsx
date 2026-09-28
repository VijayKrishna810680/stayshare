import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, supportMessages, supportTickets, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { humanize } from "@/lib/site/labels";
import { Alert, PageHeader, StatusBadge } from "@/components/ui";
import { TicketThread } from "@/components/site/ticket-thread";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser({ next: `/account/support/${id}` });
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.raisedById, user.id)));
  if (!t) notFound();
  const [msgs, bk] = await Promise.all([
    db
      .select({ id: supportMessages.id, body: supportMessages.body, attachments: supportMessages.attachments, createdAt: supportMessages.createdAt, authorId: supportMessages.authorId, authorName: users.name })
      .from(supportMessages)
      .innerJoin(users, eq(users.id, supportMessages.authorId))
      .where(and(eq(supportMessages.ticketId, t.id), eq(supportMessages.isInternal, false)))
      .orderBy(asc(supportMessages.createdAt)),
    t.bookingId ? db.select({ id: bookings.id, bookingNumber: bookings.bookingNumber }).from(bookings).where(eq(bookings.id, t.bookingId)) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title={t.subject}
        description={
          <>
            {t.ticketNumber} · {humanize(t.category)} · opened {prettyDateTime(t.createdAt)}
            {bk[0] && (
              <>
                {" "}
                ·{" "}
                <Link href={`/account/bookings/${bk[0].id}`} className="font-medium text-brand-700 hover:underline">
                  {bk[0].bookingNumber}
                </Link>
              </>
            )}
          </>
        }
        breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Support", href: "/account/support" }, { label: t.ticketNumber }]}
        actions={
          <>
            <StatusBadge status={t.priority} />
            <StatusBadge status={t.status} />
          </>
        }
      />
      {t.resolution && (
        <Alert tone="success" title="Resolution">
          {t.resolution}
        </Alert>
      )}
      <TicketThread
        ticketId={t.id}
        closed={t.status === "CLOSED"}
        messages={msgs.map((m) => ({ id: m.id, body: m.body, attachments: m.attachments, createdAt: m.createdAt.toISOString(), mine: m.authorId === user.id, author: m.authorId === user.id ? "You" : `${m.authorName.split(" ")[0]} · StayShare support` }))}
      />
    </div>
  );
}
