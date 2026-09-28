import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { requestRefund } from "@/services/booking";

const schema = z.object({ amount: z.number().int().min(100, "Minimum refund request is ₹1"), reason: z.string().trim().min(10, "Please describe the reason (at least 10 characters)").max(1000) });

/** Customer asks for an exceptional (goodwill) refund; an admin decides. Amount in paise. */
export const POST = api<{ id: string }>(
  async (req, { params }) => {
    const u = await requireUser();
    const { amount, reason } = await parseBody(req, schema);
    const r = await requestRefund(params.id, u.id, amount, reason);
    return { id: r.id, amount: r.amount, status: r.status };
  },
  { rateLimit: { limit: 5, windowSec: 600 } },
);
