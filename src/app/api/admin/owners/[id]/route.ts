import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ownerProfiles } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { forbidden, notFound } from "@/lib/errors";
import { defined, logAudit, recordPriceChanges } from "../../_lib/util";

/** PATCH owner commercial settings: canSetFinalPrice (pricing), settlement cycle & payout hold (payouts). */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const b = await parseBody(req, z.object({ canSetFinalPrice: z.boolean().optional(), settlementCycleDays: z.number().int().min(1).max(90).optional(), payoutHold: z.boolean().optional() }));
  const u = await requirePermission(...(b.canSetFinalPrice !== undefined ? (["pricing.manage", "users.manage"] as const) : (["payouts.manage"] as const)));
  if (b.canSetFinalPrice !== undefined && (b.settlementCycleDays !== undefined || b.payoutHold !== undefined) && !u.has("payouts.manage")) throw forbidden();
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, params.id));
  if (!op) throw notFound("Owner not found");
  const patch = defined(b);
  const [row] = await db.update(ownerProfiles).set(patch).where(eq(ownerProfiles.id, op.id)).returning();
  if (b.canSetFinalPrice !== undefined) await recordPriceChanges({ entityType: "OWNER", entityId: params.id, before: op, after: patch, fields: ["canSetFinalPrice"], changedBy: u.id, reason: "Owner pricing permission changed" });
  await logAudit(req, u, "owner.update", "owner", params.id, { canSetFinalPrice: op.canSetFinalPrice, settlementCycleDays: op.settlementCycleDays, payoutHold: op.payoutHold }, patch);
  return row;
});
