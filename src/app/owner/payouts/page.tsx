import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Landmark } from "lucide-react";
import { db } from "@/db";
import { ownerProfiles, payoutTransactions } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { getSettings } from "@/lib/settings";
import { formatINR } from "@/lib/money";
import { ownerBalance, listOwnerPayouts } from "@/services/settlement";
import { Alert, EmptyState, Money, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ExportLinks } from "@/components/owner/common";
import { DisputeButton, RequestPayoutButton } from "@/components/owner/payouts-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts" };

export default async function Payouts() {
  const u = await pageUser({ role: "OWNER" });
  const bal = await ownerBalance(u.id);
  const list = await listOwnerPayouts(u.id);
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, u.id));
  const { "payout.minPayout": minPayout } = await getSettings(["payout.minPayout"]);
  const tx = list.length ? await db.select().from(payoutTransactions).where(inArray(payoutTransactions.payoutId, list.map((p) => p.id))).orderBy(desc(payoutTransactions.createdAt)) : [];
  const canPay = Boolean(op?.bankVerified || op?.upiId);
  return (
    <>
      <PageHeader title="Payouts" description={`Settlements to ${op?.bankAccountLast4 ? `${op.bankName ?? "bank"} ••••${op.bankAccountLast4}` : op?.upiId ? `UPI ${op.upiId}` : "your account"}. Minimum payout ${formatINR(minPayout)}.`} actions={<RequestPayoutButton eligible={bal.eligible} minPayout={minPayout} canPay={canPay} eligibleLabel={formatINR(bal.eligible)} />} />
      {!canPay && (
        <div className="mb-4">
          <Alert tone="warn" title="Add payout details">
            Add a bank account or UPI ID to receive payouts. <Link href="/owner/bank" className="font-semibold underline">Bank & UPI</Link>
          </Alert>
        </div>
      )}
      {op?.payoutHold && (
        <div className="mb-4">
          <Alert tone="error" title="Payouts on hold">The StayShare finance team has placed your payouts on hold. Contact support for details.</Alert>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Eligible now" value={<Money paise={bal.eligible} />} tone="green" icon={<Landmark className="h-5 w-5" />} />
        <StatCard label="In process" value={<Money paise={bal.inPayout} />} />
        <StatCard label="Paid to date" value={<Money paise={bal.paid} />} tone="accent" />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Landmark className="h-6 w-6" />} title="No payouts yet" description="When earnings become eligible, request a payout here or wait for the automatic settlement cycle." />
      ) : (
        <Table className="[&_table]:min-w-[900px]">
          <THead>
            <tr>
              <TH>Payout</TH>
              <TH>Period</TH>
              <TH className="text-right">Amount</TH>
              <TH className="text-right">Deductions</TH>
              <TH className="text-right">Net</TH>
              <TH>Status</TH>
              <TH>Settlement report</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {list.map((p) => {
              const last = tx.find((t) => t.payoutId === p.id);
              return (
                <TR key={p.id}>
                  <TD>
                    <p className="font-medium">{p.payoutNumber}</p>
                    <p className="text-xs text-slate-500">
                      {p.createdAt.toLocaleDateString("en-IN")} · {p.method}
                      {p.requestedByOwner ? " · requested by you" : ""}
                    </p>
                    {p.reference && <p className="text-xs text-slate-500">Ref {p.reference}</p>}
                  </TD>
                  <TD className="text-xs">
                    {p.periodStart?.toLocaleDateString("en-IN") ?? "—"} – {p.periodEnd?.toLocaleDateString("en-IN") ?? "—"}
                  </TD>
                  <TD className="text-right"><Money paise={p.amount} /></TD>
                  <TD className="text-right"><Money paise={p.deductions} /></TD>
                  <TD className="text-right font-semibold"><Money paise={p.netAmount} /></TD>
                  <TD>
                    <StatusBadge status={p.status} />
                    {p.paidAt && <p className="text-xs text-slate-500">Paid {p.paidAt.toLocaleDateString("en-IN")}</p>}
                    {last?.note && <p className="max-w-48 truncate text-xs text-slate-500" title={last.note}>{last.note}</p>}
                    {p.disputeNote && <p className="max-w-48 truncate text-xs text-amber-700" title={p.disputeNote}>Disputed: {p.disputeNote}</p>}
                  </TD>
                  <TD>
                    <ExportLinks href={`/api/owner/payouts/${p.id}/report`} label="Report" />
                  </TD>
                  <TD className="text-right">
                    <DisputeButton payoutId={p.id} payoutNumber={p.payoutNumber} existing={p.disputeNote} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
