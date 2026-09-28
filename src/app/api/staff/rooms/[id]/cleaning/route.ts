import { z } from "zod";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaffOrOwner, staffRoom } from "@/lib/owner-access";
import { setRoomCleaning } from "@/services/stay";

export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireStaffOrOwner();
  const { room } = await staffRoom(u, params.id);
  const { status } = await parseBody(req, z.object({ status: z.enum(["CLEAN", "NEEDS_CLEANING", "IN_PROGRESS"]) }));
  await setRoomCleaning(room.id, status);
  await audit({ actorId: u.id, action: "room.cleaning", entityType: "room", entityId: room.id, before: { cleaningStatus: room.cleaningStatus }, after: { cleaningStatus: status }, ...reqMeta(req) });
  return { ok: true };
});
