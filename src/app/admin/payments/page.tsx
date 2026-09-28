import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bookings, paymentTransactions, paymentWebhooks, payments, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Badge, EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LinkTabs } from "@/components/admin/ui";
import { ExportButtons, FilterBar, JsonView } from "@/components/admin/widgets";
import { one, pageArgs, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

const STATUSES = ["CREATED", "PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: "payments.view" });
  const sp = await searchParams;
  const tab = one(sp.tab) || "payments";
  const [counts] = await db.execute(sql`SELECT (SELECT count(*) FROM payments WHERE status = 'FAILED')::int AS failed, (SELECT count(*) FROM payment_webhooks WHERE NOT signature_ok OR error IS NOT NULL)::int AS bad`).then((r) => r.rows as { failed: number; bad: number }[]);
  return (
    <>
      <PageHeader title="Payments" description="Payment orders, gateway transactions and the raw webhook log (including invalid signatures)." />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "payments", label: "Payments", href: "?tab=payments" },
          { key: "failed", label: "Failed payments", href: "?tab=failed", count: counts?.failed ?? 0 },
          { key: "transactions", label: "Transactions", href: "?tab=transactions" },
          { key: "webhooks", label: "Webhook log", href: "?tab=webhooks", count: counts?.bad ?? 0 },
        ]}
      />
      {tab === "transactions" ? <Transactions sp={sp} /> : tab === "webhooks" ? <Webhooks sp={sp} /> : <PaymentList sp={sp} failedOnly={tab === "failed"} canExport={u.has("reports.financial")} />}
    </>
  );
}

