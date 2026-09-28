import "server-only";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { permissions, rolePermissions } from "@/db/schema";
import { PERMISSIONS } from "@/lib/rbac";

export const permKeys = z.array(z.string().refine((k) => k in PERMISSIONS, "Unknown permission"));

/** Replace a role's permission set (creating missing permission rows from the catalogue). */
export async function setRolePermissions(roleId: string, keys: string[]) {
  const uniq = [...new Set(keys)];
  if (uniq.length) {
    await db
      .insert(permissions)
      .values(uniq.map((k) => ({ key: k, module: k.split(".")[0]!, description: PERMISSIONS[k as keyof typeof PERMISSIONS] })))
      .onConflictDoNothing();
  }
  const rows = uniq.length ? await db.select().from(permissions).where(inArray(permissions.key, uniq)) : [];
  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (rows.length) await tx.insert(rolePermissions).values(rows.map((p) => ({ roleId, permissionId: p.id })));
  });
}
