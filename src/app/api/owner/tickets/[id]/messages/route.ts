import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { supportMessages, supportTickets } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { conflict, notFound } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";

/** POST {body}: add a message to my ticket (re-opens a resolved ticket). */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, params.id), eq(supportTickets.raisedById, u.id)));
  if (!t) throw notFound("Ticket not found");
  if (t.status === "CLOSED") throw conflict("This ticket is closed. Please raise a new one.");
  const { body } = await parseBody(req, z.object({ body: z.string().trim().min(1, "Write a message").max(5000) }));
  await db.insert(supportMessages).values({ ticketId: t.id, authorId: u.id, body });
  if (["RESOLVED", "WAITING_FOR_PROPERTY", "WAITING_FOR_CUSTOMER"].includes(t.status)) await db.update(supportTickets).set({ status: "IN_PROGRESS" }).where(eq(supportTickets.id, t.id));
  return { ok: true };
});
