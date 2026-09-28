import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { permissions, rolePermissions, roles, sessions, userRoles, users } from "@/db/schema";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { ACCESS_COOKIE, REFRESH_COOKIE, signAccessToken } from "./jwt";

export async function loadRolesAndPerms(userId: string) {
  const rows = await db
    .select({ role: roles.key, perm: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));
  const roleSet = new Set<string>();
  const permSet = new Set<string>();
  for (const r of rows) {
    roleSet.add(r.role);
    if (r.perm) permSet.add(r.perm);
  }
  return { roles: [...roleSet], perms: [...permSet] };
}

const cookieBase = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: "lax" as const,
  path: "/",
};

async function issue(userId: string, name: string, sessionId: string, refreshToken: string) {
  const { roles: r, perms } = await loadRolesAndPerms(userId);
  const access = await signAccessToken(
    { sub: userId, name, roles: r, adm: perms.includes("admin.access"), sid: sessionId },
    env.accessTokenTtlSec,
  );
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, access, { ...cookieBase, maxAge: env.accessTokenTtlSec });
  jar.set(REFRESH_COOKIE, refreshToken, { ...cookieBase, maxAge: env.refreshTokenTtlDays * 86400 });
  return { accessToken: access, roles: r, perms };
}

/** Create a new login session and set cookies. */
export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const refresh = randomToken(48);
  const [s] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: sha256(refresh),
      familyId: randomUUID(),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
      expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 86400_000),
    })
    .returning();
  await db.update(users).set({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, userId));
  return issue(userId, u?.name ?? "", s!.id, refresh);
}

/**
 * Rotate a refresh token. Reusing an already-rotated token is treated as theft:
 * the entire token family is revoked (all devices from that login must sign in again).
 */
export async function rotateSession(refreshToken: string, meta: { ip?: string; userAgent?: string } = {}) {
  const hash = sha256(refreshToken);
  const [s] = await db.select().from(sessions).where(eq(sessions.tokenHash, hash));
  if (!s) return null;
  if (s.revokedAt || s.rotatedAt) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
    return null;
  }
  if (s.expiresAt < new Date()) return null;
  const [u] = await db.select().from(users).where(eq(users.id, s.userId));
  if (!u || u.status === "SUSPENDED" || u.deletedAt) return null;

  const next = randomToken(48);
  const [ns] = await db
    .insert(sessions)
    .values({
      userId: s.userId,
      tokenHash: sha256(next),
      familyId: s.familyId,
      ip: meta.ip ?? s.ip,
      userAgent: meta.userAgent?.slice(0, 300) ?? s.userAgent,
      expiresAt: s.expiresAt, // absolute lifetime is not extended by rotation
    })
    .returning();
  await db.update(sessions).set({ rotatedAt: new Date(), lastUsedAt: new Date() }).where(eq(sessions.id, s.id));
  return issue(u.id, u.name, ns!.id, next);
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

export async function revokeCurrentSession() {
  const jar = await cookies();
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (rt) {
    const [s] = await db.select().from(sessions).where(eq(sessions.tokenHash, sha256(rt)));
    if (s) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.familyId, s.familyId));
  }
  await clearAuthCookies();
}

export async function revokeAllSessions(userId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
