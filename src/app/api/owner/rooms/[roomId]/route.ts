import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { beds, facilities, floors, roomFacilities, rooms } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest, conflict } from "@/lib/errors";
import { ownerRoom, requireOwner } from "@/lib/owner-access";
import { roomHasLiveBookings } from "@/lib/owner-helpers";
import { roomSchema } from "@/components/owner/schemas";

/** Fields that change what the guest buys — an approved room goes back to PENDING review when they change. */
const REVIEW_FIELDS = ["category", "sharingCapacity", "isAC", "bathroom", "maxOccupancy"] as const;

export const PATCH = api<{ roomId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { room, property } = await ownerRoom(u, params.roomId);
  const body = await parseBody(req, roomSchema.innerType().innerType().partial());
  if (body.floorId) {
    const [f] = await db.select().from(floors).where(eq(floors.id, body.floorId));
    if (!f || f.propertyId !== property.id) throw badRequest("Floor does not belong to this property");
  }
  if (body.roomNumber && body.roomNumber !== room.roomNumber) {
    const [dup] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.propertyId, property.id), eq(rooms.roomNumber, body.roomNumber), ne(rooms.id, room.id)));
    if (dup) throw conflict(`Room ${body.roomNumber} already exists`);
  }
  const allowBed = body.allowBedBooking ?? room.allowBedBooking;
  const allowRoom = body.allowEntireRoomBooking ?? room.allowEntireRoomBooking;
  if (!allowBed && !allowRoom) throw badRequest("Allow bed booking, entire-room booking, or both");
  const { facilityIds, bedType: _bt, ...fields } = body;
  const changed = REVIEW_FIELDS.filter((k) => fields[k] !== undefined && fields[k] !== room[k]);
  const reReview = room.approvalStatus === "APPROVED" && changed.length > 0;
  const [upd] = await db
    .update(rooms)
    .set({ ...fields, ...(reReview ? { approvalStatus: "PENDING" as const } : {}), updatedBy: u.id })
    .where(eq(rooms.id, room.id))
    .returning();
  if (facilityIds) {
    const ids = [...new Set(facilityIds)];
    if (ids.length) {
      const ok = await db.select({ id: facilities.id }).from(facilities).where(inArray(facilities.id, ids));
      if (ok.length !== ids.length) throw badRequest("Unknown facility");
    }
    await db.delete(roomFacilities).where(eq(roomFacilities.roomId, room.id));
    if (ids.length) await db.insert(roomFacilities).values(ids.map((facilityId) => ({ roomId: room.id, facilityId })));
  }
  if (body.roomNumber && body.roomNumber !== room.roomNumber) {
    // keep bed codes readable: PROPERTY-ROOM-LETTER
    const bs = await db.select().from(beds).where(eq(beds.roomId, room.id));
    for (const b of bs) {
      const code = `${property.code}-${body.roomNumber}-${b.bedNumber}`;
      const [clash] = await db.select({ id: beds.id }).from(beds).where(eq(beds.code, code));
      if (!clash) await db.update(beds).set({ code }).where(eq(beds.id, b.id));
    }
  }
  await audit({ actorId: u.id, action: reReview ? "room.update_pending_review" : "room.update", entityType: "room", entityId: room.id, before: Object.fromEntries(Object.keys(fields).map((k) => [k, room[k as keyof typeof room]])), after: fields, ...reqMeta(req) });
  return { room: upd, reReview };
});

export const DELETE = api<{ roomId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { room } = await ownerRoom(u, params.roomId);
  if (await roomHasLiveBookings(room.id)) throw conflict("This room has current or upcoming bookings and can't be deleted");
  await db.update(rooms).set({ deletedAt: new Date(), active: false, updatedBy: u.id }).where(eq(rooms.id, room.id));
  await db.update(beds).set({ active: false, deletedAt: new Date() }).where(eq(beds.roomId, room.id));
  await audit({ actorId: u.id, action: "room.delete", entityType: "room", entityId: room.id, before: { roomNumber: room.roomNumber }, ...reqMeta(req) });
  return { ok: true };
});
