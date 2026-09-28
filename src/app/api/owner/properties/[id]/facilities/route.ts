import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { facilities, propertyFacilities } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";

/** PUT {facilityIds}: replace the property's facility list. New ones need approval (PENDING). */
export const PUT = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const { facilityIds } = await parseBody(req, z.object({ facilityIds: z.array(z.string().uuid()).max(100) }));
  const ids = [...new Set(facilityIds)];
  if (ids.length) {
    const valid = await db.select({ id: facilities.id }).from(facilities).where(inArray(facilities.id, ids));
    if (valid.length !== ids.length) throw badRequest("Unknown facility");
  }
  const existing = await db.select().from(propertyFacilities).where(eq(propertyFacilities.propertyId, p.id));
  const have = new Set(existing.map((e) => e.facilityId));
  // Custom requests stay unless explicitly removed through the list.
  await db.delete(propertyFacilities).where(and(eq(propertyFacilities.propertyId, p.id), ids.length ? notInArray(propertyFacilities.facilityId, ids) : undefined));
  const add = ids.filter((i) => !have.has(i));
  if (add.length) await db.insert(propertyFacilities).values(add.map((facilityId) => ({ propertyId: p.id, facilityId, status: "PENDING" as const })));
  await audit({ actorId: u.id, action: "property.facilities", entityType: "property", entityId: p.id, after: { added: add.length, total: ids.length }, ...reqMeta(req) });
  return { ok: true };
});
