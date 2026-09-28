import { z } from "zod";
import { api, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { BOOKING_BUCKETS } from "@/lib/site/labels";
import { listMyBookings } from "@/lib/site/bookings";
import { createBooking } from "@/services/booking";

const guest = z.object({
  name: z.string().trim().min(2, "Enter each guest's full name").max(80),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email("Enter a valid guest email").max(120).optional().nullable().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable(),
  age: z.number().int().min(0).max(120).optional().nullable(),
});

const schema = z.object({
  roomId: z.string().uuid(),
  unit: z.enum(["BED", "ROOM"]),
  bedIds: z.array(z.string().uuid()).max(20).optional(),
  bedsCount: z.number().int().min(1).max(20),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20).default(0),
  services: z.array(z.enum(["FOOD", "LAUNDRY"])).max(2).default([]),
  couponCode: z.string().trim().max(40).optional().nullable(),
  guests: z.array(guest).min(1, "Add the primary guest").max(20),
  specialRequests: z.string().trim().max(500).optional().nullable(),
  idProofFileId: z.string().uuid().optional().nullable(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the terms, house rules and cancellation policy" }) }),
  paymentOption: z.enum(["FULL", "PARTIAL", "PAY_AT_PROPERTY"]),
});

/** GET: my bookings (?bucket=upcoming|current|past|cancelled). */
export const GET = api(async (req) => {
  const u = await requireUser();
  const { bucket } = parseQuery(req, z.object({ bucket: z.enum(["upcoming", "current", "past", "cancelled"]).optional() }));
  return listMyBookings(u.id, bucket ? BOOKING_BUCKETS[bucket] : undefined);
});

/** POST: create a booking — holds inventory and returns the payment checkout. */
export const POST = api(
  async (req) => {
    const u = await requireUser();
    const body = await parseBody(req, schema);
    const out = await createBooking(
      { id: u.id, name: u.name, email: u.email, phone: u.phone },
      { ...body, guests: body.guests.map((g) => ({ ...g, email: g.email || null })), source: req.headers.get("x-app-platform") === "android" ? "ANDROID" : "WEB" },
    );
    return out;
  },
  { rateLimit: { limit: 20, windowSec: 300 } },
);
