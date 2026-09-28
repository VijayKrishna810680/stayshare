import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { hashPassword, PASSWORD_HINT, PASSWORD_RULE, verifyPassword } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";

const schema = z.object({ currentPassword: z.string().max(100).optional(), newPassword: z.string().regex(PASSWORD_RULE, PASSWORD_HINT), logoutOthers: z.boolean().default(true) });

/** Change (or set, for OTP/Google accounts) the password. Other devices are signed out by default. */
export const POST = api(
  async (req) => {
    const u = await requireUser();
    const b = await parseBody(req, schema);
    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, u.id));
    if (row?.hash) {
      if (!b.currentPassword || !(await verifyPassword(b.currentPassword, row.hash))) throw badRequest("Your current password is incorrect");
      if (await verifyPassword(b.newPassword, row.hash)) throw badRequest("New password must be different from the current one");
    }
    await db.update(users).set({ passwordHash: await hashPassword(b.newPassword), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, u.id));
    if (b.logoutOthers) {
      const [cur] = await db.select({ familyId: sessions.familyId }).from(sessions).where(eq(sessions.id, u.sessionId));
      if (cur) await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, u.id), ne(sessions.familyId, cur.familyId)));
    }
    await audit({ actorId: u.id, action: "auth.password_change", entityType: "user", entityId: u.id, ...reqMeta(req) });
    return { ok: true };
  },
  { rateLimit: { limit: 10, windowSec: 900 } },
);
