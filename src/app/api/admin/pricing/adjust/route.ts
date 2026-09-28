import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pricePlans, properties, rooms } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest } from "@/lib/errors";
import { getActivePlan } from "@/services/pricing";
import { planToValues, savePricePlan, scalePlan } from "../../_lib/pricing";
import { logAudit } from "../../_lib/util";

/** Bulk percentage adjustment of base prices for every priced room in a property or city. */
export const POST = api(async (req) => {
  const u = await requirePermission("pricing.manage");
  const b = await parseBody(
    req,
    z.object({
      scope: z.enum(["PROPERTY", "CITY"]),
      scopeId: z.string().uuid(),
      percentBps: z.number().int().min(-9000).max(20000).refine((x) => x !== 0, "Enter a non-zero percentage"),
      includeExtras: z.boolean().default(false),
      reason: z.string().trim().min(3, "A reason is required").max(500),
    }),
  );
  const roomRows = await db
    .select({ id: rooms.id })
    .from(rooms)
    .innerJoin(properties, eq(properties.id, rooms.propertyId))
    .innerJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true)))
    .where(and(b.scope === "PROPERTY" ? eq(properties.id, b.scopeId) : eq(properties.cityId, b.scopeId), isNull(rooms.deletedAt)));
  const ids = [...new Set(roomRows.map((r) => r.id))];
  if (!ids.length) throw badRequest("No priced rooms found for this selection");
  let updated = 0;
  const failed: string[] = [];
  const all = await db.select({ id: rooms.id, roomNumber: rooms.roomNumber }).from(rooms).where(inArray(rooms.id, ids));
  for (const r of all) {
    const plan = await getActivePlan(r.id);
    if (!plan) continue;
    try {
      await savePricePlan(r.id, scalePlan(planToValues(plan), b.percentBps, b.includeExtras), u.id, { reason: `${b.reason} (bulk ${b.percentBps > 0 ? "+" : ""}${b.percentBps / 100}%)` });
      updated++;
    } catch (e) {
      failed.push(`${r.roomNumber}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await logAudit(req, u, "price_plan.bulk_adjust", b.scope.toLowerCase(), b.scopeId, null, { ...b, updated, failed });
  return { updated, failed };
});
