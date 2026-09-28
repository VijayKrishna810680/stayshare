import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { permissions, rolePermissions, roles, userRoles, users } from "@/db/schema";

/** Users holding support.manage (or livechat.manage) — candidates for ticket assignment. */
export async function agentOptions() {
  const rows = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(inArray(permissions.key, ["support.manage", "livechat.manage"]))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
