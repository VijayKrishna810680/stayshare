import "server-only";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { availabilityCalendars, beds, bookings, fileUploads, properties, rooms } from "@/db/schema";
import { badRequest, notFound } from "@/lib/errors";
import { todayIST } from "@/lib/dates";

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function uniqueSlug(base: string) {
  const root = slugify(base) || "property";
  for (let i = 0; i < 50; i++) {
    const s = i === 0 ? root : `${root}-${i + 1}`;
    const [e] = await db.select({ id: properties.id }).from(properties).where(eq(properties.slug, s));
    if (!e) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Bed letters: A..Z, then AA, AB... */
export function bedLetter(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Next unused bed letters for a room (counts soft-deleted beds so unique indexes never collide). */
export async function nextBedNumbers(roomId: string, propertyCode: string, roomNumber: string, n: number) {
  const existing = await db.select({ bedNumber: beds.bedNumber, code: beds.code }).from(beds).where(eq(beds.roomId, roomId));
  const usedNums = new Set(existing.map((e) => e.bedNumber));
  const out: { bedNumber: string; code: string }[] = [];
  for (let i = 0; out.length < n && i < 700; i++) {
    const l = bedLetter(i);
    if (usedNums.has(l)) continue;
    const code = `${propertyCode}-${roomNumber}-${l}`;
    const [c] = await db.select({ id: beds.id }).from(beds).where(eq(beds.code, code));
    if (c) continue;
    out.push({ bedNumber: l, code });
  }
  return out;
}

/** Ensure an uploaded file belongs to the user and matches the purpose; returns its public/private URL. */
export async function ownFile(userId: string, fileId: string, purposes: string[]) {
  const [f] = await db.select().from(fileUploads).where(eq(fileUploads.id, fileId));
  if (!f || f.uploadedBy !== userId) throw notFound("Uploaded file not found");
  if (!purposes.includes(f.purpose)) throw badRequest("This file was uploaded for a different purpose");
  return { ...f, url: `/api/files/${f.id}` };
}

/** Future or current booked nights on these beds (from today). */
export async function bedsHaveFutureBookings(bedIds: string[]) {
  if (!bedIds.length) return false;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(availabilityCalendars)
    .where(and(inArray(availabilityCalendars.bedId, bedIds), gte(availabilityCalendars.night, todayIST()), sql`${availabilityCalendars.bookingId} IS NOT NULL`, sql`(${availabilityCalendars.status} <> 'HELD' OR ${availabilityCalendars.holdExpiresAt} > now())`));
  return Number(r?.n ?? 0) > 0;
}

export async function roomHasLiveBookings(roomId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.roomId, roomId), inArray(bookings.status, ["PAYMENT_PENDING", "INVENTORY_LOCKED", "CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CANCELLATION_REQUESTED"]), gte(bookings.checkOut, todayIST())));
  return Number(r?.n ?? 0) > 0;
}

/** Keep rooms.total_beds in sync with active beds. */
export async function syncRoomBedCount(roomId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(beds).where(and(eq(beds.roomId, roomId), eq(beds.active, true), isNull(beds.deletedAt)));
  await db.update(rooms).set({ totalBeds: Number(r?.n ?? 0) }).where(eq(rooms.id, roomId));
}

/** New content added to a property: DRAFT while the property is a draft, PENDING otherwise (needs admin approval). */
export function newItemStatus(propertyStatus: string): "DRAFT" | "PENDING" {
  return ["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(propertyStatus) ? "DRAFT" : "PENDING";
}
