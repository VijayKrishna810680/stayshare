import { z } from "zod";
import { api, parseBody, reqMeta } from "@/lib/api";
import { createUserAccount } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { PASSWORD_HINT, PASSWORD_RULE } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { notify } from "@/services/notifications";

const schema = z
  .object({
    name: z.string().trim().min(2, "Please enter your full name").max(80),
    email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
    phone: z.string().trim().regex(/^(\+?91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number").optional().or(z.literal("")),
    password: z.string().regex(PASSWORD_RULE, PASSWORD_HINT),
    accountType: z.enum(["CUSTOMER", "OWNER"]).default("CUSTOMER"),
    businessName: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.email || v.phone, { message: "Provide an email or mobile number", path: ["email"] });

export const POST = api(
  async (req) => {
    const body = await parseBody(req, schema);
    const user = await createUserAccount({ name: body.name, email: body.email || null, phone: body.phone || null, password: body.password, role: body.accountType, businessName: body.businessName });
    const meta = reqMeta(req);
    const s = await createSession(user.id, meta);
    await audit({ actorId: user.id, action: "user.register", entityType: "user", entityId: user.id, after: { accountType: body.accountType }, ...meta });
    await notify("user.registered", { userId: user.id, vars: { name: user.name } });
    return { id: user.id, name: user.name, roles: s.roles };
  },
  { rateLimit: { limit: 10, windowSec: 600 } },
);
