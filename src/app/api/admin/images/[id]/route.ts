import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { propertyImages, roomImages } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { logAudit } from "../../_lib/util";

/** PATCH {kind: "property"|"room", status} — approve/reject a single image. */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.approve");
  const b = await parseBody(req, z.object({ kind: z.enum(["property", "room"]), status: z.enum(["APPROVED", "REJECTED", "PENDING"]), isCover: z.boolean().optional() }));
  if (b.kind === "property") {
    const [img] = await db.select().from(propertyImages).where(eq(propertyImages.id, params.id));
    if (!img) throw notFound("Image not found");
    if (b.isCover) await db.update(propertyImages).set({ isCover: false }).where(eq(propertyImages.propertyId, img.propertyId));
    await db.update(propertyImages).set({ status: b.status, ...(b.isCover !== undefined ? { isCover: b.isCover } : {}) }).where(eq(propertyImages.id, img.id));
  } else {
    const [img] = await db.update(roomImages).set({ status: b.status }).where(eq(roomImages.id, params.id)).returning();
    if (!img) throw notFound("Image not found");
  }
  await logAudit(req, u, "image.review", `${b.kind}_image`, params.id, null, b);
  return { ok: true };
});
