import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { supportTickets } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { notify } from "@/services/notifications";
import { defined, logAudit } from "../../_lib/util";

const schema = z.object({
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "WAITING_FOR_PROPERTY", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  resolution: z.string().trim().max(3000).nullable().optional(),
});

/** PATCH ticket status / priority / assignee / resolution. Notifies the customer on status changes. */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("support.manage");
  const b = defined(await parseBody(req, schema));
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, params.id));
  if (!t) throw notFound("Ticket not found");
  if (b.status === "RESOLVED" && !(b.resolution ?? t.resolution)) throw badRequest("Add a resolution summary before resolving");
  const patch: Partial<typeof supportTickets.$inferInsert> = { ...b };
  if (b.assignedToId && t.status === "OPEN" && !b.status) patch.status = "ASSIGNED";
  if (b.status === "RESOLVED" || b.status === "CLOSED") patch.resolvedAt = t.resolvedAt ?? new Date();
  if (b.status && !["RESOLVED", "CLOSED"].includes(b.status)) patch.resolvedAt = null;
  const [after] = await db.update(supportTickets).set(patch).where(eq(supportTickets.id, t.id)).returning();
  await logAudit(req, u, "ticket.update", "support_ticket", t.id, { status: t.status, priority: t.priority, assignedToId: t.assignedToId }, patch);
  if (patch.status && patch.status !== t.status) {
    await notify("ticket.updated", { userId: t.raisedById, vars: { ticketNumber: t.ticketNumber, message: `Your ticket "${t.subject}" is now ${patch.status.replace(/_/g, " ").toLowerCase()}.${patch.resolution ? ` Resolution: ${patch.resolution}` : ""}` }, data: { ticketId: t.id } });
  }
  return after;
});
