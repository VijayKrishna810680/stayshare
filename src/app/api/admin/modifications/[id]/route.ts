import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { decideModification } from "@/services/stay";
import { logAudit } from "../../_lib/util";

/** POST {approve, note} — approve or reject a booking modification request. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("bookings.manage");
  const b = await parseBody(req, z.object({ approve: z.boolean(), note: z.string().max(1000).nullable().optional() }));
  const out = await decideModification(params.id, u.id, b.approve, b.note ?? undefined);
  await logAudit(req, u, b.approve ? "modification.approve" : "modification.reject", "booking_modification", params.id, null, { ...b, result: out.status });
  return out;
});
