import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { properties, sessions, staffAssignments, staffProfiles, users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword, PASSWORD_RULE, PASSWORD_HINT } from "@/lib/auth/password";
import { badRequest, notFound } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";

/** PATCH {active?, designation?, propertyIds?, password?}: manage one of my staff accounts. */
export const PATCH = api<{ userId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const [sp] = await db.select().from(staffProfiles).where(and(eq(staffProfiles.userId, params.userId), eq(staffProfiles.employerId, u.id)));
  if (!sp) throw notFound("Staff member not found");
  const body = await parseBody(
    req,
    z.object({
      active: z.boolean().optional(),
      designation: z.string().trim().max(60).nullable().optional(),
      propertyIds: z.array(z.string().uuid()).max(100).optional(),
      password: z.string().regex(PASSWORD_RULE, PASSWORD_HINT).optional(),
    }),
  );
  if (body.designation !== undefined || body.active !== undefined) {
    await db.update(staffProfiles).set({ designation: body.designation === undefined ? sp.designation : body.designation, active: body.active ?? sp.active }).where(eq(staffProfiles.id, sp.id));
  }
  if (body.active !== undefined) {
    await db.update(users).set({ status: body.active ? "ACTIVE" : "SUSPENDED", updatedBy: u.id }).where(eq(users.id, sp.userId));
    if (!body.active) await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, sp.userId), isNull(sessions.revokedAt)));
  }
  if (body.password) {
    await db.update(users).set({ passwordHash: await hashPassword(body.password), updatedBy: u.id }).where(eq(users.id, sp.userId));
    await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, sp.userId), isNull(sessions.revokedAt)));
  }
  if (body.propertyIds) {
    const ids = [...new Set(body.propertyIds)];
    const mine = await db.select({ id: properties.id }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt)));
    const mineIds = mine.map((m) => m.id);
    if (ids.some((i) => !mineIds.includes(i))) throw badRequest("You can only assign staff to your own properties");
    if (mineIds.length) await db.delete(staffAssignments).where(and(eq(staffAssignments.userId, sp.userId), inArray(staffAssignments.propertyId, mineIds)));
    if (ids.length) await db.insert(staffAssignments).values(ids.map((propertyId) => ({ userId: sp.userId, propertyId }))).onConflictDoNothing();
  }
  await audit({ actorId: u.id, action: "staff.update", entityType: "user", entityId: sp.userId, after: { ...body, password: body.password ? "changed" : undefined }, ...reqMeta(req) });
  return { ok: true };
});
