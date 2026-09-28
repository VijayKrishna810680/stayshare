import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { hashPassword, PASSWORD_HINT, PASSWORD_RULE } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";

const schema = z.object({ token: z.string().min(20), password: z.string().regex(PASSWORD_RULE, PASSWORD_HINT) });

export const POST = api(
  async (req) => {
    const { token, password } = await parseBody(req, schema);
    const [r] = await db.select().from(passwordResets).where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt)));
    if (!r || r.expiresAt < new Date()) throw badRequest("This reset link is invalid or has expired");
    await db.update(users).set({ passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, r.userId));
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
    await revokeAllSessions(r.userId);
    await audit({ actorId: r.userId, action: "auth.password_reset", entityType: "user", entityId: r.userId });
    return { ok: true };
  },
  { rateLimit: { limit: 10, windowSec: 900 } },
);
