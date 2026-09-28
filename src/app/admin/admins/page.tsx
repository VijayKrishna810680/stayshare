import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { permissions, rolePermissions, roles, userRoles, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/rbac";
import { Alert, Badge, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LinkTabs } from "@/components/admin/ui";
import { CreateAdminButton, EditRolesButton, RoleEditor } from "@/components/admin/access";
import { ActionButton } from "@/components/admin/widgets";
import { one, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administrators" };

const NON_ADMIN = ["CUSTOMER", "OWNER", "STAFF"];

export default async function AdminsPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: "admins.manage" });
  const sp = await searchParams;
  const tab = one(sp.tab) || "admins";
  const [roleRows, memberships, rp] = await Promise.all([
    db.select().from(roles).orderBy(asc(roles.isSystem), asc(roles.name)),
    db.select({ userId: users.id, name: users.name, email: users.email, phone: users.phone, status: users.status, lastLoginAt: users.lastLoginAt, roleKey: roles.key }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).innerJoin(roles, eq(roles.id, userRoles.roleId)),
    db.select({ roleId: rolePermissions.roleId, key: permissions.key }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)),
  ]);
  const adminRoles = roleRows.filter((r) => !NON_ADMIN.includes(r.key)).map((r) => ({ key: r.key, name: r.name, description: r.description }));
  const byUser = new Map<string, { id: string; name: string; email: string | null; phone: string | null; status: string; lastLoginAt: Date | null; roles: string[] }>();
  for (const m of memberships) {
    const e = byUser.get(m.userId) ?? { id: m.userId, name: m.name, email: m.email, phone: m.phone, status: m.status, lastLoginAt: m.lastLoginAt, roles: [] };
    e.roles.push(m.roleKey);
    byUser.set(m.userId, e);
  }
  const admins = [...byUser.values()].filter((x) => x.roles.some((r) => !NON_ADMIN.includes(r))).sort((a, b) => a.name.localeCompare(b.name));
  const perms = Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));
  return (
    <>
      <PageHeader title="Administrators" description="Team accounts with access to this console, and the roles & permissions that control what each person can see and do." actions={tab === "admins" ? <CreateAdminButton roles={adminRoles} canSuper={u.isSuperAdmin} /> : <RoleEditor perms={perms} isNew />} />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "admins", label: `Administrators (${admins.length})`, href: "?tab=admins" },
          { key: "roles", label: "Roles & permissions", href: "?tab=roles" },
        ]}
      />
      <div className="mb-4">
        <Alert tone="info">Creating administrators and changing roles or permissions requires OTP step-up verification. Permission changes apply on the member&apos;s next request.</Alert>
      </div>
      {tab === "roles" ? (
        <Table>
          <THead>
            <tr>
              <TH>Role</TH>
              <TH>Type</TH>
              <TH>Permissions</TH>
              <TH>Members</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {roleRows.map((r) => {
              const p = rp.filter((x) => x.roleId === r.id).map((x) => x.key);
              const members = memberships.filter((m) => m.roleKey === r.key).length;
              return (
                <TR key={r.id}>
                  <TD>
                    <p className="font-medium">{r.name}</p>
                    <code className="text-xs text-slate-500">{r.key}</code>
                    {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
                  </TD>
                  <TD>{r.isSystem ? <Badge>System</Badge> : <Badge tone="purple">Custom</Badge>}</TD>
                  <TD className="max-w-md text-xs text-slate-600">{r.key === "SUPER_ADMIN" ? "All permissions" : p.length ? p.join(", ") : "None"}</TD>
                  <TD>{members}</TD>
                  <TD className="text-right">
                    <RoleEditor role={{ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, permissions: p, members }} perms={perms} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Contact</TH>
              <TH>Roles</TH>
              <TH>Status</TH>
              <TH>Last login</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {admins.map((a) => (
              <TR key={a.id}>
                <TD className="font-medium">
                  {a.name} {a.id === u.id && <Badge tone="brand">You</Badge>}
                </TD>
                <TD className="text-xs">
                  {a.email}
                  <br />
                  {a.phone}
                </TD>
                <TD className="space-x-1">
                  {a.roles
                    .filter((r) => !NON_ADMIN.includes(r))
                    .map((r) => (
                      <Badge key={r} tone={r === "SUPER_ADMIN" ? "red" : "blue"}>
                        {r}
                      </Badge>
                    ))}
                </TD>
                <TD>
                  <StatusBadge status={a.status} />
                </TD>
                <TD className="text-xs">{prettyDateTime(a.lastLoginAt)}</TD>
                <TD className="space-x-1 whitespace-nowrap text-right">
                  {a.id !== u.id && (!a.roles.includes("SUPER_ADMIN") || u.isSuperAdmin) && (
                    <>
                      <EditRolesButton userId={a.id} name={a.name} roles={adminRoles} current={a.roles.filter((r) => !NON_ADMIN.includes(r))} canSuper={u.isSuperAdmin} />
                      {u.has("users.manage") &&
                        (a.status === "SUSPENDED" ? (
                          <ActionButton url={`/api/admin/users/${a.id}/status`} body={{ status: "ACTIVE" }} label="Reactivate" success="Reactivated" />
                        ) : (
                          <ActionButton url={`/api/admin/users/${a.id}/status`} body={{ status: "SUSPENDED" }} label="Suspend" danger note={{ field: "reason", label: "Reason", required: true }} success="Suspended — sessions revoked" />
                        ))}
                    </>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
