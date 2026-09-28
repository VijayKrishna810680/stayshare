import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewReplies } from "@/db/schema";
import { api } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { logAudit } from "../../_lib/util";

/** DELETE — remove an owner/admin reply to a review. */
export const DELETE = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("reviews.moderate");
  const [r] = await db.select().from(reviewReplies).where(eq(reviewReplies.id, params.id));
  if (!r) throw notFound("Reply not found");
  await db.delete(reviewReplies).where(eq(reviewReplies.id, r.id));
  await logAudit(req, u, "review_reply.delete", "review_reply", r.id, r, null);
  return { ok: true };
});
