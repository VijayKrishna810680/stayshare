import { z } from "zod";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireOwner } from "@/lib/owner-access";
import { disputePayout } from "@/services/settlement";

export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { note } = await parseBody(req, z.object({ note: z.string().trim().min(10, "Describe the issue (at least 10 characters)").max(1000) }));
  await disputePayout(params.id, u.id, note);
  await audit({ actorId: u.id, action: "payout.dispute", entityType: "payout", entityId: params.id, after: { note }, ...reqMeta(req) });
  return { ok: true };
});
