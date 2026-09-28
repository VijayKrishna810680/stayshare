import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { beds, rooms } from "@/db/schema";
import { badRequest } from "@/lib/errors";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { createBlock } from "@/services/availability";
import { logAudit } from "../_lib/util";

const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** POST — admin inventory block for a property / room / bed (end date exclusive). */
export const POST = api(async (req) => {
  const u = await requirePermission("properties.manage");
  const b = await parseBody(req, z.object({ propertyId: z.string().uuid(), roomId: z.string().uuid().nullable().optional(), bedId: z.string().uuid().nullable().optional(), startDate: d, endDate: d, note: z.string().max(500).nullable().optional(), reason: z.enum(["ADMIN_BLOCK", "MAINTENANCE", "OFFLINE_BOOKING"]).default("ADMIN_BLOCK") }));
  if (b.roomId) {
    const [r] = await db.select({ p: rooms.propertyId }).from(rooms).where(eq(rooms.id, b.roomId));
    if (r?.p !== b.propertyId) throw badRequest("That room does not belong to the selected property");
  }
  if (b.bedId) {
    const [x] = await db.select({ p: rooms.propertyId, roomId: rooms.id }).from(beds).innerJoin(rooms, eq(rooms.id, beds.roomId)).where(eq(beds.id, b.bedId));
    if (x?.p !== b.propertyId || (b.roomId && x.roomId !== b.roomId)) throw badRequest("That bed does not belong to the selected property/room");
  }
  const block = await createBlock({ propertyId: b.propertyId, roomId: b.roomId || null, bedId: b.bedId || null, startDate: b.startDate, endDate: b.endDate, reason: b.reason, note: b.note ?? undefined, createdBy: u.id });
  await logAudit(req, u, "inventory_block.create", "inventory_block", block.id, null, block);
  return block;
});
