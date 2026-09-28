import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { propertyImages } from "@/db/schema";
import { api, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";

export const DELETE = api<{ id: string; imageId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const [img] = await db.select().from(propertyImages).where(and(eq(propertyImages.id, params.imageId), eq(propertyImages.propertyId, p.id)));
  if (!img) throw notFound("Photo not found");
  await db.delete(propertyImages).where(eq(propertyImages.id, img.id));
  if (img.isCover) {
    const [next] = await db.select().from(propertyImages).where(eq(propertyImages.propertyId, p.id)).orderBy(asc(propertyImages.sortOrder)).limit(1);
    if (next) await db.update(propertyImages).set({ isCover: true }).where(eq(propertyImages.id, next.id));
  }
  await audit({ actorId: u.id, action: "property.image_delete", entityType: "property", entityId: p.id, before: { imageId: img.id, url: img.url }, ...reqMeta(req) });
  return { ok: true };
});
