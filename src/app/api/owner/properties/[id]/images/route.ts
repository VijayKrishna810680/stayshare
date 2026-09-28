import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { propertyImages } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { ownFile } from "@/lib/owner-helpers";

/** POST {fileId, caption}: attach an uploaded PROPERTY_IMAGE. New photos always need StayShare approval. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const body = await parseBody(req, z.object({ fileId: z.string().uuid(), caption: z.string().trim().max(120).optional().nullable() }));
  const f = await ownFile(u.id, body.fileId, ["PROPERTY_IMAGE"]);
  const [agg] = await db.select({ n: sql<number>`count(*)::int`, max: sql<number>`coalesce(max(${propertyImages.sortOrder}), -1)::int` }).from(propertyImages).where(eq(propertyImages.propertyId, p.id));
  if (Number(agg?.n) >= 40) throw badRequest("You can add up to 40 photos per property");
  const [img] = await db
    .insert(propertyImages)
    .values({ propertyId: p.id, url: f.url, caption: body.caption ?? null, sortOrder: Number(agg?.max ?? -1) + 1, isCover: Number(agg?.n) === 0, status: "PENDING" })
    .returning();
  await audit({ actorId: u.id, action: "property.image_add", entityType: "property", entityId: p.id, after: { imageId: img!.id }, ...reqMeta(req) });
  return img;
});

/** PATCH {order?: imageId[], coverId?: imageId, captions?: {id, caption}[]} */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const body = await parseBody(
    req,
    z.object({
      order: z.array(z.string().uuid()).max(100).optional(),
      coverId: z.string().uuid().optional(),
      captions: z.array(z.object({ id: z.string().uuid(), caption: z.string().trim().max(120) })).max(100).optional(),
    }),
  );
  const imgs = await db.select().from(propertyImages).where(eq(propertyImages.propertyId, p.id)).orderBy(asc(propertyImages.sortOrder));
  const own = new Set(imgs.map((i) => i.id));
  const check = (ids: string[]) => {
    if (ids.some((i) => !own.has(i))) throw badRequest("Photo not found in this property");
  };
  await db.transaction(async (tx) => {
    if (body.order) {
      check(body.order);
      for (const [i, id] of body.order.entries()) await tx.update(propertyImages).set({ sortOrder: i }).where(eq(propertyImages.id, id));
    }
    if (body.coverId) {
      check([body.coverId]);
      await tx.update(propertyImages).set({ isCover: false }).where(eq(propertyImages.propertyId, p.id));
      await tx.update(propertyImages).set({ isCover: true }).where(and(eq(propertyImages.id, body.coverId), inArray(propertyImages.id, [...own])));
    }
    if (body.captions) {
      check(body.captions.map((c) => c.id));
      for (const c of body.captions) await tx.update(propertyImages).set({ caption: c.caption }).where(eq(propertyImages.id, c.id));
    }
  });
  await audit({ actorId: u.id, action: "property.images_update", entityType: "property", entityId: p.id, after: body, ...reqMeta(req) });
  return { ok: true };
});
