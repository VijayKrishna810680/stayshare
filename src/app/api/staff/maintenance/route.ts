import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { maintenanceIssues, rooms } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { assertStaffProperty, requireStaffOrOwner } from "@/lib/owner-access";

const schema = z.object({
  propertyId: z.string().uuid(),
  roomId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  title: z.string().trim().min(3, "Give the issue a short title").max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

/** POST: report a maintenance issue at an assigned property. */
export const POST = api(async (req) => {
  const u = await requireStaffOrOwner();
  const body = await parseBody(req, schema);
  await assertStaffProperty(u, body.propertyId);
  if (body.roomId) {
    const [r] = await db.select({ propertyId: rooms.propertyId }).from(rooms).where(eq(rooms.id, body.roomId));
    if (!r || r.propertyId !== body.propertyId) throw badRequest("Room does not belong to this property");
  }
  const [m] = await db.insert(maintenanceIssues).values({ ...body, roomId: body.roomId ?? null, description: body.description ?? null, reportedBy: u.id }).returning();
  await audit({ actorId: u.id, action: "maintenance.create", entityType: "maintenance_issue", entityId: m!.id, after: m, ...reqMeta(req) });
  return m;
});
