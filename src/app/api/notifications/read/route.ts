import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";

/** POST {ids:[...]} or {all:true}: mark in-app notifications as read. */
export const POST = api(async (req) => {
  const u = await requireUser();
  const b = await parseBody(req, z.union([z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }), z.object({ all: z.literal(true) })]));
  const conds = [eq(notifications.userId, u.id), eq(notifications.channel, "IN_APP"), isNull(notifications.readAt)];
  if ("ids" in b) conds.push(inArray(notifications.id, b.ids));
  const res = await db.update(notifications).set({ readAt: new Date() }).where(and(...conds)).returning({ id: notifications.id });
  return { updated: res.length };
});
