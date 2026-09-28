import Link from "next/link";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { ownerProfiles, payouts, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Badge, EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LinkTabs } from "@/components/admin/ui";
import { ActionButton, ExportButtons, FilterBar, FormDialogButton, Toggle } from "@/components/admin/widgets";
import { ownerBalance } from "@/services/settlement";
import { one, ownerOptions, pageArgs, type SearchParams } from "../_lib/query";
import { PayoutActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts" };

export default async function PayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  await pageUser({ perm: "payouts.manage" });
  const sp = await searchParams;
  const tab = one(sp.tab) || "balances";
  const [counts] = await db.execute(sql`SELECT count(*) FILTER (WHERE status IN ('PENDING','APPROVED','PROCESSING'))::int AS open, count(*) FILTER (WHERE status = 'ON_HOLD')::int AS held FROM payouts`).then((r) => r.rows as { open: number; held: number }[]);
  return (
    <>
      <PageHeader
        title="Owner payouts"
        description="Settle owner earnings: create payouts from eligible balances, approve, hold, mark paid with the bank UTR, or record failures and reversals."
        actions={<ExportButtons href={`/api/admin/payouts/export?${new URLSearchParams(Object.entries({ from: one(sp.from), to: one(sp.to), owner: one(sp.owner) }).filter(([, v]) => v)).toString()}`} />}
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "balances", label: "Owner balances", href: "?tab=balances" },
          { key: "payouts", label: "Payouts", href: "?tab=payouts", count: counts?.open ?? 0 },
        ]}
      />
      {tab === "payouts" ? <PayoutList sp={sp} /> : <Balances />}
    </>
  );
}

async function Balances() {
  const owners = await db
    .select({ id: users.id, name: users.name, op: ownerProfiles })
    .from(ownerProfiles)
    .innerJoin(users, eq(users.id, ownerProfiles.userId))
    .orderBy(asc(users.name));
  const rows = await Promise.all(owners.map(async (o) => ({ ...o, bal: await ownerBalance(o.id) })));
  if (!rows.length) return <EmptyState title="No property owners yet" />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Owner</TH>
          <TH>KYC / bank</TH>
          <TH className="text-right">Pending</TH>
          <TH className="text-right">Eligible</TH>
          <TH className="text-right">In payout</TH>
          <TH className="text-right">Paid</TH>
          <TH>Cycle</TH>
          <TH>Hold</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map(({ id, name, op, bal }) => (
          <TR key={id}>
            <TD>
              <Link href={`/admin/users/owners/${id}`} className="font-medium hover:underline">
                {name}
              </Link>
              <p className="text-xs text-slate-500">{op.businessName}</p>
            </TD>
            <TD className="space-y-1">
              <StatusBadge status={op.kycStatus} />
              <div>
                {op.bankVerified ? (
                  <Badge tone="green">Bank verified</Badge>
                ) : op.bankAccountLast4 || op.upiId ? (
                  <ActionButton url={`/api/admin/owners/${id}/bank`} body={{ verified: true }} label="Verify bank" confirm="Confirm the bank / UPI details were verified?" success="Bank verified" />
                ) : (
                  <Badge tone="amber">No bank details</Badge>
                )}
              </div>
              {op.bankAccountLast4 && (
                <p className="text-xs text-slate-500">
                  {op.bankName} ••{op.bankAccountLast4} · {op.bankIfsc}
                </p>
              )}
              {op.upiId && <p className="text-xs text-slate-500">UPI {op.upiId}</p>}
            </TD>
            <TD className="text-right">
              <Money paise={bal.pending} />
            </TD>
            <TD className="text-right font-semibold">
              <Money paise={bal.eligible} />
            </TD>
            <TD className="text-right">
              <Money paise={bal.inPayout} />
            </TD>
            <TD className="text-right">
              <Money paise={bal.paid} />
            </TD>
            <TD>
              <FormDialogButton
                url={`/api/admin/owners/${id}`}
                method="PATCH"
                label={`${op.settlementCycleDays} days`}
                variant="ghost"
                title="Settlement cycle"
                description="How often this owner is paid out (days)."
                fields={[{ name: "settlementCycleDays", label: "Settlement cycle (days)", type: "number", required: true, defaultValue: op.settlementCycleDays }]}
                success="Settlement cycle updated"
              />
            </TD>
            <TD>
              <Toggle url={`/api/admin/owners/${id}`} field="payoutHold" value={op.payoutHold} label="Hold" />
            </TD>
            <TD className="text-right">
              {bal.eligible > 0 && (
                <FormDialogButton
                  url="/api/admin/payouts"
                  label="Create payout"
                  variant="primary"
                  title={`Create payout for ${name}`}
                  description={`Bundles all eligible earnings (₹${(bal.eligible / 100).toLocaleString("en-IN")}) into one payout.${op.payoutHold ? " This owner is on payout hold — the payout will start ON HOLD." : ""}`}
                  fields={[
                    { name: "ownerId", label: "Owner", type: "select", options: [{ value: id, label: name }], required: true, defaultValue: id },
                    { name: "note", label: "Note", type: "textarea" },
                  ]}
                  submitText="Create payout"
                  success="Payout created"
                />
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

async function PayoutList({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { page, pageSize, offset } = pageArgs(sp, 25);
  const conds: SQL[] = [];
  if (one(sp.status)) conds.push(eq(payouts.status, one(sp.status) as "PENDING"));
  if (one(sp.owner)) conds.push(eq(payouts.ownerId, one(sp.owner)));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total, owners] = await Promise.all([
    db.select({ p: payouts, owner: users.name }).from(payouts).innerJoin(users, eq(users.id, payouts.ownerId)).where(where).orderBy(desc(payouts.createdAt)).limit(pageSize).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(payouts)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    ownerOptions(),
  ]);
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <FilterBar
        fields={[
          { name: "status", label: "Status", type: "select", options: ["PENDING", "ON_HOLD", "APPROVED", "PROCESSING", "PAID", "FAILED", "REVERSED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) },
          { name: "owner", label: "Owner", type: "select", options: owners },
        ]}
      />
      {!rows.length ? (
        <EmptyState title="No payouts" description="Create payouts from the Owner balances tab." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Payout</TH>
              <TH>Owner</TH>
              <TH className="text-right">Gross</TH>
              <TH className="text-right">Deductions</TH>
              <TH className="text-right">Net</TH>
              <TH>Status</TH>
              <TH>Reference</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map(({ p, owner }) => (
              <TR key={p.id}>
                <TD>
                  <Link href={`/admin/payouts/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.payoutNumber}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {prettyDateTime(p.createdAt)} · {p.requestedByOwner ? "owner request" : "admin"} · {p.method}
                  </p>
                </TD>
                <TD>{owner}</TD>
                <TD className="text-right">
                  <Money paise={p.amount} />
                </TD>
                <TD className="text-right">
                  <Money paise={p.deductions} />
                </TD>
                <TD className="text-right font-semibold">
                  <Money paise={p.netAmount} />
                </TD>
                <TD>
                  <StatusBadge status={p.status} />
                  {p.disputeNote && <Badge tone="red">Disputed</Badge>}
                </TD>
                <TD className="font-mono text-xs">{p.reference ?? "—"}</TD>
                <TD>
                  <PayoutActions id={p.id} status={p.status} amount={p.amount} deductions={p.deductions} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/payouts" query={query} />
    </>
  );
}
