import { z } from "zod";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireOwner } from "@/lib/owner-access";
import { createPayout, listOwnerPayouts } from "@/services/settlement";

export const GET = api(async () => {
  const u = await requireOwner();
  return listOwnerPayouts(u.id);
});

/** POST {note}: request a payout of all ELIGIBLE earnings. */
export const POST = api(async (req) => {
  const u = await requireOwner();
  const { note } = await parseBody(req, z.object({ note: z.string().trim().max(300).optional() }));
  const po = await createPayout(u.id, { id: u.id, isOwner: true }, note);
  await audit({ actorId: u.id, action: "payout.request", entityType: "payout", entityId: po.id, after: { payoutNumber: po.payoutNumber, amount: po.amount }, ...reqMeta(req) });
  return po;
}, { rateLimit: { limit: 10, windowSec: 600 } });
