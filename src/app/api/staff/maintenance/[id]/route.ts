import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { maintenanceIssues } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { assertStaffProperty, requireStaffOrOwner } from "@/lib/owner-access";

/** PATCH {status?, priority?, description?} */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requireStaffOrOwner();
  const [m] = await db.select().from(maintenanceIssues).where(eq(maintenanceIssues.id, params.id));
  if (!m) throw notFound("Issue not found");
  await assertStaffProperty(u, m.propertyId);
  const body = await parseBody(req, z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(), description: z.string().trim().max(2000).optional() }));
  const [upd] = await db
    .update(maintenanceIssues)
    .set({ ...body, resolvedAt: body.status === "RESOLVED" ? new Date() : body.status ? null : m.resolvedAt })
    .where(eq(maintenanceIssues.id, m.id))
    .returning();
  await audit({ actorId: u.id, action: "maintenance.update", entityType: "maintenance_issue", entityId: m.id, before: { status: m.status, priority: m.priority }, after: body, ...reqMeta(req) });
  return upd;
});
