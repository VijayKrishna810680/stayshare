import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { permissions, rolePermissions, roles, userRoles } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { requireStepUp } from "@/lib/auth/step-up";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { permKeys, setRolePermissions } from "../../_lib/roles";
import { logAudit } from "../../_lib/util";

/** PUT {name, description, permissions[]} — SUPER_ADMIN always keeps every permission. */
export const PUT = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admins.manage");
  const b = await parseBody(req, z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().max(300).nullable().optional(), permissions: permKeys }));
  const [r] = await db.select().from(roles).where(eq(roles.id, params.id));
  if (!r) throw notFound("Role not found");
  await requireStepUp(u);
  const before = (await db.select({ key: permissions.key }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).where(eq(rolePermissions.roleId, r.id))).map((x) => x.key);
  let perms = [...new Set(b.permissions)];
  if (r.key === "SUPER_ADMIN") perms = Object.keys(PERMISSIONS);
  if (r.key === "ADMIN" || !r.isSystem) {
    if (!perms.includes("admin.access")) perms.push("admin.access");
  }
  if (r.key === "ADMIN" && perms.includes("admins.manage") && !u.isSuperAdmin) throw badRequest("Only a super administrator can give the ADMIN role admin-management rights");
  await db.update(roles).set({ ...(b.name && !r.isSystem ? { name: b.name } : {}), ...(b.description !== undefined ? { description: b.description } : {}) }).where(eq(roles.id, r.id));
  await setRolePermissions(r.id, perms);
  await logAudit(req, u, "role.update", "role", r.id, { permissions: before }, { permissions: perms, name: b.name });
  return { permissions: perms };
});

/** DELETE — remove a custom role that has no members. */
export const DELETE = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("admins.manage");
  const [r] = await db.select().from(roles).where(eq(roles.id, params.id));
  if (!r) throw notFound("Role not found");
  if (r.isSystem) throw badRequest("System roles cannot be deleted");
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(userRoles).where(eq(userRoles.roleId, r.id))) as [{ n: number }];
  if (n > 0) throw conflict(`Remove this role from its ${n} member(s) first`);
  await requireStepUp(u);
  await db.delete(roles).where(eq(roles.id, r.id));
  await logAudit(req, u, "role.delete", "role", r.id, r, null);
  return { ok: true };
});
