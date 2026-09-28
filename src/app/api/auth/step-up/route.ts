import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { issueOtp, verifyOtp } from "@/lib/auth/otp";
import { grantStepUp, hasStepUp } from "@/lib/auth/step-up";
import { badRequest } from "@/lib/errors";
import { audit } from "@/lib/audit";

/** GET → is step-up active?  POST {action:"send"} → OTP to the admin's own phone/email; POST {action:"verify", code} → grant 10 min. */
export const GET = api(async () => {
  const u = await requirePermission("admin.access");
  return { active: await hasStepUp(u), target: u.phone ? `phone ending ${u.phone.slice(-4)}` : u.email };
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), channel: z.enum(["phone", "email"]).default("phone") }),
  z.object({ action: z.literal("verify"), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP"), channel: z.enum(["phone", "email"]).default("phone") }),
]);

export const POST = api(
  async (req) => {
    const u = await requirePermission("admin.access");
    const body = await parseBody(req, schema);
    const target = body.channel === "email" ? u.email : u.phone;
    if (!target) throw badRequest(`No ${body.channel} on your account`);
    if (body.action === "send") return { sent: true, ...(await issueOtp(target, `STEPUP:${u.id}`)) };
    await verifyOtp(target, `STEPUP:${u.id}`, body.code);
    await audit({ actorId: u.id, action: "auth.step_up", entityType: "user", entityId: u.id });
    return grantStepUp(u);
  },
  { rateLimit: { limit: 10, windowSec: 600 } },
);
