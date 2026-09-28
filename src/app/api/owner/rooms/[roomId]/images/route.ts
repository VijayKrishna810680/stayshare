import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { roomImages } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { ownerRoom, requireOwner } from "@/lib/owner-access";
import { ownFile } from "@/lib/owner-helpers";

export const POST = api<{ roomId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { room } = await ownerRoom(u, params.roomId);
  const body = await parseBody(req, z.object({ fileId: z.string().uuid(), caption: z.string().trim().max(120).optional().nullable() }));
  const f = await ownFile(u.id, body.fileId, ["ROOM_IMAGE", "PROPERTY_IMAGE"]);
  const [agg] = await db.select({ n: sql<number>`count(*)::int`, max: sql<number>`coalesce(max(${roomImages.sortOrder}), -1)::int` }).from(roomImages).where(eq(roomImages.roomId, room.id));
  if (Number(agg?.n) >= 20) throw badRequest("You can add up to 20 photos per room");
  const [img] = await db.insert(roomImages).values({ roomId: room.id, url: f.url, caption: body.caption ?? null, sortOrder: Number(agg?.max ?? -1) + 1, status: "PENDING" }).returning();
  await audit({ actorId: u.id, action: "room.image_add", entityType: "room", entityId: room.id, after: { imageId: img!.id }, ...reqMeta(req) });
  return img;
});

/** PATCH {order: imageId[]} */
export const PATCH = api<{ roomId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { room } = await ownerRoom(u, params.roomId);
  const { order } = await parseBody(req, z.object({ order: z.array(z.string().uuid()).max(50) }));
  const imgs = await db.select({ id: roomImages.id }).from(roomImages).where(eq(roomImages.roomId, room.id));
  const own = new Set(imgs.map((i) => i.id));
  if (order.some((i) => !own.has(i))) throw badRequest("Photo not found in this room");
  for (const [i, id] of order.entries()) await db.update(roomImages).set({ sortOrder: i }).where(eq(roomImages.id, id));
  return { ok: true };
});
