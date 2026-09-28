import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { conflict, notFound } from "@/lib/errors";

/** Report a review for moderation (once per user). */
export const POST = api<{ id: string }>(
  async (req, { params }) => {
    const u = await requireUser();
    const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(3).max(500) }));
    const [r] = await db.select().from(reviews).where(eq(reviews.id, params.id));
    if (!r) throw notFound("Review not found");
    if (r.reportReasons.some((x) => x.userId === u.id)) throw conflict("You have already reported this review");
    await db
      .update(reviews)
      .set({ reportCount: sql`${reviews.reportCount} + 1`, reportReasons: [...r.reportReasons, { userId: u.id, reason }] })
      .where(eq(reviews.id, r.id));
    return { ok: true };
  },
  { rateLimit: { limit: 10, windowSec: 600 } },
);
