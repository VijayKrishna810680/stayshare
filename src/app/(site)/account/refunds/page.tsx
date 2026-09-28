import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ReceiptIndianRupee } from "lucide-react";
import { db } from "@/db";
import { bookings, properties, refunds } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { humanize } from "@/lib/site/labels";
import { EmptyState, PageHeader, StatusBadge, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refunds" };

const STEPS = ["REQUESTED", "APPROVED", "PROCESSING", "COMPLETED"];

export default async function RefundsPage() {
  const user = await pageUser({ next: "/account/refunds" });
  const rows = await db
    .select({ r: refunds, bookingNumber: bookings.bookingNumber, bookingId: bookings.id, property: properties.name })
    .from(refunds)
    .innerJoin(bookings, eq(bookings.id, refunds.bookingId))
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.customerId, user.id))
    .orderBy(desc(refunds.createdAt));
  const inProgress = rows.filter((x) => ["REQUESTED", "APPROVED", "PROCESSING"].includes(x.r.status)).reduce((a, x) => a + x.r.amount, 0);
  const done = rows.filter((x) => x.r.status === "COMPLETED").reduce((a, x) => a + x.r.amount, 0);
  return (
    <div>
      <PageHeader title="Refunds" description="Track cancellation, deposit and other refunds." breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Refunds" }]} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="In progress" value={formatINR(inProgress)} icon={<ReceiptIndianRupee className="h-5 w-5" />} tone="accent" />
        <StatCard label="Refunded" value={formatINR(done)} icon={<ReceiptIndianRupee className="h-5 w-5" />} tone="green" />
        <StatCard label="Refund requests" value={rows.length} icon={<ReceiptIndianRupee className="h-5 w-5" />} tone="slate" />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<ReceiptIndianRupee className="h-6 w-6" />} title="No refunds" description="Refunds for cancellations, deposits and approved requests will show up here." />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ r, bookingNumber, bookingId, property }) => {
            const step = STEPS.indexOf(r.status);
            return (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold tabular-nums">{formatINR(r.amount)}</p>
                    <p className="text-sm text-slate-600">
                      {humanize(r.kind)} refund ·{" "}
                      <Link href={`/account/bookings/${bookingId}`} className="font-medium text-brand-700 hover:underline">
                        {bookingNumber}
                      </Link>{" "}
                      · {property}
                    </p>
                    <p className="text-xs text-slate-500">{r.reason}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {["REJECTED", "FAILED"].includes(r.status) ? (
                  <p className="mt-3 rounded-xl bg-red-50 p-2 text-xs text-red-700">{r.status === "REJECTED" ? `Request declined${r.adminNotes ? `: ${r.adminNotes}` : ""}` : "The refund failed at the gateway — our team is retrying it."}</p>
                ) : (
                  <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Refund progress">
                    {STEPS.map((s, i) => (
                      <li key={s} className="text-center">
                        <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand-500" : "bg-slate-200"}`} />
                        <p className={`mt-1 text-[11px] ${i <= step ? "font-semibold text-brand-800" : "text-slate-400"}`}>{humanize(s)}</p>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  Requested {prettyDateTime(r.createdAt)}
                  {r.processedAt ? ` · completed ${prettyDateTime(r.processedAt)}` : ""}
                  {r.providerRefundId ? ` · Ref ${r.providerRefundId}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
