import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, properties, supportTickets } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nextTicketNumber } from "@/lib/counters";
import { badRequest } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";

const schema = z.object({
  category: z.enum(["BOOKING", "PAYMENT", "REFUND", "CHECK_IN", "PROPERTY_ISSUE", "SAFETY", "ROOM_ISSUE", "OWNER_PAYOUT", "TECHNICAL", "OTHER"]),
  subject: z.string().trim().min(5, "Subject must be at least 5 characters").max(150),
  description: z.string().trim().min(10, "Describe the issue (at least 10 characters)").max(5000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  propertyId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  bookingNumber: z.string().trim().max(40).optional().nullable().or(z.literal("").transform(() => null)),
  attachments: z.array(z.string().uuid()).max(5).default([]),
});

/** POST: raise a support ticket to the StayShare team as a partner. */
export const POST = api(async (req) => {
  const u = await requireOwner();
  const body = await parseBody(req, schema);
  if (body.propertyId) {
    const [p] = await db.select({ id: properties.id }).from(properties).where(and(eq(properties.id, body.propertyId), eq(properties.ownerId, u.id), isNull(properties.deletedAt)));
    if (!p) throw badRequest("Property not found");
  }
  let bookingId: string | null = null;
  if (body.bookingNumber) {
    const [b] = await db.select({ id: bookings.id, ownerId: properties.ownerId }).from(bookings).innerJoin(properties, eq(properties.id, bookings.propertyId)).where(eq(bookings.bookingNumber, body.bookingNumber));
    if (!b || b.ownerId !== u.id) throw badRequest("Booking not found at your properties");
    bookingId = b.id;
  }
  const [t] = await db
    .insert(supportTickets)
    .values({ ticketNumber: await nextTicketNumber(), raisedById: u.id, raisedByRole: "OWNER", category: body.category, subject: body.subject, description: body.description, priority: body.priority, propertyId: body.propertyId ?? null, bookingId, attachments: body.attachments.map((id) => `/api/files/${id}`) })
    .returning();
  await audit({ actorId: u.id, action: "ticket.create", entityType: "support_ticket", entityId: t!.id, after: { ticketNumber: t!.ticketNumber, subject: t!.subject }, ...reqMeta(req) });
  return { id: t!.id, ticketNumber: t!.ticketNumber };
});
