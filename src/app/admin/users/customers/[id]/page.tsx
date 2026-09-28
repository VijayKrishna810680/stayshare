import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customerProfiles, identityDocuments, properties, sessions, subscriptions, subscriptionPlans, supportTickets, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { loadRolesAndPerms } from "@/lib/auth/session";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { Badge, Card, CardBody, CardHeader, DescList, Money, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusButton } from "../../status-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer" };

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser({ perm: "users.view" });
  const { id } = await params;
  const [c] = await db.select().from(users).where(eq(users.id, id));
  if (!c) notFound();
  const [[profile], bks, docs, subs, tickets, activeSessions, { roles }] = await Promise.all([
    db.select().from(customerProfiles).where(eq(customerProfiles.userId, id)),
    db.select({ b: bookings, prop: properties.name }).from(bookings).innerJoin(properties, eq(properties.id, bookings.propertyId)).where(eq(bookings.customerId, id)).orderBy(desc(bookings.createdAt)).limit(50),
    db.select().from(identityDocuments).where(and(eq(identityDocuments.userId, id), isNull(identityDocuments.deletedAt))),
    db.select({ s: subscriptions, plan: subscriptionPlans.name }).from(subscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId)).where(eq(subscriptions.userId, id)).orderBy(desc(subscriptions.createdAt)),
    db.select().from(supportTickets).where(eq(supportTickets.raisedById, id)).orderBy(desc(supportTickets.createdAt)).limit(20),
    db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt))),
    loadRolesAndPerms(id),
  ]);
  return (
    <>
      <PageHeader title={c.name} description={`Customer since ${prettyDate(c.createdAt)}`} breadcrumbs={[{ label: "Customers", href: "/admin/users/customers" }, { label: c.name }]} actions={me.has("users.manage") && c.id !== me.id ? <StatusButton id={c.id} status={c.status} /> : undefined} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Profile" action={<StatusBadge status={c.status} />} />
          <CardBody>
            <DescList
              className="sm:grid-cols-1"
              items={[
                { label: "Email", value: `${c.email ?? "—"}${c.emailVerifiedAt ? " ✓" : ""}` },
                { label: "Phone", value: `${c.phone ?? "—"}${c.phoneVerifiedAt ? " ✓" : ""}` },
                { label: "Roles", value: roles.join(", ") },
                { label: "Gender / DOB", value: `${profile?.gender?.toLowerCase() ?? "—"} · ${profile?.dateOfBirth ?? "—"}` },
                { label: "Occupation", value: profile?.occupation ?? "—" },
                { label: "City / address", value: [profile?.city, profile?.address].filter(Boolean).join(" · ") || "—" },
                { label: "Emergency contact", value: profile?.emergencyName ? `${profile.emergencyName} (${profile.emergencyPhone ?? ""})` : "—" },
                { label: "Wallet", value: <Money paise={profile?.walletBalance ?? 0} /> },
                { label: "Last login", value: prettyDateTime(c.lastLoginAt) },
                { label: "Active sessions", value: activeSessions.length },
                { label: "ID documents", value: docs.length ? docs.map((d) => `${d.docType} ••${d.numberLast4} (${d.status.toLowerCase()})`).join(", ") : "None" },
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={`Bookings (${bks.length})`} />
            <Table className="rounded-none border-0 shadow-none">
              <THead>
                <tr>
                  <TH>Booking</TH>
                  <TH>Property</TH>
                  <TH>Stay</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total</TH>
                </tr>
              </THead>
              <TBody>
                {bks.map(({ b, prop }) => (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/admin/bookings/${b.id}`} className="text-brand-700 hover:underline">
                        {b.bookingNumber}
                      </Link>
                    </TD>
                    <TD className="text-sm">{prop}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      {prettyDate(b.checkIn)} → {prettyDate(b.checkOut)}
                    </TD>
                    <TD>
                      <StatusBadge status={b.status} />
                    </TD>
                    <TD className="text-right">
                      <Money paise={b.totalAmount} />
                    </TD>
                  </TR>
                ))}
                {!bks.length && (
                  <TR>
                    <TD colSpan={5} className="text-center text-sm text-slate-500">
                      No bookings yet.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Subscriptions" />
              <CardBody className="space-y-2 text-sm">
                {subs.map(({ s, plan }) => (
                  <p key={s.id}>
                    {plan} <StatusBadge status={s.status} /> {s.grantedBy && <Badge tone="purple">Comp</Badge>}
                    <span className="block text-xs text-slate-500">
                      {prettyDate(s.startsAt)} → {prettyDate(s.endsAt)}
                    </span>
                  </p>
                ))}
                {!subs.length && <p className="text-slate-500">None</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Support tickets" />
              <CardBody className="space-y-2 text-sm">
                {tickets.map((t) => (
                  <p key={t.id}>
                    <Link href={`/admin/support/${t.id}`} className="text-brand-700 hover:underline">
                      {t.ticketNumber}
                    </Link>{" "}
                    {t.subject} <StatusBadge status={t.status} />
                  </p>
                ))}
                {!tickets.length && <p className="text-slate-500">None</p>}
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
