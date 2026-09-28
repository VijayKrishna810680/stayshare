import "server-only";
import { and, eq, inArray, isNull, type AnyColumn } from "drizzle-orm";
import { db } from "@/db";
import { beds, bookings, floors, properties, rooms, staffAssignments, staffProfiles } from "@/db/schema";
import { requireUser, type CurrentUser } from "@/lib/auth/current";
import { forbidden, notFound } from "@/lib/errors";

/**
 * Ownership / assignment guards for the partner (owner) and property-staff portals.
 *  • Owners may only touch properties where properties.owner_id = user.id.
 *  • Staff may only touch properties listed in staff_assignments for them (and must be active).
 *  • Owners can use every staff tool for their own properties.
 */

export async function requireOwner(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!u.isOwner) throw forbidden("Only property partners can do this");
  return u;
}

export async function requireStaffOrOwner(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!u.isOwner && !u.isStaff) throw forbidden("Only property staff can do this");
  if (!u.isOwner && u.isStaff) {
    const [sp] = await db.select({ active: staffProfiles.active }).from(staffProfiles).where(eq(staffProfiles.userId, u.id));
    if (sp && !sp.active) throw forbidden("Your staff account has been deactivated");
  }
  return u;
}

export async function assertOwnsProperty(user: Pick<CurrentUser, "id">, propertyId: string) {
  const [p] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), isNull(properties.deletedAt)));
  if (!p || p.ownerId !== user.id) throw notFound("Property not found");
  return p;
}

/** Property ids the user may operate as staff: owned properties + staff assignments. */
export async function staffPropertyIds(user: Pick<CurrentUser, "id" | "isOwner" | "isStaff">): Promise<string[]> {
  const ids = new Set<string>();
  if (user.isOwner) {
    const own = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.ownerId, user.id), isNull(properties.deletedAt)));
    own.forEach((r) => ids.add(r.id));
  }
  if (user.isStaff) {
    const [sp] = await db.select({ active: staffProfiles.active }).from(staffProfiles).where(eq(staffProfiles.userId, user.id));
    if (!sp || sp.active) {
      const asg = await db
        .select({ id: staffAssignments.propertyId })
        .from(staffAssignments)
        .innerJoin(properties, eq(properties.id, staffAssignments.propertyId))
        .where(and(eq(staffAssignments.userId, user.id), isNull(properties.deletedAt)));
      asg.forEach((r) => ids.add(r.id));
    }
  }
  return [...ids];
}

export async function assertStaffProperty(user: Pick<CurrentUser, "id" | "isOwner" | "isStaff">, propertyId: string) {
  const ids = await staffPropertyIds(user);
  if (!ids.includes(propertyId)) throw notFound("Property not found");
  const [p] = await db.select().from(properties).where(eq(properties.id, propertyId));
  if (!p) throw notFound("Property not found");
  return p;
}

// ── entity → property resolvers (each one enforces the relevant guard) ──

export async function ownerRoom(user: Pick<CurrentUser, "id">, roomId: string) {
  const [r] = await db.select().from(rooms).where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)));
  if (!r) throw notFound("Room not found");
  const property = await assertOwnsProperty(user, r.propertyId);
  return { room: r, property };
}

export async function ownerFloor(user: Pick<CurrentUser, "id">, floorId: string) {
  const [f] = await db.select().from(floors).where(eq(floors.id, floorId));
  if (!f) throw notFound("Floor not found");
  const property = await assertOwnsProperty(user, f.propertyId);
  return { floor: f, property };
}

export async function ownerBed(user: Pick<CurrentUser, "id">, bedId: string) {
  const [b] = await db.select().from(beds).where(and(eq(beds.id, bedId), isNull(beds.deletedAt)));
  if (!b) throw notFound("Bed not found");
  const { room, property } = await ownerRoom(user, b.roomId);
  return { bed: b, room, property };
}

export async function ownerBooking(user: Pick<CurrentUser, "id">, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw notFound("Booking not found");
  const property = await assertOwnsProperty(user, b.propertyId);
  return { booking: b, property };
}

export async function staffBooking(user: Pick<CurrentUser, "id" | "isOwner" | "isStaff">, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw notFound("Booking not found");
  const property = await assertStaffProperty(user, b.propertyId);
  return { booking: b, property };
}

export async function staffRoom(user: Pick<CurrentUser, "id" | "isOwner" | "isStaff">, roomId: string) {
  const [r] = await db.select().from(rooms).where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)));
  if (!r) throw notFound("Room not found");
  const property = await assertStaffProperty(user, r.propertyId);
  return { room: r, property };
}

export async function staffBed(user: Pick<CurrentUser, "id" | "isOwner" | "isStaff">, bedId: string) {
  const [b] = await db.select().from(beds).where(and(eq(beds.id, bedId), isNull(beds.deletedAt)));
  if (!b) throw notFound("Bed not found");
  const { room, property } = await staffRoom(user, b.roomId);
  return { bed: b, room, property };
}

/** Owner's property ids (non-deleted). */
export async function ownerPropertyIds(ownerId: string) {
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));
  return rows.map((r) => r.id);
}

export function inIds(col: AnyColumn, ids: string[]) {
  // inArray with an empty list is invalid SQL in some drivers — use an impossible id instead.
  return inArray(col, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
}
