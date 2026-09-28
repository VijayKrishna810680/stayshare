import Link from "next/link";
import { and, desc, eq, ilike, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { supportTickets, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { EmptyState, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar } from "@/components/admin/widgets";
import { one, pageArgs, type SearchParams } from "../_lib/query";
import { agentOptions } from "./agents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support tickets" };

const opt = (v: string[]) => v.map((x) => ({ value: x, label: x.replace(/_/g, " ").toLowerCase() }));

export default async function SupportPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await pageUser({ perm: "support.manage" });
  const sp = await searchParams;
  const { page, pageSize, offset } = pageArgs(sp, 30);
  const conds: SQL[] = [];
  const q = one(sp.q).trim();
  if (q) conds.push(or(ilike(supportTickets.ticketNumber, `%${q}%`), ilike(supportTickets.subject, `%${q}%`))!);
  const status = one(sp.status) || "OPEN_ALL";
  if (status === "OPEN_ALL") conds.push(notInArray(supportTickets.status, ["RESOLVED", "CLOSED"]));
  else if (status !== "ALL") conds.push(eq(supportTickets.status, status as "OPEN"));
  if (one(sp.priority)) conds.push(eq(supportTickets.priority, one(sp.priority) as "LOW"));
  if (one(sp.category)) conds.push(eq(supportTickets.category, one(sp.category) as "OTHER"));
  if (one(sp.assignee) === "me") conds.push(eq(supportTickets.assignedToId, me.id));
  else if (one(sp.assignee) === "none") conds.push(isNull(supportTickets.assignedToId));
  else if (one(sp.assignee)) conds.push(eq(supportTickets.assignedToId, one(sp.assignee)));
  const where = conds.length ? and(...conds) : undefined;
  const agent = alias(users, "agent");
  const [rows, total, agents] = await Promise.all([
    db
      .select({ t: supportTickets, raiser: users.name, agent: agent.name })
      .from(supportTickets)
      .innerJoin(users, eq(users.id, supportTickets.raisedById))
      .leftJoin(agent, eq(agent.id, supportTickets.assignedToId))
      .where(where)
      .orderBy(sql`case ${supportTickets.priority} when 'URGENT' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end`, desc(supportTickets.updatedAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    agentOptions(),
  ]);
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader title="Support tickets" description="Tickets raised by customers, owners and staff. Assign an agent, update status and priority, reply or add internal notes." />
      <FilterBar
        fields={[
          { name: "q", label: "Search", type: "text", placeholder: "Ticket # or subject" },
          { name: "status", label: "Status", type: "select", options: [{ value: "ALL", label: "All statuses" }, ...opt(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "WAITING_FOR_PROPERTY", "RESOLVED", "CLOSED"])] },
          { name: "priority", label: "Priority", type: "select", options: opt(["URGENT", "HIGH", "MEDIUM", "LOW"]) },
          { name: "category", label: "Category", type: "select", options: opt(["BOOKING", "PAYMENT", "REFUND", "CHECK_IN", "PROPERTY_ISSUE", "SAFETY", "ROOM_ISSUE", "OWNER_PAYOUT", "TECHNICAL", "OTHER"]) },
          { name: "assignee", label: "Assignee", type: "select", options: [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...agents] },
        ]}
      />
      <p className="mb-2 text-xs text-slate-500">Default view shows unresolved tickets. Choose “All statuses” to include resolved and closed.</p>
      {!rows.length ? (
        <EmptyState title="No tickets" description="Nothing needs attention right now." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Ticket</TH>
              <TH>Raised by</TH>
              <TH>Category</TH>
              <TH>Priority</TH>
              <TH>Status</TH>
              <TH>Assignee</TH>
              <TH>Updated</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ t, raiser, agent: ag }) => (
              <TR key={t.id}>
                <TD>
                  <Link href={`/admin/support/${t.id}`} className="font-medium text-brand-700 hover:underline">
                    {t.ticketNumber}
                  </Link>
                  <p className="max-w-xs truncate text-xs text-slate-600">{t.subject}</p>
                </TD>
                <TD className="text-sm">
                  {raiser}
                  <p className="text-xs text-slate-500">{t.raisedByRole.toLowerCase()}</p>
                </TD>
                <TD className="text-xs">{t.category.replace(/_/g, " ").toLowerCase()}</TD>
                <TD>
                  <StatusBadge status={t.priority} />
                </TD>
                <TD>
                  <StatusBadge status={t.status} />
                </TD>
                <TD className="text-sm">{ag ?? <span className="text-slate-400">Unassigned</span>}</TD>
                <TD className="whitespace-nowrap text-xs">{prettyDateTime(t.updatedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/support" query={query} />
    </>
  );
}
