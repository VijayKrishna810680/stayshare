import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";

/** POST {ids?: string[], all?: boolean}: mark my in-app notifications as read. */
export const POST = api(async (req) => {
  const u = await requireUser();
  const body = await parseBody(req, z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() }));
  const conds = [eq(notifications.userId, u.id), eq(notifications.channel, "IN_APP"), isNull(notifications.readAt)];
  if (!body.all) {
    if (!body.ids?.length) return { updated: 0 };
    conds.push(inArray(notifications.id, body.ids));
  }
  const res = await db.update(notifications).set({ readAt: new Date() }).where(and(...conds)).returning({ id: notifications.id });
  return { updated: res.length };
});
