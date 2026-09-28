import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, properties, supportMessages, supportTickets, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Card, CardBody, DescList, PageHeader, StatusBadge } from "@/components/ui";
import { humanize } from "@/components/owner/format";
import { TicketReply } from "@/components/owner/misc-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.raisedById, u.id)));
  if (!t) notFound();
  // Internal staff notes are never shown to partners.
  const msgs = await db
    .select({ id: supportMessages.id, body: supportMessages.body, createdAt: supportMessages.createdAt, authorId: supportMessages.authorId, author: users.name, attachments: supportMessages.attachments })
    .from(supportMessages)
    .innerJoin(users, eq(users.id, supportMessages.authorId))
    .where(and(eq(supportMessages.ticketId, t.id), eq(supportMessages.isInternal, false)))
    .orderBy(asc(supportMessages.createdAt));
  const [prop] = t.propertyId ? await db.select({ name: properties.name }).from(properties).where(eq(properties.id, t.propertyId)) : [];
  const [bk] = t.bookingId ? await db.select({ n: bookings.bookingNumber }).from(bookings).where(eq(bookings.id, t.bookingId)) : [];
  return (
    <>
      <PageHeader title={t.subject} description={t.ticketNumber} breadcrumbs={[{ label: "Support", href: "/owner/support" }, { label: t.ticketNumber }]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardBody>
              <p className="text-xs text-slate-500">
                You · {prettyDateTime(t.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{t.description}</p>
              {t.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.attachments.map((a, i) => (
                    <a key={a} href={a} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline">
                      Attachment {i + 1}
                    </a>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
          <ol className="space-y-3" aria-label="Conversation">
            {msgs.map((m) => {
              const mine = m.authorId === u.id;
              return (
                <li key={m.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", mine ? "ml-auto bg-brand-600 text-white" : "bg-white shadow-sm ring-1 ring-slate-200")}>
                  <p className={cn("mb-1 text-xs", mine ? "text-white/80" : "text-slate-500")}>
                    {mine ? "You" : `${m.author} · StayShare`} · {prettyDateTime(m.createdAt)}
                  </p>
                  <p className="whitespace-pre-line">{m.body}</p>
                </li>
              );
            })}
          </ol>
          <Card>
            <CardBody>
              <TicketReply ticketId={t.id} closed={t.status === "CLOSED"} />
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardBody>
            <DescList
              className="sm:grid-cols-1"
              items={[
                { label: "Status", value: <StatusBadge status={t.status} /> },
                { label: "Priority", value: <StatusBadge status={t.priority} /> },
                { label: "Category", value: humanize(t.category) },
                { label: "Property", value: prop?.name ?? "—" },
                { label: "Booking", value: bk?.n ?? "—" },
                { label: "Resolution", value: t.resolution ?? "—" },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
