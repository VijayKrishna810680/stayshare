import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { LifeBuoy, Mail, MessageCircle, Phone } from "lucide-react";
import { db } from "@/db";
import { properties, supportTickets } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { getSupportContacts } from "@/lib/contact";
import { prettyDateTime } from "@/lib/dates";
import { EmptyState, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { humanize } from "@/components/owner/format";
import { NewTicketButton } from "@/components/owner/misc-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

export default async function SupportPage() {
  const u = await pageUser({ role: "OWNER" });
  const props = await db.select({ id: properties.id, name: properties.name }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt))).orderBy(asc(properties.name));
  const tickets = await db.select().from(supportTickets).where(eq(supportTickets.raisedById, u.id)).orderBy(desc(supportTickets.updatedAt)).limit(200);
  const c = await getSupportContacts();
  return (
    <>
      <PageHeader title="Partner support" description="Raise a ticket with the StayShare partner team. We usually respond within a few working hours." actions={<NewTicketButton properties={props} />} />
      {(c.email || c.phone || c.whatsapp) && (
        <div className="mb-5 flex flex-wrap gap-3 text-sm">
          {c.phone && (
            <a href={`tel:${c.phone}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
              <Phone className="h-4 w-4 text-brand-600" /> {c.phone}
            </a>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
              <Mail className="h-4 w-4 text-brand-600" /> {c.email}
            </a>
          )}
          {c.whatsapp && (
            <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
              <MessageCircle className="h-4 w-4 text-brand-600" /> WhatsApp
            </a>
          )}
          {c.hours && <span className="self-center text-slate-500">{c.hours}</span>}
        </div>
      )}
      {tickets.length === 0 ? (
        <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No tickets yet" description="Questions about payouts, listings or guests? Raise a ticket and we'll get back to you." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Ticket</TH>
              <TH>Category</TH>
              <TH>Priority</TH>
              <TH>Status</TH>
              <TH>Updated</TH>
            </tr>
          </THead>
          <TBody>
            {tickets.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link href={`/owner/support/${t.id}`} className="font-medium text-brand-700 hover:underline">
                    {t.subject}
                  </Link>
                  <p className="text-xs text-slate-500">{t.ticketNumber}</p>
                </TD>
                <TD className="text-sm">{humanize(t.category)}</TD>
                <TD>
                  <StatusBadge status={t.priority} />
                </TD>
                <TD>
                  <StatusBadge status={t.status} />
                </TD>
                <TD className="text-xs">{prettyDateTime(t.updatedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
