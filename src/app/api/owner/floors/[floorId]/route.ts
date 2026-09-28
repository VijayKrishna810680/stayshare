import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { floors, rooms } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { conflict } from "@/lib/errors";
import { ownerFloor, requireOwner } from "@/lib/owner-access";
import { floorSchema } from "@/components/owner/schemas";

export const PATCH = api<{ floorId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { floor } = await ownerFloor(u, params.floorId);
  const body = await parseBody(req, floorSchema.partial());
  if (body.number !== undefined && body.number !== floor.number) {
    const [dup] = await db.select({ id: floors.id }).from(floors).where(and(eq(floors.propertyId, floor.propertyId), eq(floors.number, body.number), ne(floors.id, floor.id)));
    if (dup) throw conflict(`Floor ${body.number} already exists`);
  }
  const [f] = await db.update(floors).set({ number: body.number ?? floor.number, name: body.name === undefined ? floor.name : body.name }).where(eq(floors.id, floor.id)).returning();
  await audit({ actorId: u.id, action: "floor.update", entityType: "floor", entityId: floor.id, before: floor, after: f, ...reqMeta(req) });
  return f;
});

export const DELETE = api<{ floorId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { floor } = await ownerFloor(u, params.floorId);
  const inUse = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.floorId, floor.id), isNull(rooms.deletedAt))).limit(1);
  if (inUse.length) throw conflict("Move or delete the rooms on this floor first");
  await db.update(rooms).set({ floorId: null }).where(eq(rooms.floorId, floor.id));
  await db.delete(floors).where(eq(floors.id, floor.id));
  await audit({ actorId: u.id, action: "floor.delete", entityType: "floor", entityId: floor.id, before: floor, ...reqMeta(req) });
  return { ok: true };
});
