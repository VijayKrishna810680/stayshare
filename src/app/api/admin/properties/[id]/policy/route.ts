import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cancellationPolicies, properties } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { logAudit } from "../../../_lib/util";

/** POST {cancellationPolicyId} — assign a cancellation policy to a property. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("policies.manage", "properties.manage");
  const { cancellationPolicyId } = await parseBody(req, z.object({ cancellationPolicyId: z.string().uuid().nullable() }));
  const [p] = await db.select({ id: properties.id, cancellationPolicyId: properties.cancellationPolicyId }).from(properties).where(eq(properties.id, params.id));
  if (!p) throw notFound("Property not found");
  if (cancellationPolicyId) {
    const [pol] = await db.select().from(cancellationPolicies).where(eq(cancellationPolicies.id, cancellationPolicyId));
    if (!pol || !pol.active) throw badRequest("Choose an active policy");
  }
  await db.update(properties).set({ cancellationPolicyId, updatedBy: u.id }).where(eq(properties.id, p.id));
  await logAudit(req, u, "property.policy_assign", "property", p.id, { cancellationPolicyId: p.cancellationPolicyId }, { cancellationPolicyId });
  return { ok: true };
});
