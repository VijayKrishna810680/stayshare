import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { verifyOtp } from "@/lib/auth/otp";
import { createUserAccount, findUserByIdentifier, normalisePhone } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

const schema = z.object({ target: z.string().trim().min(5), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP"), name: z.string().trim().min(2).max(80).optional() });

/** OTP login: logs in an existing user or creates a new customer account (name required). */
export const POST = api(
  async (req) => {
    const body = await parseBody(req, schema);
    const t = body.target.includes("@") ? body.target.toLowerCase() : normalisePhone(body.target);
    await verifyOtp(t, "LOGIN", body.code);
    let u = await findUserByIdentifier(t);
    let isNew = false;
    if (!u) {
      if (!body.name) throw new AppError(422, "NAME_REQUIRED", "Tell us your name to create your account", { needsName: true });
      u = await createUserAccount({ name: body.name, email: t.includes("@") ? t : null, phone: t.includes("@") ? null : t, role: "CUSTOMER", emailVerified: t.includes("@"), phoneVerified: !t.includes("@") });
      isNew = true;
    } else {
      if (u.status === "SUSPENDED") throw new AppError(403, "SUSPENDED", "This account is suspended");
      await db.update(users).set(t.includes("@") ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() }).where(eq(users.id, u.id));
    }
    const s = await createSession(u.id, reqMeta(req));
    return { id: u.id, name: u.name, roles: s.roles, isNew, isAdmin: s.perms.includes("admin.access") };
  },
  { rateLimit: { limit: 15, windowSec: 600 } },
);
