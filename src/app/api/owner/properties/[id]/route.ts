import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cities, localities, properties, propertyTypes } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest, conflict } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { roomHasLiveBookings } from "@/lib/owner-helpers";
import { rooms } from "@/db/schema";
import { and, isNull } from "drizzle-orm";
import { propertyUpdateSchema } from "@/components/owner/schemas";

const KEY_FIELDS = ["name", "propertyTypeId", "addressLine", "cityId", "localityId", "postalCode", "latitude", "longitude", "genderEligibility", "description"] as const;

export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireOwner();
  return assertOwnsProperty(u, params.id);
});

/**
 * PATCH: update property info. On an APPROVED property, key-info changes stay live but are flagged for
 * StayShare re-review in the audit log (action property.key_change_pending_review).
 */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const body = await parseBody(req, propertyUpdateSchema);
  if (body.cityId) {
    const [c] = await db.select().from(cities).where(eq(cities.id, body.cityId));
    if (!c || !c.active) throw badRequest("Select a valid city");
  }
  if (body.propertyTypeId) {
    const [t] = await db.select().from(propertyTypes).where(eq(propertyTypes.id, body.propertyTypeId));
    if (!t) throw badRequest("Select a valid property type");
  }
  if (body.localityId) {
    const [l] = await db.select().from(localities).where(eq(localities.id, body.localityId));
    if (!l || l.cityId !== (body.cityId ?? p.cityId)) throw badRequest("Locality does not belong to the selected city");
  } else if (body.cityId && body.cityId !== p.cityId && body.localityId === undefined) {
    body.localityId = null;
  }
  const min = body.minStayNights ?? p.minStayNights;
  const max = body.maxStayNights ?? p.maxStayNights;
  if (max < min) throw badRequest("Maximum stay must be at least the minimum stay");
  const lat = body.latitude !== undefined ? body.latitude : p.latitude;
  const lng = body.longitude !== undefined ? body.longitude : p.longitude;
  const mapUrl = lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : p.mapUrl;
  const changedKeys = KEY_FIELDS.filter((k) => body[k] !== undefined && JSON.stringify(body[k]) !== JSON.stringify(p[k]));
  const [upd] = await db.update(properties).set({ ...body, mapUrl, updatedBy: u.id }).where(eq(properties.id, p.id)).returning();
  const before = Object.fromEntries(changedKeys.map((k) => [k, p[k]]));
  const after = Object.fromEntries(changedKeys.map((k) => [k, upd![k]]));
  await audit({ actorId: u.id, action: p.approvalStatus === "APPROVED" && changedKeys.length ? "property.key_change_pending_review" : "property.update", entityType: "property", entityId: p.id, before, after: { ...after, fields: Object.keys(body) }, ...reqMeta(req) });
  return { ok: true, needsReview: p.approvalStatus === "APPROVED" && changedKeys.length > 0 };
});

/** DELETE: only drafts (never-live properties) can be removed by the owner. */
export const DELETE = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  if (!["DRAFT", "REJECTED"].includes(p.approvalStatus)) throw conflict("Only draft or rejected properties can be deleted. Contact StayShare support to delist a live property.");
  const rs = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.propertyId, p.id), isNull(rooms.deletedAt)));
  for (const r of rs) if (await roomHasLiveBookings(r.id)) throw conflict("This property has active bookings");
  await db.update(properties).set({ deletedAt: new Date(), active: false, updatedBy: u.id }).where(eq(properties.id, p.id));
  await audit({ actorId: u.id, action: "property.delete", entityType: "property", entityId: p.id, before: { name: p.name, code: p.code }, ...reqMeta(req) });
  return { ok: true };
});
