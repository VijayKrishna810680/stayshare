import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatConversations, supportTickets } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { nextTicketNumber } from "@/lib/counters";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { listMessages } from "@/services/livechat";
import { logAudit } from "../../../_lib/util";

/** POST {subject, category, priority} — turn a live chat into a support ticket with the transcript. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("support.manage");
  const b = await parseBody(req, z.object({ subject: z.string().trim().min(3).max(160), category: z.enum(["BOOKING", "PAYMENT", "REFUND", "CHECK_IN", "PROPERTY_ISSUE", "SAFETY", "ROOM_ISSUE", "OWNER_PAYOUT", "TECHNICAL", "OTHER"]).default("OTHER"), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM") }));
  const [c] = await db.select().from(chatConversations).where(eq(chatConversations.id, params.id));
  if (!c) throw notFound("Conversation not found");
  if (c.ticketId) throw conflict("This chat was already converted to a ticket");
  if (!c.userId) throw badRequest("This visitor has no StayShare account — ask them to sign in or share contact details, then raise a ticket manually.");
  const msgs = await listMessages(c.id);
  const transcript = msgs.map((m) => `[${m.createdAt.toISOString().slice(0, 16).replace("T", " ")}] ${m.fromAgent ? `Agent${m.authorName ? ` (${m.authorName})` : ""}` : "Customer"}: ${m.body}`).join("\n");
  const [t] = await db
    .insert(supportTickets)
    .values({ ticketNumber: await nextTicketNumber(), raisedById: c.userId, raisedByRole: "CUSTOMER", category: b.category, priority: b.priority, subject: b.subject, description: `Created from live chat.\n\n${transcript}`.slice(0, 20000), status: "ASSIGNED", assignedToId: u.id })
    .returning();
  await db.update(chatConversations).set({ ticketId: t!.id }).where(eq(chatConversations.id, c.id));
  await logAudit(req, u, "chat.convert_ticket", "chat_conversation", c.id, null, { ticketId: t!.id });
  return t;
});
