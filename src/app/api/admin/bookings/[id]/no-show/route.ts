import { api } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { markNoShow } from "@/services/booking";
import { logAudit } from "../../../_lib/util";

/** POST — mark a confirmed booking as no-show (policy no-show charge applies). */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("bookings.manage");
  await markNoShow(params.id, u.id);
  await logAudit(req, u, "booking.no_show", "booking", params.id, null, { status: "NO_SHOW" });
  return { ok: true };
});
