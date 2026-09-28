import "server-only";
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { roles, userRoles, users } from "@/db/schema";
import { one, pageArgs } from "./query";

/** Paginated users having a role, with search (name/email/phone) and status filter. */
export async function listUsersWithRole(role: string, sp: Record<string, string | string[] | undefined>, pageSize = 25) {
  const { page, offset } = pageArgs(sp, pageSize);
  const conds: SQL[] = [eq(roles.key, role), isNull(users.deletedAt)];
  const q = one(sp.q).trim();
  if (q) conds.push(or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.phone, `%${q.replace(/\D/g, "") || q}%`))!);
  if (one(sp.status)) conds.push(eq(users.status, one(sp.status) as "ACTIVE"));
  const where = and(...conds);
  const [rows, total] = await Promise.all([
    db.select({ u: users }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(where).orderBy(desc(users.createdAt)).limit(pageSize).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(where)
      .then((r) => r[0]?.n ?? 0),
  ]);
  return { rows: rows.map((r) => r.u), total, page, pageSize };
}

export const STATUS_OPTS = ["ACTIVE", "SUSPENDED", "PENDING_VERIFICATION"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() }));
