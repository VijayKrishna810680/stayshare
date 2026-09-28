import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { findUserByIdentifier } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { AppError, unauthorized } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({ identifier: z.string().trim().min(3, "Enter your email or mobile number"), password: z.string().min(1, "Enter your password") });
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const POST = api(
  async (req) => {
    const { identifier, password } = await parseBody(req, schema);
    const u = await findUserByIdentifier(identifier);
    const meta = reqMeta(req);
    if (!u || !u.passwordHash || u.deletedAt) throw unauthorized("Incorrect email/mobile or password");
    if (u.status === "SUSPENDED") throw new AppError(403, "SUSPENDED", "This account is suspended. Please contact support.");
    if (u.lockedUntil && u.lockedUntil > new Date()) {
      const mins = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError(423, "LOCKED", `Too many failed attempts. Try again in ${mins} minute(s) or use OTP login.`);
    }
    if (!(await verifyPassword(password, u.passwordHash))) {
      const count = u.failedLoginCount + 1;
      await db
        .update(users)
        .set({ failedLoginCount: count >= MAX_ATTEMPTS ? 0 : count, lockedUntil: count >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null })
        .where(eq(users.id, u.id));
      await audit({ actorId: u.id, action: "auth.login_failed", entityType: "user", entityId: u.id, ...meta });
      throw unauthorized(count >= MAX_ATTEMPTS ? `Account locked for ${LOCK_MINUTES} minutes after ${MAX_ATTEMPTS} failed attempts` : "Incorrect email/mobile or password");
    }
    const s = await createSession(u.id, meta);
    await audit({ actorId: u.id, action: "auth.login", entityType: "user", entityId: u.id, ...meta });
    return { id: u.id, name: u.name, roles: s.roles, isAdmin: s.perms.includes("admin.access") };
  },
  { rateLimit: { limit: 20, windowSec: 300 } },
);
