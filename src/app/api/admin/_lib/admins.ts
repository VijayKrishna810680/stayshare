import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { roles, userRoles } from "@/db/schema";
import { badRequest } from "@/lib/errors";

export const NON_ADMIN_ROLES = ["CUSTOMER", "OWNER", "STAFF"];

/** Replace a user's administrative roles; CUSTOMER/OWNER/STAFF memberships are left untouched. */
export async function setAdminRoles(userId: string, roleKeys: string[]) {
  const keys = [...new Set(roleKeys)].filter((k) => !NON_ADMIN_ROLES.includes(k));
  const found = keys.length ? await db.select().from(roles).where(inArray(roles.key, keys)) : [];
  if (found.length !== keys.length) throw badRequest("Unknown role selected");
  const current = await db.select({ roleId: userRoles.roleId, key: roles.key }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, userId));
  const remove = current.filter((c) => !NON_ADMIN_ROLES.includes(c.key) && !keys.includes(c.key)).map((c) => c.roleId);
  await db.transaction(async (tx) => {
    if (remove.length) await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, remove)));
    if (found.length) await tx.insert(userRoles).values(found.map((r) => ({ userId, roleId: r.id }))).onConflictDoNothing();
  });
  return { before: current.map((c) => c.key), after: [...current.filter((c) => !remove.includes(c.roleId)).map((c) => c.key), ...keys.filter((k) => !current.some((c) => c.key === k))] };
}
