import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { recomputeRating } from "../../_lib/ratings";
import { logAudit } from "../../_lib/util";

/** PATCH {status: PUBLISHED|HIDDEN|PENDING, clearReports} — moderate a review and refresh the property rating. */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("reviews.moderate");
  const b = await parseBody(req, z.object({ status: z.enum(["PUBLISHED", "HIDDEN", "PENDING"]).optional(), clearReports: z.boolean().optional() }));
  const [r] = await db.select().from(reviews).where(eq(reviews.id, params.id));
  if (!r) throw notFound("Review not found");
  await db.update(reviews).set({ ...(b.status ? { status: b.status } : {}), ...(b.clearReports ? { reportCount: 0, reportReasons: [] } : {}), moderatedBy: u.id }).where(eq(reviews.id, r.id));
  await recomputeRating(r.propertyId);
  await logAudit(req, u, "review.moderate", "review", r.id, { status: r.status, reportCount: r.reportCount }, b);
  return { ok: true };
});
