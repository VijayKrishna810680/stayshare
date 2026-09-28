import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { supportMessages, supportTickets } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { notify } from "@/services/notifications";
import { logAudit } from "../../../_lib/util";

/** POST {body, isInternal} — reply to the customer or add an internal note. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("support.manage");
  const b = await parseBody(req, z.object({ body: z.string().trim().min(1).max(5000), isInternal: z.boolean().default(false) }));
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, params.id));
  if (!t) throw notFound("Ticket not found");
  const [m] = await db.insert(supportMessages).values({ ticketId: t.id, authorId: u.id, body: b.body, isInternal: b.isInternal }).returning();
  const patch: Partial<typeof supportTickets.$inferInsert> = { updatedAt: new Date() };
  if (!b.isInternal && ["OPEN", "ASSIGNED"].includes(t.status)) patch.status = "IN_PROGRESS";
  if (!t.assignedToId) patch.assignedToId = u.id;
  await db.update(supportTickets).set(patch).where(eq(supportTickets.id, t.id));
  await logAudit(req, u, b.isInternal ? "ticket.note" : "ticket.reply", "support_ticket", t.id, null, { messageId: m!.id });
  if (!b.isInternal) await notify("ticket.updated", { userId: t.raisedById, vars: { ticketNumber: t.ticketNumber, message: `New reply from StayShare support: ${b.body.slice(0, 300)}` }, data: { ticketId: t.id } });
  return m;
});
