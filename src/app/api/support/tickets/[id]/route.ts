import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, fileUploads, supportMessages, supportTickets, users } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";

async function mine(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Ticket not found");
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.raisedById, userId)));
  if (!t) throw notFound("Ticket not found");
  return t;
}

/** GET: ticket + conversation (internal notes are never shown to customers). */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const t = await mine(params.id, u.id);
  const [msgs, bk] = await Promise.all([
    db
      .select({ id: supportMessages.id, body: supportMessages.body, attachments: supportMessages.attachments, createdAt: supportMessages.createdAt, authorId: supportMessages.authorId, authorName: users.name })
      .from(supportMessages)
      .innerJoin(users, eq(users.id, supportMessages.authorId))
      .where(and(eq(supportMessages.ticketId, t.id), eq(supportMessages.isInternal, false)))
      .orderBy(asc(supportMessages.createdAt)),
    t.bookingId ? db.select({ id: bookings.id, bookingNumber: bookings.bookingNumber }).from(bookings).where(eq(bookings.id, t.bookingId)) : Promise.resolve([]),
  ]);
  return {
    ticket: { id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, description: t.description, category: t.category, priority: t.priority, status: t.status, resolution: t.resolution, attachments: t.attachments, createdAt: t.createdAt, updatedAt: t.updatedAt, booking: bk[0] ?? null },
    messages: msgs.map((m) => ({ ...m, mine: m.authorId === u.id, authorName: m.authorId === u.id ? "You" : `${m.authorName.split(" ")[0]} · StayShare support` })),
  };
});

/** POST {body, attachmentIds}: reply. Re-opens resolved tickets. */
export const POST = api<{ id: string }>(
  async (req, { params }) => {
    const u = await requireUser();
    const t = await mine(params.id, u.id);
    const b = await parseBody(req, z.object({ body: z.string().trim().min(1, "Type a message").max(5000), attachmentIds: z.array(z.string().uuid()).max(5).default([]) }));
    if (t.status === "CLOSED") throw badRequest("This ticket is closed. Please raise a new ticket.");
    let attachments: string[] = [];
    if (b.attachmentIds.length) {
      const files = await db.select({ id: fileUploads.id, uploadedBy: fileUploads.uploadedBy }).from(fileUploads).where(inArray(fileUploads.id, b.attachmentIds));
      if (files.some((f) => f.uploadedBy !== u.id) || files.length !== b.attachmentIds.length) throw badRequest("Please re-upload your attachments");
      attachments = files.map((f) => `/api/files/${f.id}`);
    }
    const [m] = await db.insert(supportMessages).values({ ticketId: t.id, authorId: u.id, body: b.body, attachments }).returning();
    const nextStatus = t.status === "RESOLVED" || t.status === "WAITING_FOR_CUSTOMER" ? (t.assignedToId ? "IN_PROGRESS" : "OPEN") : t.status;
    await db.update(supportTickets).set({ status: nextStatus, updatedAt: new Date() }).where(eq(supportTickets.id, t.id));
    return { id: m!.id, status: nextStatus };
  },
  { rateLimit: { limit: 30, windowSec: 600 } },
);
