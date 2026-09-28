import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { createPayout } from "@/services/settlement";
import { logAudit } from "../_lib/util";

/** POST {ownerId, note} — bundle the owner's ELIGIBLE earnings into a new payout. */
export const POST = api(async (req) => {
  const u = await requirePermission("payouts.manage");
  const b = await parseBody(req, z.object({ ownerId: z.string().uuid(), note: z.string().max(500).nullable().optional() }));
  const po = await createPayout(b.ownerId, { id: u.id, isOwner: false }, b.note ?? undefined);
  await logAudit(req, u, "payout.create", "payout", po.id, null, po);
  return po;
});
