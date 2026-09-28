import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { issueOtp } from "@/lib/auth/otp";
import { normalisePhone } from "@/lib/auth/users";
import { badRequest } from "@/lib/errors";

const schema = z.object({
  target: z.string().trim().min(5),
  purpose: z.enum(["LOGIN", "VERIFY"]).default("LOGIN"),
});

export const POST = api(
  async (req) => {
    const { target, purpose } = await parseBody(req, schema);
    const t = target.includes("@") ? target.toLowerCase() : normalisePhone(target);
    if (!t.includes("@") && !/^\+91[6-9]\d{9}$/.test(t)) throw badRequest("Enter a valid 10-digit Indian mobile number");
    const out = await issueOtp(t, purpose);
    return { sent: true, target: t, ...out };
  },
  { rateLimit: { limit: 5, windowSec: 600 } },
);
