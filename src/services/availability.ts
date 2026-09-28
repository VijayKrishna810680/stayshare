import "server-only";
import { and, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { availabilityCalendars, beds, bookings, bookingStatusHistory, inventoryBlocks, rooms } from "@/db/schema";
import { conflict, badRequest } from "@/lib/errors";
import { listNights } from "@/lib/dates";

/**
 * Inventory model
 * ───────────────
 * Every sold / held / blocked bed-night is a row in availability_calendars with UNIQUE(bed_id, night).
 *  • Booking one bed → rows for that bed for each night.
 *  • Booking an entire room → rows for EVERY bed in the room, so any overlapping bed booking conflicts,
 *    and any existing bed booking prevents an overlapping entire-room booking.
 *  • Payment holds are rows with status HELD and hold_expires_at; expired holds are swept before use.
 * Postgres enforces the unique constraint atomically, so two simultaneous requests for the same bed
 * can never both succeed — the loser gets a 409 Conflict.
 */

/** Release payment holds whose window has lapsed, and mark those bookings as cancelled. */
export async function sweepExpiredHolds(tx: Tx | typeof db = db) {
  const expired = await tx
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(and(inArray(bookings.status, ["INVENTORY_LOCKED", "PAYMENT_PENDING", "DRAFT"]), lt(bookings.lockExpiresAt, new Date())));
  if (!expired.length) return 0;
  const ids = expired.map((e) => e.id);
  await tx.delete(availabilityCalendars).where(and(inArray(availabilityCalendars.bookingId, ids), eq(availabilityCalendars.status, "HELD")));
  await tx.update(bookings).set({ status: "CANCELLED", cancelledAt: new Date() }).where(inArray(bookings.id, ids));
  await tx.insert(bookingStatusHistory).values(
    expired.map((e) => ({ bookingId: e.id, fromStatus: e.status, toStatus: "CANCELLED" as const, note: "Payment window expired — inventory released" })),
  );
  return ids.length;
}

export type RoomAvailability = { roomId: string; totalBeds: number; availableBeds: number; availableBedIds: string[]; entireRoomAvailable: boolean };

/** Availability for many rooms over [checkIn, checkOut). */
export async function roomsAvailability(roomIds: string[], checkIn: string, checkOut: string): Promise<Map<string, RoomAvailability>> {
  const out = new Map<string, RoomAvailability>();
  if (!roomIds.length) return out;
  const bedRows = await db
    .select({ id: beds.id, roomId: beds.roomId })
    .from(beds)
    .where(and(inArray(beds.roomId, roomIds), eq(beds.active, true), isNull(beds.deletedAt)));
  const taken = await db
    .selectDistinct({ bedId: availabilityCalendars.bedId })
    .from(availabilityCalendars)
    .where(
      and(
        inArray(availabilityCalendars.roomId, roomIds),
        gte(availabilityCalendars.night, checkIn),
        lt(availabilityCalendars.night, checkOut),
        sql`(${availabilityCalendars.status} <> 'HELD' OR ${availabilityCalendars.holdExpiresAt} > now())`,
      ),
    );
  const takenSet = new Set(taken.map((t) => t.bedId));
  for (const id of roomIds) out.set(id, { roomId: id, totalBeds: 0, availableBeds: 0, availableBedIds: [], entireRoomAvailable: false });
  for (const b of bedRows) {
    const r = out.get(b.roomId)!;
    r.totalBeds++;
    if (!takenSet.has(b.id)) {
      r.availableBeds++;
      r.availableBedIds.push(b.id);
    }
  }
  for (const r of out.values()) r.entireRoomAvailable = r.totalBeds > 0 && r.availableBeds === r.totalBeds;
  return out;
}

/**
 * Claim inventory for a booking inside a transaction.
 * Returns the bed ids claimed. Throws 409 if any bed-night is already taken.
 */
export async function claimInventory(
  tx: Tx,
  args: {
    bookingId: string;
    roomId: string;
    unit: "BED" | "ROOM";
    bedIds?: string[];
    bedsCount: number;
    checkIn: string;
    checkOut: string;
    status: "HELD" | "BOOKED";
    holdExpiresAt?: Date | null;
  },
): Promise<string[]> {
  const [room] = await tx.select().from(rooms).where(eq(rooms.id, args.roomId));
  if (!room || !room.active || room.deletedAt) throw badRequest("Room is not available");
  if (room.maintenanceStatus === "UNDER_MAINTENANCE") throw conflict("This room is under maintenance for the selected dates");

  const roomBeds = await tx
    .select({ id: beds.id })
    .from(beds)
    .where(and(eq(beds.roomId, args.roomId), eq(beds.active, true), isNull(beds.deletedAt)));
  if (!roomBeds.length) throw badRequest("This room has no beds configured");

  const nights = listNights(args.checkIn, args.checkOut);
  // Clear lapsed holds for this room & range so they don't block the unique constraint.
  await tx
    .delete(availabilityCalendars)
    .where(
      and(
        eq(availabilityCalendars.roomId, args.roomId),
        eq(availabilityCalendars.status, "HELD"),
        lte(availabilityCalendars.holdExpiresAt, new Date()),
        gte(availabilityCalendars.night, args.checkIn),
        lt(availabilityCalendars.night, args.checkOut),
      ),
    );

  let chosen: string[];
  if (args.unit === "ROOM") {
    chosen = roomBeds.map((b) => b.id);
  } else if (args.bedIds?.length) {
    const valid = new Set(roomBeds.map((b) => b.id));
    if (args.bedIds.some((b) => !valid.has(b))) throw badRequest("Selected bed does not belong to this room");
    chosen = [...new Set(args.bedIds)];
  } else {
    const taken = await tx
      .selectDistinct({ bedId: availabilityCalendars.bedId })
      .from(availabilityCalendars)
      .where(and(eq(availabilityCalendars.roomId, args.roomId), gte(availabilityCalendars.night, args.checkIn), lt(availabilityCalendars.night, args.checkOut)));
    const t = new Set(taken.map((x) => x.bedId));
    chosen = roomBeds.filter((b) => !t.has(b.id)).slice(0, args.bedsCount).map((b) => b.id);
    if (chosen.length < args.bedsCount) throw conflict("Not enough beds are available in this room for your dates");
  }

  const values = chosen.flatMap((bedId) =>
    nights.map((night) => ({
      bedId,
      roomId: args.roomId,
      night,
      status: args.status,
      bookingId: args.bookingId,
      holdExpiresAt: args.status === "HELD" ? (args.holdExpiresAt ?? null) : null,
    })),
  );
  try {
    // A SAVEPOINT keeps the outer transaction usable if the unique constraint fires.
    await tx.transaction(async (sp) => {
      await sp.insert(availabilityCalendars).values(values);
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict(
        args.unit === "ROOM"
          ? "Sorry — some beds in this room were just booked for your dates. Please choose another room or book individual beds."
          : "Sorry — this bed was just booked by someone else for your dates. Please pick another bed.",
      );
    }
    throw e;
  }
  return chosen;
}

export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export async function confirmHeldInventory(tx: Tx, bookingId: string) {
  const res = await tx
    .update(availabilityCalendars)
    .set({ status: "BOOKED", holdExpiresAt: null })
    .where(eq(availabilityCalendars.bookingId, bookingId))
    .returning({ id: availabilityCalendars.id });
  return res.length;
}

export async function releaseInventory(tx: Tx | typeof db, bookingId: string, fromNight?: string) {
  const conds = [eq(availabilityCalendars.bookingId, bookingId)];
  if (fromNight) conds.push(gte(availabilityCalendars.night, fromNight));
  await tx.delete(availabilityCalendars).where(and(...conds));
}

/** Owner/admin blocks (maintenance, offline bookings). Fails if any night is already sold. */
export async function createBlock(args: {
  propertyId: string;
  roomId?: string | null;
  bedId?: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  note?: string;
  createdBy: string;
}) {
  return db.transaction(async (tx) => {
    let bedIds: { id: string; roomId: string }[];
    if (args.bedId) {
      bedIds = await tx.select({ id: beds.id, roomId: beds.roomId }).from(beds).where(eq(beds.id, args.bedId));
    } else if (args.roomId) {
      bedIds = await tx.select({ id: beds.id, roomId: beds.roomId }).from(beds).where(and(eq(beds.roomId, args.roomId), eq(beds.active, true)));
    } else {
      bedIds = await tx
        .select({ id: beds.id, roomId: beds.roomId })
        .from(beds)
        .innerJoin(rooms, eq(rooms.id, beds.roomId))
        .where(and(eq(rooms.propertyId, args.propertyId), eq(beds.active, true)));
    }
    if (!bedIds.length) throw badRequest("Nothing to block");
    const [block] = await tx
      .insert(inventoryBlocks)
      .values({
        propertyId: args.propertyId,
        roomId: args.roomId ?? null,
        bedId: args.bedId ?? null,
        startDate: args.startDate,
        endDate: args.endDate,
        reason: args.reason,
        note: args.note,
        createdBy: args.createdBy,
      })
      .returning();
    const nights = listNights(args.startDate, args.endDate);
    if (!nights.length) throw badRequest("End date must be after start date");
    try {
      await tx.transaction(async (sp) => {
        await sp.insert(availabilityCalendars).values(
          bedIds.flatMap((b) => nights.map((night) => ({ bedId: b.id, roomId: b.roomId, night, status: "BLOCKED" as const, blockId: block!.id }))),
        );
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("Some of these dates already have bookings. Blocks cannot overlap existing bookings.");
      throw e;
    }
    return block!;
  });
}

export async function releaseBlock(blockId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(availabilityCalendars).where(eq(availabilityCalendars.blockId, blockId));
    await tx.update(inventoryBlocks).set({ releasedAt: new Date() }).where(eq(inventoryBlocks.id, blockId));
  });
}
