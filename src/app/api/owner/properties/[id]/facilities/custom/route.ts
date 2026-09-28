import { z } from "zod";
import { db } from "@/db";
import { facilities, propertyFacilities } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { slugify } from "@/lib/owner-helpers";

/** POST {name}: request a facility that isn't in the catalogue (inactive until StayShare approves it). */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const { name } = await parseBody(req, z.object({ name: z.string().trim().min(2, "Enter the facility name").max(60) }));
  const key = `CUSTOM_${slugify(name).replace(/-/g, "_").toUpperCase().slice(0, 30)}_${Date.now().toString(36).toUpperCase()}`;
  const [f] = await db.insert(facilities).values({ key, name, isCustom: true, active: false, category: "GENERAL" }).returning();
  await db.insert(propertyFacilities).values({ propertyId: p.id, facilityId: f!.id, status: "PENDING", note: "Custom facility requested by partner" });
  await audit({ actorId: u.id, action: "facility.custom_request", entityType: "property", entityId: p.id, after: { name }, ...reqMeta(req) });
  return { id: f!.id };
});
