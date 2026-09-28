import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { properties, staffAssignments, staffProfiles, users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { createUserAccount } from "@/lib/auth/users";
import { badRequest } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";
import { staffCreateSchema } from "@/components/owner/schemas";

export const GET = api(async () => {
  const u = await requireOwner();
  return db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, status: users.status, designation: staffProfiles.designation, active: staffProfiles.active })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .where(eq(staffProfiles.employerId, u.id));
});

/** POST: create a front-desk staff login for my properties. */
export const POST = api(async (req) => {
  const u = await requireOwner();
  const body = await parseBody(req, staffCreateSchema);
  const ids = [...new Set(body.propertyIds)];
  if (ids.length) {
    const own = await db.select({ id: properties.id }).from(properties).where(and(inArray(properties.id, ids), eq(properties.ownerId, u.id), isNull(properties.deletedAt)));
    if (own.length !== ids.length) throw badRequest("You can only assign staff to your own properties");
  }
  const staff = await createUserAccount({ name: body.name, email: body.email, phone: body.phone, password: body.password, role: "STAFF", createdBy: u.id });
  await db.insert(staffProfiles).values({ userId: staff.id, employerId: u.id, designation: body.designation ?? null });
  if (ids.length) await db.insert(staffAssignments).values(ids.map((propertyId) => ({ userId: staff.id, propertyId }))).onConflictDoNothing();
  await audit({ actorId: u.id, action: "staff.create", entityType: "user", entityId: staff.id, after: { name: staff.name, email: staff.email, phone: staff.phone, properties: ids }, ...reqMeta(req) });
  return { id: staff.id };
});
