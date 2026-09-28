import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword, PASSWORD_HINT, PASSWORD_RULE, verifyPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/current";
import { badRequest } from "@/lib/errors";

/** POST {currentPassword, newPassword}: change my password; signs out my other sessions. */
export const POST = api(async (req) => {
  const u = await requireUser();
  const body = await parseBody(req, z.object({ currentPassword: z.string().min(1), newPassword: z.string().regex(PASSWORD_RULE, PASSWORD_HINT) }));
  const [usr] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, u.id));
  if (!usr?.passwordHash || !(await verifyPassword(body.currentPassword, usr.passwordHash))) throw badRequest("Current password is incorrect");
  await db.update(users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(users.id, u.id));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, u.id), isNull(sessions.revokedAt), ne(sessions.id, u.sessionId)));
  await audit({ actorId: u.id, action: "auth.password_change", entityType: "user", entityId: u.id, ...reqMeta(req) });
  return { ok: true };
}, { rateLimit: { limit: 10, windowSec: 600 } });
