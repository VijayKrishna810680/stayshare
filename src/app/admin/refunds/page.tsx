import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bookings, refunds, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Badge, EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LinkTabs } from "@/components/admin/ui";
import { ActionButton, FormDialogButton } from "@/components/admin/widgets";
import { one, pageArgs, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Refunds" };

const TABS = ["REQUESTED", "FAILED", "PROCESSING", "COMPLETED", "REJECTED", "ALL"] as const;

export default async function RefundsPage({ searchParams }: { searchParams: SearchParams }) {
  await pageUser({ perm: "refunds.approve" });
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(one(sp.tab)) ? one(sp.tab) : "REQUESTED";
  const { page, pageSize, offset } = pageArgs(sp, 30);
  const where: SQL | undefined = tab === "ALL" ? undefined : eq(refunds.status, tab as "REQUESTED");
  const counts = await db.select({ status: refunds.status, n: sql<number>`count(*)::int` }).from(refunds).groupBy(refunds.status);
  const cnt = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const [rows, total] = await Promise.all([
    db
      .select({ r: refunds, bn: bookings.bookingNumber, bookingId: bookings.id, paid: bookings.paidAmount, refunded: bookings.refundedAmount, customer: users.name })
      .from(refunds)
      .innerJoin(bookings, eq(bookings.id, refunds.bookingId))
      .innerJoin(users, eq(users.id, bookings.customerId))
      .where(where)
      .orderBy(desc(refunds.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(refunds)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
  ]);
  return (
    <>
      <PageHeader title="Refunds" description="Approve or reject refund requests, retry failed gateway refunds and track provider refund ids. Cancellation refunds per policy are approved automatically." />
      <LinkTabs active={tab} tabs={TABS.map((t) => ({ key: t, label: t === "ALL" ? "All refunds" : t.charAt(0) + t.slice(1).toLowerCase(), href: `?tab=${t}`, count: t === "REQUESTED" || t === "FAILED" ? cnt(t) : undefined }))} />
      {!rows.length ? (
        <EmptyState title={tab === "REQUESTED" ? "No refund requests waiting" : "No refunds"} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Requested</TH>
              <TH>Booking</TH>
              <TH>Kind / reason</TH>
              <TH className="text-right">Amount</TH>
              <TH>Status</TH>
              <TH>Provider refund id</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map(({ r, bn, bookingId, paid, refunded, customer }) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-xs">{prettyDateTime(r.createdAt)}</TD>
                <TD>
                  <Link href={`/admin/bookings/${bookingId}`} className="font-medium text-brand-700 hover:underline">
                    {bn}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {customer} · paid <Money paise={paid} /> · refunded <Money paise={refunded} />
                  </p>
                </TD>
                <TD className="max-w-xs text-xs">
                  <Badge>{r.kind.toLowerCase()}</Badge> {r.reason}
                  {r.adminNotes && <p className="mt-0.5 whitespace-pre-line text-slate-500">{r.adminNotes}</p>}
                </TD>
                <TD className="text-right">
                  <Money paise={r.amount} />
                </TD>
                <TD>
                  <StatusBadge status={r.status} />
                  {r.processedAt && <p className="text-xs text-slate-500">{prettyDateTime(r.processedAt)}</p>}
                </TD>
                <TD className="font-mono text-xs">{r.providerRefundId ?? "—"}</TD>
                <TD className="space-x-1 whitespace-nowrap text-right">
                  {r.status === "REQUESTED" && (
                    <>
                      <FormDialogButton
                        url={`/api/admin/refunds/${r.id}`}
                        label="Approve"
                        variant="primary"
                        title="Approve refund"
                        description={`Refundable balance: ₹${((paid - refunded) / 100).toLocaleString("en-IN")}`}
                        fields={[
                          { name: "action", label: "Action", type: "select", options: [{ value: "approve", label: "Approve & send to gateway" }], required: true, defaultValue: "approve" },
                          { name: "amount", label: "Amount", type: "money", required: true, defaultValue: String(r.amount / 100) },
                          { name: "notes", label: "Notes", type: "textarea" },
                        ]}
                        submitText="Approve refund"
                        success="Refund approved and initiated"
                      />
                      <ActionButton url={`/api/admin/refunds/${r.id}`} body={{ action: "reject" }} label="Reject" danger note={{ field: "notes", label: "Reason (shared with customer)", required: true }} success="Refund rejected" />
                    </>
                  )}
                  {(r.status === "FAILED" || r.status === "APPROVED") && <ActionButton url={`/api/admin/refunds/${r.id}`} body={{ action: "retry" }} label="Retry" variant="primary" confirm="Retry sending this refund to the payment gateway?" success="Refund re-sent" />}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/refunds" query={{ tab }} />
    </>
  );
}
