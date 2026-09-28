import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";

/** Active devices (latest token of each family). */
export const GET = api(async () => {
  const u = await requireUser();
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, u.id), isNull(sessions.revokedAt), isNull(sessions.rotatedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastUsedAt));
  return rows.map((s) => ({ id: s.id, familyId: s.familyId, userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, current: s.id === u.sessionId }));
});

/** Log out a specific device: DELETE /api/auth/sessions?id=... */
export const DELETE = api(async (req) => {
  const u = await requireUser();
  const id = req.nextUrl.searchParams.get("id");
  const [s] = id ? await db.select().from(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, u.id))) : [];
  if (!s) throw notFound("Session not found");
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.familyId, s.familyId));
  return { ok: true };
});