async function PaymentList({ sp, failedOnly, canExport }: { sp: Record<string, string | string[] | undefined>; failedOnly: boolean; canExport: boolean }) {
  const { page, pageSize, offset } = pageArgs(sp, 30);
  const conds: SQL[] = [];
  const q = one(sp.q).trim();
  if (q) conds.push(or(ilike(bookings.bookingNumber, `%${q}%`), ilike(payments.providerOrderId, `%${q}%`), ilike(payments.providerPaymentId, `%${q}%`))!);
  if (failedOnly) conds.push(eq(payments.status, "FAILED"));
  else if (one(sp.status)) conds.push(eq(payments.status, one(sp.status) as (typeof STATUSES)[number]));
  if (one(sp.purpose)) conds.push(eq(payments.purpose, one(sp.purpose) as "BOOKING"));
  if (one(sp.from)) conds.push(gte(payments.createdAt, new Date(`${one(sp.from)}T00:00:00+05:30`)));
  if (one(sp.to)) conds.push(lte(payments.createdAt, new Date(`${one(sp.to)}T23:59:59+05:30`)));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db.select({ p: payments, bn: bookings.bookingNumber, customer: users.name }).from(payments).leftJoin(bookings, eq(bookings.id, payments.bookingId)).leftJoin(users, eq(users.id, sql`coalesce(${payments.userId}, ${bookings.customerId})`)).where(where).orderBy(desc(payments.createdAt)).limit(pageSize).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(payments)
      .leftJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(where)
      .then((r) => r[0]?.n ?? 0),
  ]);
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <FilterBar
        fields={[
          { name: "q", label: "Search", type: "text", placeholder: "Booking #, order id or payment id" },
          ...(failedOnly ? [] : [{ name: "status", label: "Status", type: "select" as const, options: STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) }]),
          { name: "purpose", label: "Purpose", type: "select", options: ["BOOKING", "SECURITY_DEPOSIT", "EXTENSION", "MODIFICATION", "SERVICE", "CHECKOUT_DUES", "SUBSCRIPTION"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      {canExport && (
        <div className="mb-3 flex justify-end">
          <ExportButtons href={`/api/admin/reports/payments?${new URLSearchParams(Object.entries({ from: one(sp.from), to: one(sp.to), paymentStatus: failedOnly ? "FAILED" : one(sp.status) }).filter(([, v]) => v)).toString()}`} />
        </div>
      )}
      {!rows.length ? (
        <EmptyState title={failedOnly ? "No failed payments" : "No payments found"} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Created</TH>
              <TH>Booking / customer</TH>
              <TH>Purpose</TH>
              <TH>Provider refs</TH>
              <TH>Method</TH>
              <TH>Status</TH>
              <TH className="text-right">Amount</TH>
              <TH className="text-right">Fee</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ p, bn, customer }) => (
              <TR key={p.id}>
                <TD className="whitespace-nowrap text-xs">{prettyDateTime(p.createdAt)}</TD>
                <TD>
                  {p.bookingId ? (
                    <Link href={`/admin/bookings/${p.bookingId}`} className="font-medium text-brand-700 hover:underline">
                      {bn}
                    </Link>
                  ) : p.subscriptionId ? (
                    <Badge tone="purple">Subscription</Badge>
                  ) : (
                    "—"
                  )}
                  <p className="text-xs text-slate-500">{customer}</p>
                </TD>
                <TD className="text-xs">{p.purpose.replace("_", " ").toLowerCase()}</TD>
                <TD className="font-mono text-[11px]">
                  {p.provider}
                  <br />
                  {p.providerOrderId}
                  {p.providerPaymentId && (
                    <>
                      <br />
                      {p.providerPaymentId}
                    </>
                  )}
                </TD>
                <TD className="text-xs">{p.method}</TD>
                <TD>
                  <StatusBadge status={p.status} />
                  {p.failureReason && <p className="max-w-[200px] text-xs text-red-600">{p.failureReason}</p>}
                </TD>
                <TD className="text-right">
                  <Money paise={p.amount} />
                  {p.refundedAmount > 0 && (
                    <p className="text-xs text-purple-700">
                      −<Money paise={p.refundedAmount} />
                    </p>
                  )}
                </TD>
                <TD className="text-right text-xs">
                  <Money paise={p.gatewayFee} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/payments" query={query} />
    </>
  );
}

async function Transactions({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { page, pageSize, offset } = pageArgs(sp, 50);
  const [rows, total] = await Promise.all([
    db.select({ t: paymentTransactions, orderId: payments.providerOrderId, bookingId: payments.bookingId, bn: bookings.bookingNumber }).from(paymentTransactions).innerJoin(payments, eq(payments.id, paymentTransactions.paymentId)).leftJoin(bookings, eq(bookings.id, payments.bookingId)).orderBy(desc(paymentTransactions.createdAt)).limit(pageSize).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(paymentTransactions)
      .then((r) => r[0]?.n ?? 0),
  ]);
  if (!rows.length) return <EmptyState title="No transactions yet" />;
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>When</TH>
            <TH>Event</TH>
            <TH>Payment</TH>
            <TH>Status</TH>
            <TH className="text-right">Amount</TH>
            <TH>Raw</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map(({ t, orderId, bookingId, bn }) => (
            <TR key={t.id}>
              <TD className="whitespace-nowrap text-xs">{prettyDateTime(t.createdAt)}</TD>
              <TD>
                <code className="text-xs">{t.event}</code>
              </TD>
              <TD className="text-xs">
                {bookingId ? (
                  <Link href={`/admin/bookings/${bookingId}`} className="text-brand-700 hover:underline">
                    {bn}
                  </Link>
                ) : null}
                <p className="font-mono text-[11px] text-slate-500">{orderId}</p>
              </TD>
              <TD>
                <StatusBadge status={t.status} />
              </TD>
              <TD className="text-right">
                <Money paise={t.amount} />
              </TD>
              <TD>
                <JsonView value={t.raw} label="View" />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/payments" query={{ tab: "transactions" }} />
    </>
  );
}

async function Webhooks({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { page, pageSize, offset } = pageArgs(sp, 50);
  const where = one(sp.bad) === "1" ? or(eq(paymentWebhooks.signatureOk, false), sql`${paymentWebhooks.error} is not null`) : undefined;
  const [rows, total] = await Promise.all([
    db.select().from(paymentWebhooks).where(where).orderBy(desc(paymentWebhooks.createdAt)).limit(pageSize).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(paymentWebhooks)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
  ]);
  return (
    <>
      <div className="mb-3 flex gap-2 text-sm">
        <Link href="?tab=webhooks" className={one(sp.bad) === "1" ? "text-slate-500 hover:underline" : "font-semibold"}>
          All
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="?tab=webhooks&bad=1" className={one(sp.bad) === "1" ? "font-semibold" : "text-slate-500 hover:underline"}>
          Invalid signature / errors only
        </Link>
      </div>
      {!rows.length ? (
        <EmptyState title="No webhooks received" description="Gateway webhooks posted to /api/webhooks/payments/* are logged here." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Received</TH>
              <TH>Provider</TH>
              <TH>Event</TH>
              <TH>Signature</TH>
              <TH>Processed</TH>
              <TH>Error</TH>
              <TH>Payload</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((w) => (
              <TR key={w.id}>
                <TD className="whitespace-nowrap text-xs">{prettyDateTime(w.createdAt)}</TD>
                <TD className="text-xs">{w.provider}</TD>
                <TD>
                  <code className="text-xs">{w.eventType}</code>
                  <p className="font-mono text-[11px] text-slate-500">{w.eventId}</p>
                </TD>
                <TD>{w.signatureOk ? <Badge tone="green">Valid</Badge> : <Badge tone="red">Invalid</Badge>}</TD>
                <TD className="whitespace-nowrap text-xs">{w.processedAt ? prettyDateTime(w.processedAt) : "—"}</TD>
                <TD className="max-w-xs text-xs text-red-600">{w.error ?? ""}</TD>
                <TD>
                  <JsonView value={w.payload} label="View" />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/payments" query={{ tab: "webhooks", bad: one(sp.bad) || undefined }} />
    </>
  );
}
