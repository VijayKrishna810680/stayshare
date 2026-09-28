import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { normalisePhone } from "@/lib/auth/users";
import { conflict } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";

/** PATCH {name, phone}: update my partner profile. */
export const PATCH = api(async (req) => {
  const u = await requireOwner();
  const body = await parseBody(req, z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().regex(/^\+?\d{10,13}$/, "Enter a valid mobile number").optional().or(z.literal("").transform(() => undefined)) }));
  const patch: Partial<typeof users.$inferInsert> = { name: body.name, updatedBy: u.id };
  if (body.phone) {
    const phone = normalisePhone(body.phone);
    if (phone !== u.phone) {
      const [dup] = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), ne(users.id, u.id)));
      if (dup) throw conflict("This mobile number is used by another account");
      Object.assign(patch, { phone, phoneVerifiedAt: null });
    }
  }
  await db.update(users).set(patch).where(eq(users.id, u.id));
  await audit({ actorId: u.id, action: "profile.update", entityType: "user", entityId: u.id, before: { name: u.name, phone: u.phone }, after: { name: patch.name, phone: patch.phone ?? u.phone }, ...reqMeta(req) });
  return { ok: true };
});
