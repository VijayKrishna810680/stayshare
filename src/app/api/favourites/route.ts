import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { favourites, properties } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";

/** GET: my saved properties. */
export const GET = api(async () => {
  const u = await requireUser();
  return db
    .select({ propertyId: favourites.propertyId, createdAt: favourites.createdAt, name: properties.name, slug: properties.slug, startingPrice: properties.startingPrice, ratingAvg: properties.ratingAvg })
    .from(favourites)
    .innerJoin(properties, eq(properties.id, favourites.propertyId))
    .where(eq(favourites.userId, u.id))
    .orderBy(desc(favourites.createdAt));
});

/** POST {propertyId}: save. */
export const POST = api(async (req) => {
  const u = await requireUser();
  const { propertyId } = await parseBody(req, z.object({ propertyId: z.string().uuid() }));
  const [p] = await db.select({ id: properties.id }).from(properties).where(and(eq(properties.id, propertyId), eq(properties.approvalStatus, "APPROVED")));
  if (!p) throw notFound("Property not found");
  await db.insert(favourites).values({ userId: u.id, propertyId }).onConflictDoNothing();
  return { saved: true };
});

/** DELETE ?propertyId=: unsave. */
export const DELETE = api(async (req) => {
  const u = await requireUser();
  const propertyId = z.string().uuid().parse(req.nextUrl.searchParams.get("propertyId"));
  await db.delete(favourites).where(and(eq(favourites.userId, u.id), eq(favourites.propertyId, propertyId)));
  return { saved: false };
});
