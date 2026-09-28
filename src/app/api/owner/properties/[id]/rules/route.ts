import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { propertyRules } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";

/** PUT {rules: string[]}: replace house rules (order preserved). */
export const PUT = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const { rules } = await parseBody(req, z.object({ rules: z.array(z.string().trim().min(2).max(300)).max(40) }));
  await db.transaction(async (tx) => {
    await tx.delete(propertyRules).where(eq(propertyRules.propertyId, p.id));
    if (rules.length) await tx.insert(propertyRules).values(rules.map((text, i) => ({ propertyId: p.id, text, sortOrder: i })));
  });
  await audit({ actorId: u.id, action: "property.rules", entityType: "property", entityId: p.id, after: { rules }, ...reqMeta(req) });
  return { ok: true };
});
