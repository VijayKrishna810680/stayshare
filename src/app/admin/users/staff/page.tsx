import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { properties, staffAssignments, staffProfiles, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Badge, EmptyState, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar } from "@/components/admin/widgets";
import { one, type SearchParams } from "../../_lib/query";
import { listUsersWithRole, STATUS_OPTS } from "../../_lib/users";
import { StatusButton } from "../status-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await pageUser({ perm: "users.view" });
  const sp = await searchParams;
  const { rows, total, page, pageSize } = await listUsersWithRole("STAFF", sp);
  const ids = rows.map((r) => r.id);
  const employer = alias(users, "employer");
  const [profiles, assigns] = ids.length
    ? await Promise.all([
        db.select({ sp: staffProfiles, employer: employer.name }).from(staffProfiles).innerJoin(employer, eq(employer.id, staffProfiles.employerId)).where(inArray(staffProfiles.userId, ids)),
        db.select({ userId: staffAssignments.userId, name: properties.name }).from(staffAssignments).innerJoin(properties, eq(properties.id, staffAssignments.propertyId)).where(inArray(staffAssignments.userId, ids)),
      ])
    : [[], []];
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader title="Property staff" description="Front-desk and housekeeping accounts created by property owners, with their property assignments." />
      <FilterBar fields={[{ name: "q", label: "Search", type: "text", placeholder: "Name, email or phone" }, { name: "status", label: "Status", type: "select", options: STATUS_OPTS }]} />
      {!rows.length ? (
        <EmptyState title="No staff accounts" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Staff</TH>
              <TH>Employer</TH>
              <TH>Assigned properties</TH>
              <TH>Last login</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((s) => {
              const p = profiles.find((x) => x.sp.userId === s.id);
              return (
                <TR key={s.id}>
                  <TD>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.email ?? s.phone} · {p?.sp.designation ?? "staff"}
                    </p>
                  </TD>
                  <TD className="text-sm">
                    {p?.employer ?? "—"} {p && !p.sp.active && <Badge>inactive</Badge>}
                  </TD>
                  <TD className="text-xs">{assigns.filter((a) => a.userId === s.id).map((a) => a.name).join(", ") || "—"}</TD>
                  <TD className="text-xs">{prettyDateTime(s.lastLoginAt)}</TD>
                  <TD>
                    <StatusBadge status={s.status} />
                  </TD>
                  <TD className="text-right">{me.has("users.manage") && <StatusButton id={s.id} status={s.status} />}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/users/staff" query={query} />
    </>
  );
}
