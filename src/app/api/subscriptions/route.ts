import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { expireSubscriptions, startSubscriptionPurchase } from "@/services/subscriptions";

/** GET: my subscriptions (history). */
export const GET = api(async () => {
  const u = await requireUser();
  await expireSubscriptions();
  return db.select().from(subscriptions).where(eq(subscriptions.userId, u.id)).orderBy(desc(subscriptions.createdAt));
});

/** POST {planId}: start purchase → returns checkout (redirect/razorpay) — activation happens on verified payment. */
export const POST = api(async (req) => {
  const u = await requireUser();
  const { planId } = await parseBody(req, z.object({ planId: z.string().uuid() }));
  return startSubscriptionPurchase(u, planId);
});
