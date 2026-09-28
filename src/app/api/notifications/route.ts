import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { api, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";

/** In-app notifications (newest first) with unread count. */
export const GET = api(async (req) => {
  const u = await requireUser();
  const { page, unread } = parseQuery(req, z.object({ page: z.coerce.number().int().min(1).default(1), unread: z.enum(["1"]).optional() }));
  const conds = [eq(notifications.userId, u.id), eq(notifications.channel, "IN_APP")];
  if (unread) conds.push(isNull(notifications.readAt));
  const size = 20;
  const [items, unreadRows, totalRows] = await Promise.all([
    db.select({ id: notifications.id, title: notifications.title, body: notifications.body, template: notifications.template, data: notifications.data, readAt: notifications.readAt, createdAt: notifications.createdAt }).from(notifications).where(and(...conds)).orderBy(desc(notifications.createdAt)).limit(size).offset((page - 1) * size),
    db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, u.id), eq(notifications.channel, "IN_APP"), isNull(notifications.readAt))),
    db.select({ total: count() }).from(notifications).where(and(...conds)),
  ]);
  return { items, unread: Number(unreadRows[0]?.n ?? 0), total: Number(totalRows[0]?.total ?? 0), page, pageSize: size };
});
