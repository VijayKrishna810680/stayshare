import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { getActivePlan } from "@/services/pricing";
import { planToValues, savePricePlan } from "../../_lib/pricing";
import { logAudit } from "../../_lib/util";

/** Copy a room's active plan to all similar rooms (same property + category + sharing + AC). */
export const POST = api(async (req) => {
  const u = await requirePermission("pricing.manage");
  const { roomId, reason, targetRoomIds } = await parseBody(req, z.object({ roomId: z.string().uuid(), reason: z.string().trim().min(3).max(500), targetRoomIds: z.array(z.string().uuid()).optional() }));
  const [src] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!src) throw notFound("Room not found");
  const plan = await getActivePlan(roomId);
  if (!plan) throw badRequest("This room has no active price plan to copy");
  let targets = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.propertyId, src.propertyId), eq(rooms.category, src.category), eq(rooms.sharingCapacity, src.sharingCapacity), eq(rooms.isAC, src.isAC), ne(rooms.id, src.id), isNull(rooms.deletedAt)));
  if (targetRoomIds?.length) targets = targets.filter((t) => targetRoomIds.includes(t.id));
  if (!targets.length) throw badRequest("No similar rooms found in this property");
  const values = planToValues(plan);
  const done: string[] = [];
  const failed: { roomId: string; error: string }[] = [];
  for (const t of targets) {
    try {
      await savePricePlan(t.id, values, u.id, { reason: `${reason} (copied from room ${src.roomNumber})`, roomFlags: { allowBedBooking: src.allowBedBooking, allowEntireRoomBooking: src.allowEntireRoomBooking } });
      done.push(t.roomNumber);
    } catch (e) {
      failed.push({ roomId: t.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await logAudit(req, u, "price_plan.copy", "room", roomId, null, { to: done, failed, reason });
  return { copied: done.length, rooms: done, failed };
});
