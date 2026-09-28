import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviewReplies, reviews } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";

/** POST {text}: reply publicly to a guest review (one reply per partner; posting again edits it). */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const [r] = await db.select().from(reviews).where(eq(reviews.id, params.id));
  if (!r) throw notFound("Review not found");
  await assertOwnsProperty(u, r.propertyId);
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(2, "Write a reply").max(1500) }));
  const [existing] = await db.select().from(reviewReplies).where(and(eq(reviewReplies.reviewId, r.id), eq(reviewReplies.authorId, u.id)));
  if (existing) await db.update(reviewReplies).set({ text }).where(eq(reviewReplies.id, existing.id));
  else await db.insert(reviewReplies).values({ reviewId: r.id, authorId: u.id, text });
  await audit({ actorId: u.id, action: existing ? "review.reply_edit" : "review.reply", entityType: "review", entityId: r.id, after: { text }, ...reqMeta(req) });
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const [r] = await db.select().from(reviews).where(eq(reviews.id, params.id));
  if (!r) throw notFound("Review not found");
  await assertOwnsProperty(u, r.propertyId);
  await db.delete(reviewReplies).where(and(eq(reviewReplies.reviewId, r.id), eq(reviewReplies.authorId, u.id)));
  await audit({ actorId: u.id, action: "review.reply_delete", entityType: "review", entityId: r.id, ...reqMeta(req) });
  return { ok: true };
});
