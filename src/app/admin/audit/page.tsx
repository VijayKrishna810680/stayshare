import { and, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { EmptyState, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar, JsonView } from "@/components/admin/widgets";
import { one, pageArgs, usersWithRole, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit logs" };

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await pageUser({ perm: "audit.view" });
  const sp = await searchParams;
  const { page, pageSize, offset } = pageArgs(sp, 50);
  const conds: SQL[] = [];
  if (one(sp.actor)) conds.push(eq(auditLogs.actorId, one(sp.actor)));
  if (one(sp.action)) conds.push(ilike(auditLogs.action, `%${one(sp.action)}%`));
  if (one(sp.entity)) conds.push(eq(auditLogs.entityType, one(sp.entity)));
  if (one(sp.entityId)) conds.push(eq(auditLogs.entityId, one(sp.entityId)));
  if (one(sp.from)) conds.push(gte(auditLogs.createdAt, new Date(`${one(sp.from)}T00:00:00+05:30`)));
  if (one(sp.to)) conds.push(lte(auditLogs.createdAt, new Date(`${one(sp.to)}T23:59:59+05:30`)));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total, entities, admins, supers] = await Promise.all([
    db.select({ a: auditLogs, actor: users.name, email: users.email }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId)).where(where).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    db.selectDistinct({ e: auditLogs.entityType }).from(auditLogs).orderBy(auditLogs.entityType),
    usersWithRole("ADMIN"),
    usersWithRole("SUPER_ADMIN"),
  ]);
  const actors = [...supers, ...admins].filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i).map((x) => ({ value: x.id, label: x.name }));
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader title="Audit logs" description="Immutable record of important actions by administrators, owners and the system — who did what, when, from where, with before/after values." />
      <FilterBar
        fields={[
          { name: "action", label: "Action contains", type: "text", placeholder: "e.g. price_plan, property.approve" },
          { name: "actor", label: "Actor", type: "select", options: actors },
          { name: "entity", label: "Entity", type: "select", options: entities.map((e) => ({ value: e.e, label: e.e })) },
          { name: "entityId", label: "Entity id", type: "text", placeholder: "UUID" },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      {!rows.length ? (
        <EmptyState title="No audit entries match" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Before</TH>
              <TH>After</TH>
              <TH>IP / agent</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ a, actor, email }) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-xs">{prettyDateTime(a.createdAt)}</TD>
                <TD className="text-sm">
                  {actor ?? "System"}
                  {email && <p className="text-xs text-slate-500">{email}</p>}
                </TD>
                <TD>
                  <code className="text-xs">{a.action}</code>
                </TD>
                <TD className="text-xs">
                  {a.entityType}
                  {a.entityId && (
                    <a href={`?entity=${encodeURIComponent(a.entityType)}&entityId=${encodeURIComponent(a.entityId)}`} className="block max-w-[180px] truncate font-mono text-[11px] text-brand-700 hover:underline">
                      {a.entityId}
                    </a>
                  )}
                </TD>
                <TD>
                  <JsonView value={a.before} label="Before" />
                </TD>
                <TD>
                  <JsonView value={a.after} label="After" />
                </TD>
                <TD className="max-w-[160px] text-[11px] text-slate-500">
                  {a.ip ?? "—"}
                  <p className="truncate" title={a.userAgent ?? ""}>
                    {a.userAgent}
                  </p>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/audit" query={query} />
    </>
  );
}
