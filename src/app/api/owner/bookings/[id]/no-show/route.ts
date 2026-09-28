import { api, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ownerBooking, requireOwner } from "@/lib/owner-access";
import { markNoShow } from "@/services/booking";

export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { booking } = await ownerBooking(u, params.id);
  await markNoShow(booking.id, u.id);
  await audit({ actorId: u.id, action: "booking.no_show", entityType: "booking", entityId: booking.id, before: { status: booking.status }, after: { status: "NO_SHOW" }, ...reqMeta(req) });
  return { ok: true };
});
