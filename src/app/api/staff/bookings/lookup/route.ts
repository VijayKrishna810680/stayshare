import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookingGuests, bookings, properties, rooms, users } from "@/db/schema";
import { api, parseQuery } from "@/lib/api";
import { maskPhone } from "@/lib/crypto";
import { badRequest } from "@/lib/errors";
import { inIds, requireStaffOrOwner, staffPropertyIds } from "@/lib/owner-access";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const BOOKING_RE = /SS-[A-Z]{2,5}-\d{4}-\d{3,8}/i;

/**
 * GET ?q=&mode=checkin|checkout|any — find a booking at my properties by booking number, guest phone,
 * or the booking QR (qrToken, or any QR payload / URL that contains it).
 */
export const GET = api(async (req) => {
  const u = await requireStaffOrOwner();
  const { q, mode } = parseQuery(req, z.object({ q: z.string().trim().min(3, "Enter at least 3 characters").max(500), mode: z.enum(["checkin", "checkout", "any"]).default("any") }));
  const ids = await staffPropertyIds(u);
  const statuses =
    mode === "checkin" ? (["CONFIRMED", "CHECK_IN_PENDING"] as const) : mode === "checkout" ? (["CHECKED_IN"] as const) : (["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT", "COMPLETED", "NO_SHOW", "CANCELLED"] as const);
  const uuid = q.match(UUID_RE)?.[0];
  const num = q.match(BOOKING_RE)?.[0];
  const digits = q.replace(/\D/g, "");
  let cond;
  if (uuid) cond = or(eq(bookings.qrToken, uuid), eq(bookings.id, uuid));
  else if (num) cond = ilike(bookings.bookingNumber, num);
  else if (digits.length >= 6 && digits.length === q.replace(/[\s+\-()]/g, "").length) {
    const tail = digits.slice(-10);
    cond = or(
      ilike(users.phone, `%${tail}`),
      sql`EXISTS (SELECT 1 FROM ${bookingGuests} g WHERE g.booking_id = ${bookings.id} AND g.phone LIKE ${"%" + tail})`,
    );
  } else if (q.length >= 3) cond = or(ilike(bookings.bookingNumber, `%${q}%`), ilike(users.name, `%${q}%`));
  else throw badRequest("Enter a booking number, phone number or scan the booking QR");
  const rows = await db
    .select({ id: bookings.id, bookingNumber: bookings.bookingNumber, status: bookings.status, checkIn: bookings.checkIn, checkOut: bookings.checkOut, unit: bookings.unit, bedsCount: bookings.bedsCount, guestName: users.name, guestPhone: users.phone, propertyName: properties.name, roomNumber: rooms.roomNumber, totalAmount: bookings.totalAmount, paidAmount: bookings.paidAmount })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.customerId))
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .where(and(inIds(bookings.propertyId, ids), inArray(bookings.status, [...statuses]), cond))
    .orderBy(desc(bookings.checkIn))
    .limit(20);
  return rows.map((r) => ({ ...r, guestPhone: maskPhone(r.guestPhone), balanceDue: Math.max(0, r.totalAmount - r.paidAmount) }));
});
