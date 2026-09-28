import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pricePlans } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest } from "@/lib/errors";
import { getActivePlan } from "@/services/pricing";
import { planSchema, savePricePlan } from "../../../_lib/pricing";
import { logAudit } from "../../../_lib/util";

/** GET the active plan + previous plans for a room. */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  await requirePermission("pricing.manage", "properties.approve");
  const active = await getActivePlan(params.id);
  const history = await db.select().from(pricePlans).where(eq(pricePlans.roomId, params.id)).orderBy(desc(pricePlans.createdAt)).limit(50);
  return { active, history };
});

const body = planSchema.extend({
  reason: z.string().trim().min(3, "A reason is required for every price change").max(500),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  allowBedBooking: z.boolean().optional(),
  allowEntireRoomBooking: z.boolean().optional(),
});

/** POST — admin enters the final customer-facing prices for a room (creates a new active plan). */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("pricing.manage");
  const { reason, effectiveFrom, effectiveTo, allowBedBooking, allowEntireRoomBooking, ...plan } = await parseBody(req, body);
  const from = effectiveFrom ? new Date(`${effectiveFrom}T00:00:00+05:30`) : new Date();
  const to = effectiveTo ? new Date(`${effectiveTo}T23:59:59+05:30`) : null;
  if (to && to <= from) throw badRequest("Effective-to must be after effective-from");
  const res = await savePricePlan(params.id, plan, u.id, { reason, effectiveFrom: from > new Date() ? from : new Date(), effectiveTo: to, roomFlags: { allowBedBooking, allowEntireRoomBooking } });
  await logAudit(req, u, "price_plan.create", "room", params.id, { previousPlanId: res.previousPlanId }, { planId: res.plan.id, reason, ...plan });
  return res;
});
