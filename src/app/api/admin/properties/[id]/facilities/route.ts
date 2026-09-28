import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { propertyFacilities } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { logAudit } from "../../../_lib/util";

/** PATCH {facilityId, status, note} — approve/reject a facility claimed by a property. */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.approve");
  const b = await parseBody(req, z.object({ facilityId: z.string().uuid(), status: z.enum(["APPROVED", "REJECTED", "PENDING"]), note: z.string().max(500).nullable().optional() }));
  const [row] = await db
    .update(propertyFacilities)
    .set({ status: b.status, note: b.note ?? null })
    .where(and(eq(propertyFacilities.propertyId, params.id), eq(propertyFacilities.facilityId, b.facilityId)))
    .returning();
  if (!row) throw notFound("Facility not linked to this property");
  await logAudit(req, u, "property_facility.review", "property", params.id, null, b);
  return row;
});
