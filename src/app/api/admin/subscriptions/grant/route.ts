import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { grantSubscription } from "@/services/subscriptions";
import { logAudit } from "../../_lib/util";

/** POST {userId, planId, note} — grant a complimentary plan. */
export const POST = api(async (req) => {
  const u = await requirePermission("users.manage", "pricing.manage");
  const b = await parseBody(req, z.object({ userId: z.string().uuid(), planId: z.string().uuid(), note: z.string().max(500).nullable().optional() }));
  const sub = await grantSubscription(u.id, b.userId, b.planId);
  await logAudit(req, u, "subscription.grant", "subscription", sub.id, null, { ...b, endsAt: sub.endsAt });
  return sub;
});
