import "server-only";
import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { forbidden, unauthorized } from "@/lib/errors";
import type { PermissionKey } from "@/lib/rbac";
import { ACCESS_COOKIE, verifyAccessToken } from "./jwt";
import { loadRolesAndPerms } from "./session";

export type CurrentUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  perms: string[];
  sessionId: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isOwner: boolean;
  isStaff: boolean;
  has: (p: PermissionKey) => boolean;
};

/**
 * Resolve the logged-in user from the access token. Always re-reads status, roles and
 * permissions from the database so suspensions and permission changes apply immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const [u] = await db.select().from(users).where(eq(users.id, claims.sub));
  if (!u || u.status === "SUSPENDED" || u.deletedAt) return null;
  const [s] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, claims.sid), isNull(sessions.revokedAt)));
  if (!s) return null;
  const { roles, perms } = await loadRolesAndPerms(u.id);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    roles,
    perms,
    sessionId: claims.sid,
    isAdmin: perms.includes("admin.access"),
    isSuperAdmin: roles.includes("SUPER_ADMIN"),
    isOwner: roles.includes("OWNER"),
    isStaff: roles.includes("STAFF"),
    has: (p) => perms.includes(p),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  return u;
}

export async function requirePermission(...anyOf: PermissionKey[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (anyOf.length && !anyOf.some((p) => u.perms.includes(p))) throw forbidden();
  return u;
}

export async function requireRole(...anyOf: string[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (!anyOf.some((r) => u.roles.includes(r))) throw forbidden();
  return u;
}
