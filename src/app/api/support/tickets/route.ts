import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, fileUploads, supportMessages, supportTickets } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { nextTicketNumber } from "@/lib/counters";
import { badRequest } from "@/lib/errors";
import { inArray } from "drizzle-orm";

/** GET: my support tickets. */
export const GET = api(async () => {
  const u = await requireUser();
  return db
    .select({ id: supportTickets.id, ticketNumber: supportTickets.ticketNumber, subject: supportTickets.subject, category: supportTickets.category, priority: supportTickets.priority, status: supportTickets.status, bookingId: supportTickets.bookingId, bookingNumber: bookings.bookingNumber, createdAt: supportTickets.createdAt, updatedAt: supportTickets.updatedAt })
    .from(supportTickets)
    .leftJoin(bookings, eq(bookings.id, supportTickets.bookingId))
    .where(eq(supportTickets.raisedById, u.id))
    .orderBy(desc(supportTickets.updatedAt));
});

const schema = z.object({
  category: z.enum(["BOOKING", "PAYMENT", "REFUND", "CHECK_IN", "PROPERTY_ISSUE", "SAFETY", "ROOM_ISSUE", "OWNER_PAYOUT", "TECHNICAL", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  subject: z.string().trim().min(5, "Subject should be at least 5 characters").max(140),
  description: z.string().trim().min(10, "Please describe the issue (at least 10 characters)").max(5000),
  bookingId: z.string().uuid().optional().nullable(),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
});

/** POST: raise a ticket (optionally linked to one of my bookings, with attachments). */
export const POST = api(
  async (req) => {
    const u = await requireUser();
    const b = await parseBody(req, schema);
    let propertyId: string | null = null;
    if (b.bookingId) {
      const [bk] = await db.select({ id: bookings.id, propertyId: bookings.propertyId }).from(bookings).where(and(eq(bookings.id, b.bookingId), eq(bookings.customerId, u.id)));
      if (!bk) throw badRequest("That booking isn't on your account");
      propertyId = bk.propertyId;
    }
    let attachments: string[] = [];
    if (b.attachmentIds.length) {
      const files = await db.select({ id: fileUploads.id, uploadedBy: fileUploads.uploadedBy }).from(fileUploads).where(inArray(fileUploads.id, b.attachmentIds));
      if (files.length !== b.attachmentIds.length || files.some((f) => f.uploadedBy !== u.id)) throw badRequest("Please re-upload your attachments");
      attachments = files.map((f) => `/api/files/${f.id}`);
    }
    const ticketNumber = await nextTicketNumber();
    const [t] = await db
      .insert(supportTickets)
      .values({ ticketNumber, raisedById: u.id, raisedByRole: u.isOwner ? "OWNER" : "CUSTOMER", bookingId: b.bookingId ?? null, propertyId, category: b.category, priority: b.priority, subject: b.subject, description: b.description, attachments })
      .returning();
    await db.insert(supportMessages).values({ ticketId: t!.id, authorId: u.id, body: b.description, attachments });
    return { id: t!.id, ticketNumber: t!.ticketNumber };
  },
  { rateLimit: { limit: 10, windowSec: 600 } },
);
