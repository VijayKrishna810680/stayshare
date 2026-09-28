import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { roomImages } from "@/db/schema";
import { api, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { ownerRoom, requireOwner } from "@/lib/owner-access";

export const DELETE = api<{ roomId: string; imageId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { room } = await ownerRoom(u, params.roomId);
  const [img] = await db.select().from(roomImages).where(and(eq(roomImages.id, params.imageId), eq(roomImages.roomId, room.id)));
  if (!img) throw notFound("Photo not found");
  await db.delete(roomImages).where(eq(roomImages.id, img.id));
  await audit({ actorId: u.id, action: "room.image_delete", entityType: "room", entityId: room.id, before: { imageId: img.id }, ...reqMeta(req) });
  return { ok: true };
});
