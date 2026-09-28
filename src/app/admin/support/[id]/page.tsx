import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, properties, supportMessages, supportTickets, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Badge, Card, CardBody, CardHeader, DescList, PageHeader, StatusBadge } from "@/components/ui";
import { FormDialogButton, SelectAction } from "@/components/admin/widgets";
import { TicketReply } from "@/components/admin/ticket-reply";
import { cn } from "@/lib/cn";
import { agentOptions } from "../agents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket" };

const opt = (v: string[]) => v.map((x) => ({ value: x, label: x.replace(/_/g, " ").toLowerCase() }));

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser({ perm: "support.manage" });
  const { id } = await params;
  const [row] = await db.select({ t: supportTickets, raiser: users }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.raisedById)).where(eq(supportTickets.id, id));
  if (!row) notFound();
  const { t, raiser } = row;
  const [msgs, agents, [bk], [prop]] = await Promise.all([
    db.select({ m: supportMessages, author: users.name }).from(supportMessages).innerJoin(users, eq(users.id, supportMessages.authorId)).where(eq(supportMessages.ticketId, t.id)).orderBy(asc(supportMessages.createdAt)),
    agentOptions(),
    t.bookingId ? db.select({ id: bookings.id, n: bookings.bookingNumber }).from(bookings).where(eq(bookings.id, t.bookingId)) : Promise.resolve([]),
    t.propertyId ? db.select({ id: properties.id, name: properties.name }).from(properties).where(eq(properties.id, t.propertyId)) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title={`${t.ticketNumber} · ${t.subject}`}
        breadcrumbs={[{ label: "Support tickets", href: "/admin/support" }, { label: t.ticketNumber }]}
        actions={
          <FormDialogButton
            url={`/api/admin/support/${t.id}`}
            method="PATCH"
            label={t.status === "RESOLVED" ? "Edit resolution" : "Resolve"}
            variant="primary"
            title="Resolve ticket"
            description="The resolution summary is shared with the customer."
            fields={[
              { name: "status", label: "Status", type: "select", options: opt(["RESOLVED", "CLOSED"]), required: true, defaultValue: "RESOLVED" },
              { name: "resolution", label: "Resolution", type: "textarea", required: true, defaultValue: t.resolution ?? "" },
            ]}
            success="Ticket resolved — customer notified"
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardBody>
              <p className="text-xs text-slate-500">
                {raiser.name} ({t.raisedByRole.toLowerCase()}) · {prettyDateTime(t.createdAt)}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm">{t.description}</p>
              {t.attachments.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-2 text-xs">
                  {t.attachments.map((a, i) => (
                    <a key={i} href={a.startsWith("/") || a.startsWith("http") ? a : `/api/files/${a}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                      Attachment {i + 1}
                    </a>
                  ))}
                </p>
              )}
            </CardBody>
          </Card>
          <ol className="space-y-3" aria-label="Conversation">
            {msgs.map(({ m, author }) => {
              const fromCustomer = m.authorId === t.raisedById;
              return (
                <li key={m.id} className={cn("rounded-2xl p-3 text-sm", m.isInternal ? "border border-amber-200 bg-amber-50" : fromCustomer ? "border border-slate-200 bg-white" : "ml-6 bg-slate-900 text-white")}>
                  <p className={cn("mb-1 text-xs", fromCustomer || m.isInternal ? "text-slate-500" : "text-white/70")}>
                    {author} · {prettyDateTime(m.createdAt)} {m.isInternal && <Badge tone="amber">Internal</Badge>}
                  </p>
                  <p className="whitespace-pre-line">{m.body}</p>
                </li>
              );
            })}
          </ol>
          <TicketReply ticketId={t.id} />
        </div>
        <Card>
          <CardHeader title="Ticket" />
          <CardBody className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Status</p>
              <SelectAction url={`/api/admin/support/${t.id}`} field="status" value={t.status} options={opt(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "WAITING_FOR_PROPERTY", "RESOLVED", "CLOSED"])} label="Status" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Priority</p>
              <SelectAction url={`/api/admin/support/${t.id}`} field="priority" value={t.priority} options={opt(["LOW", "MEDIUM", "HIGH", "URGENT"])} label="Priority" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Assigned agent</p>
              <SelectAction url={`/api/admin/support/${t.id}`} field="assignedToId" value={t.assignedToId} options={agents} label="Assignee" allowEmpty="— Unassigned —" />
            </div>
            <DescList
              className="sm:grid-cols-1"
              items={[
                { label: "Current", value: <StatusBadge status={t.status} /> },
                { label: "Category", value: t.category.replace(/_/g, " ").toLowerCase() },
                { label: "Customer", value: `${raiser.name} · ${raiser.email ?? raiser.phone ?? ""}` },
                { label: "Booking", value: bk ? <Link className="text-brand-700 hover:underline" href={`/admin/bookings/${bk.id}`}>{bk.n}</Link> : "—" },
                { label: "Property", value: prop ? <Link className="text-brand-700 hover:underline" href={`/admin/properties/${prop.id}`}>{prop.name}</Link> : "—" },
                { label: "Resolution", value: t.resolution ?? "—" },
                { label: "Resolved", value: t.resolvedAt ? prettyDateTime(t.resolvedAt) : "—" },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
