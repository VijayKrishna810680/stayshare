import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookingModifications, pricePlans, rooms } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { todayIST } from "@/lib/dates";
import { getOwnedBookingRow } from "@/lib/site/bookings";
import { roomsAvailability, sweepExpiredHolds } from "@/services/availability";
import { createPaymentOrder } from "@/services/booking";
import { requestModification, type ModificationRequest } from "@/services/stay";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/, "Pick a time");
const reqSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EXTEND_STAY"), newCheckOut: date }),
  z.object({ type: z.literal("EARLY_CHECK_IN"), time }),
  z.object({ type: z.literal("LATE_CHECK_OUT"), time }),
  z.object({ type: z.enum(["ROOM_CHANGE", "BED_CHANGE", "UPGRADE_AC", "UPGRADE_PRIVATE"]), targetRoomId: z.string().uuid(), unit: z.enum(["BED", "ROOM"]), bedIds: z.array(z.string().uuid()).max(20).optional() }),
  z.object({
    type: z.literal("ADD_GUEST"),
    guest: z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(20).optional(), gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(), age: z.number().int().min(0).max(120).optional(), isChild: z.boolean().optional() }),
  }),
  z.object({ type: z.literal("REMOVE_GUEST"), guestId: z.string().uuid() }),
]);
const bodySchema = z.union([z.object({ action: z.literal("request"), request: reqSchema }), z.object({ action: z.literal("pay"), modificationId: z.string().uuid() })]);

/** GET: rooms in the same property with availability for the remaining nights (for room change / upgrades). */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const b = await getOwnedBookingRow(params.id, u.id);
  const today = todayIST();
  const fromNight = today > b.checkIn ? today : b.checkIn;
  const rows = await db
    .select({ id: rooms.id, roomNumber: rooms.roomNumber, name: rooms.name, category: rooms.category, isAC: rooms.isAC, totalBeds: rooms.totalBeds, allowBed: rooms.allowBedBooking, allowRoom: rooms.allowEntireRoomBooking, nightlyBed: pricePlans.nightlyBed, nightlyRoom: pricePlans.nightlyRoom })
    .from(rooms)
    .innerJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true)))
    .where(and(eq(rooms.propertyId, b.propertyId), eq(rooms.approvalStatus, "APPROVED"), eq(rooms.active, true), isNull(rooms.deletedAt)));
  await sweepExpiredHolds();
  const avail = fromNight < b.checkOut ? await roomsAvailability(rows.map((r) => r.id), fromNight, b.checkOut) : new Map();
  const seen = new Set<string>();
  return {
    fromNight,
    currentRoomId: b.roomId,
    rooms: rows
      .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .map((r) => ({ ...r, availableBeds: avail.get(r.id)?.availableBeds ?? 0, entireRoomAvailable: Boolean(avail.get(r.id)?.entireRoomAvailable) })),
  };
});

/** POST: request a modification, or pay for one that is awaiting payment. */
export const POST = api<{ id: string }>(
  async (req, { params }) => {
    const u = await requireUser();
    const b = await getOwnedBookingRow(params.id, u.id);
    const body = await parseBody(req, bodySchema);
    if (body.action === "pay") {
      const [m] = await db.select().from(bookingModifications).where(and(eq(bookingModifications.id, body.modificationId), eq(bookingModifications.bookingId, b.id)));
      if (!m) throw notFound("Change request not found");
      if (m.status !== "AWAITING_PAYMENT") throw conflict("This change request is not awaiting payment");
      if (m.priceDiff <= 0) throw badRequest("Nothing to pay");
      const order = await createPaymentOrder(b.id, m.type === "EXTEND_STAY" ? "EXTENSION" : "MODIFICATION", m.priceDiff, { name: u.name, email: u.email, phone: u.phone }, m.id);
      await db.update(bookingModifications).set({ paymentId: order.paymentId }).where(eq(bookingModifications.id, m.id));
      return { modificationId: m.id, status: m.status, priceDiff: m.priceDiff, checkout: order.checkout };
    }
    const r = body.request;
    if (r.type === "EXTEND_STAY" && r.newCheckOut <= b.checkOut) throw badRequest("Pick a date after your current check-out");
    return requestModification(b.id, { id: u.id, role: "CUSTOMER" }, r as ModificationRequest);
  },
  { rateLimit: { limit: 15, windowSec: 600 } },
);
