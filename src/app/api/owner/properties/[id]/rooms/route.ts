import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { beds, facilities, floors, roomFacilities, rooms } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest, conflict } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { bedLetter, newItemStatus } from "@/lib/owner-helpers";
import { roomSchema } from "@/components/owner/schemas";

/** POST: create a room and auto-create `sharingCapacity` beds (codes PROPERTYCODE-ROOM-A..). No prices. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const body = await parseBody(req, roomSchema);
  if (body.floorId) {
    const [f] = await db.select().from(floors).where(eq(floors.id, body.floorId));
    if (!f || f.propertyId !== p.id) throw badRequest("Floor does not belong to this property");
  }
  const [dup] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.propertyId, p.id), eq(rooms.roomNumber, body.roomNumber)));
  if (dup) throw conflict(`Room ${body.roomNumber} already exists in this property`);
  const facIds = [...new Set(body.facilityIds)];
  if (facIds.length) {
    const ok = await db.select({ id: facilities.id }).from(facilities).where(inArray(facilities.id, facIds));
    if (ok.length !== facIds.length) throw badRequest("Unknown facility");
  }
  const n = body.sharingCapacity;
  const defaultBedType = body.bedType ?? (body.category === "FAMILY" ? "QUEEN" : body.category === "PRIVATE" && n === 1 ? "DOUBLE" : "SINGLE");
  const room = await db.transaction(async (tx) => {
    const { facilityIds: _f, bedType: _b, ...fields } = body;
    const [r] = await tx
      .insert(rooms)
      .values({ ...fields, floorId: body.floorId ?? null, propertyId: p.id, totalBeds: n, approvalStatus: newItemStatus(p.approvalStatus), createdBy: u.id, updatedBy: u.id })
      .returning();
    await tx.insert(beds).values(
      Array.from({ length: n }).map((_, i) => ({ roomId: r!.id, bedNumber: bedLetter(i), code: `${p.code}-${body.roomNumber}-${bedLetter(i)}`, bedType: defaultBedType })),
    );
    if (facIds.length) await tx.insert(roomFacilities).values(facIds.map((facilityId) => ({ roomId: r!.id, facilityId })));
    return r!;
  });
  await audit({ actorId: u.id, action: "room.create", entityType: "room", entityId: room.id, after: { roomNumber: room.roomNumber, beds: n, propertyId: p.id }, ...reqMeta(req) });
  return room;
});
