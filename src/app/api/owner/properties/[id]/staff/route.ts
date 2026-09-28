import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { staffAssignments, staffProfiles } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";

/** PUT {userId, assigned}: assign / unassign one of MY staff members to this property. */
export const PUT = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const body = await parseBody(req, z.object({ userId: z.string().uuid(), assigned: z.boolean() }));
  const [sp] = await db.select().from(staffProfiles).where(and(eq(staffProfiles.userId, body.userId), eq(staffProfiles.employerId, u.id)));
  if (!sp) throw notFound("Staff member not found");
  if (body.assigned) await db.insert(staffAssignments).values({ userId: body.userId, propertyId: p.id }).onConflictDoNothing();
  else await db.delete(staffAssignments).where(and(eq(staffAssignments.userId, body.userId), eq(staffAssignments.propertyId, p.id)));
  await audit({ actorId: u.id, action: body.assigned ? "staff.assign" : "staff.unassign", entityType: "property", entityId: p.id, after: { userId: body.userId }, ...reqMeta(req) });
  return { ok: true };
});
