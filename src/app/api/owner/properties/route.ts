import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cities, properties, localities, propertyTypes } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nextCounter } from "@/lib/counters";
import { badRequest, AppError } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";
import { uniqueSlug } from "@/lib/owner-helpers";
import { ownerPropertyLimit } from "@/services/subscriptions";
import { propertyCreateSchema } from "@/components/owner/schemas";

/** GET: my properties. */
export const GET = api(async () => {
  const u = await requireOwner();
  return db
    .select({ id: properties.id, code: properties.code, name: properties.name, approvalStatus: properties.approvalStatus, active: properties.active, city: cities.name })
    .from(properties)
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt)))
    .orderBy(desc(properties.createdAt));
});

/** POST: create a DRAFT property (no prices — those are set by the StayShare team). */
export const POST = api(async (req) => {
  const u = await requireOwner();
  const body = await parseBody(req, propertyCreateSchema);
  const limit = await ownerPropertyLimit(u.id);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt)))) as [{ n: number }];
  if (Number(n) >= limit) throw new AppError(403, "PLAN_LIMIT", `Your partner plan allows ${limit} properties. Upgrade your plan to add more.`);
  const [city] = await db.select().from(cities).where(eq(cities.id, body.cityId));
  if (!city || !city.active) throw badRequest("Select a valid city");
  const [pt] = await db.select().from(propertyTypes).where(eq(propertyTypes.id, body.propertyTypeId));
  if (!pt || !pt.active) throw badRequest("Select a valid property type");
  let locName = "";
  if (body.localityId) {
    const [l] = await db.select().from(localities).where(eq(localities.id, body.localityId));
    if (!l || l.cityId !== city.id) throw badRequest("Locality does not belong to the selected city");
    locName = l.name;
  }
  let code = "";
  for (let i = 0; i < 200; i++) {
    const c = `${city.code}${String(await nextCounter(`property:${city.code}`)).padStart(3, "0")}`;
    const [e] = await db.select({ id: properties.id }).from(properties).where(eq(properties.code, c));
    if (!e) {
      code = c;
      break;
    }
  }
  if (!code) throw badRequest("Could not allocate a property code, please retry");
  const slug = await uniqueSlug(`${body.name} ${locName || city.name}`);
  const mapUrl = body.latitude != null && body.longitude != null ? `https://www.google.com/maps?q=${body.latitude},${body.longitude}` : null;
  const [p] = await db
    .insert(properties)
    .values({ ...body, localityId: body.localityId ?? null, code, slug, mapUrl, ownerId: u.id, approvalStatus: "DRAFT", kycStatus: "PENDING", createdBy: u.id, updatedBy: u.id })
    .returning();
  await audit({ actorId: u.id, action: "property.create", entityType: "property", entityId: p!.id, after: { code, name: p!.name }, ...reqMeta(req) });
  return { id: p!.id, code, slug };
});
