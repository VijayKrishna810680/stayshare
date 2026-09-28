import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, ownerEarnings, ownerProfiles, payoutTransactions, payouts, properties, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Alert, Card, CardBody, CardHeader, DescList, Money, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { PayoutActions } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payout" };

export default async function PayoutDetail({ params }: { params: Promise<{ id: string }> }) {
  await pageUser({ perm: "payouts.manage" });
  const { id } = await params;
  const [row] = await db.select({ p: payouts, owner: users.name, op: ownerProfiles }).from(payouts).innerJoin(users, eq(users.id, payouts.ownerId)).leftJoin(ownerProfiles, eq(ownerProfiles.userId, payouts.ownerId)).where(eq(payouts.id, id));
  if (!row) notFound();
  const { p, op } = row;
  const [earnings, txns] = await Promise.all([
    db.select({ e: ownerEarnings, bn: bookings.bookingNumber, prop: properties.name }).from(ownerEarnings).innerJoin(bookings, eq(bookings.id, ownerEarnings.bookingId)).innerJoin(properties, eq(properties.id, ownerEarnings.propertyId)).where(eq(ownerEarnings.payoutId, p.id)),
    db.select({ t: payoutTransactions, actor: users.name }).from(payoutTransactions).leftJoin(users, eq(users.id, payoutTransactions.actorId)).where(eq(payoutTransactions.payoutId, p.id)).orderBy(asc(payoutTransactions.createdAt)),
  ]);
  return (
    <>
      <PageHeader title={p.payoutNumber} description={`${row.owner} · ${op?.businessName ?? ""}`} breadcrumbs={[{ label: "Payouts", href: "/admin/payouts?tab=payouts" }, { label: p.payoutNumber }]} actions={<PayoutActions id={p.id} status={p.status} amount={p.amount} deductions={p.deductions} />} />
      {p.disputeNote && (
        <div className="mb-4">
          <Alert tone="error" title="Disputed by owner">
            {p.disputeNote}
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Earnings in this payout" />
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <TH>Booking</TH>
                <TH>Property</TH>
                <TH className="text-right">Room revenue</TH>
                <TH className="text-right">Commission</TH>
                <TH className="text-right">Net</TH>
              </tr>
            </THead>
            <TBody>
              {earnings.map(({ e, bn, prop }) => (
                <TR key={e.id}>
                  <TD>
                    <Link href={`/admin/bookings/${e.bookingId}`} className="text-brand-700 hover:underline">
                      {bn}
                    </Link>
                  </TD>
                  <TD className="text-sm">{prop}</TD>
                  <TD className="text-right">
                    <Money paise={e.roomRevenue} />
                  </TD>
                  <TD className="text-right">
                    <Money paise={e.commission} />
                  </TD>
                  <TD className="text-right">
                    <Money paise={e.netPayable} />
                  </TD>
                </TR>
              ))}
              {!earnings.length && (
                <TR>
                  <TD colSpan={5} className="text-center text-sm text-slate-500">
                    Earnings were released back to the owner&apos;s balance.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Summary" action={<StatusBadge status={p.status} />} />
            <CardBody>
              <DescList
                className="sm:grid-cols-1"
                items={[
                  { label: "Gross", value: <Money paise={p.amount} /> },
                  { label: "Deductions", value: <Money paise={p.deductions} /> },
                  { label: "Net", value: <Money paise={p.netAmount} className="font-semibold" /> },
                  { label: "Method", value: p.method },
                  { label: "Bank", value: op?.bankAccountLast4 ? `${op.bankAccountName ?? ""} · ${op.bankName ?? ""} ••${op.bankAccountLast4} · ${op.bankIfsc ?? ""}` : op?.upiId ? `UPI ${op.upiId}` : "—" },
                  { label: "Reference / UTR", value: p.reference ?? "—" },
                  { label: "Period", value: `${prettyDateTime(p.periodStart)} → ${prettyDateTime(p.periodEnd)}` },
                  { label: "Approved", value: p.approvedAt ? prettyDateTime(p.approvedAt) : "—" },
                  { label: "Paid", value: p.paidAt ? prettyDateTime(p.paidAt) : "—" },
                  { label: "Notes", value: <span className="whitespace-pre-line">{p.notes ?? "—"}</span> },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="History" />
            <CardBody>
              <ol className="space-y-3 text-sm">
                {txns.map(({ t, actor }) => (
                  <li key={t.id}>
                    <StatusBadge status={t.status} /> <span className="text-xs text-slate-500">{prettyDateTime(t.createdAt)} · {actor ?? "system"}</span>
                    {(t.note || t.reference) && <p className="text-xs text-slate-600">{[t.note, t.reference && `ref ${t.reference}`].filter(Boolean).join(" · ")}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
