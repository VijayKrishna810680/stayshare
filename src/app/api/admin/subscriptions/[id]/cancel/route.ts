import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { cancelSubscription } from "@/services/subscriptions";
import { logAudit } from "../../../_lib/util";

/** POST {reason} — admin cancellation ends the subscription immediately. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("users.manage", "pricing.manage");
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(3, "Please give a reason").max(500) }));
  await cancelSubscription(params.id, { id: u.id, isAdmin: true });
  await logAudit(req, u, "subscription.cancel", "subscription", params.id, null, { reason });
  return { ok: true };
});
