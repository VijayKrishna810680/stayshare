import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { inventoryBlocks, rooms } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { todayIST } from "@/lib/dates";
import { requireStaffOrOwner, staffRoom } from "@/lib/owner-access";
import { createBlock, releaseBlock } from "@/services/availability";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * POST {status: UNDER_MAINTENANCE, startDate, endDate, note} → blocks the room's beds for those dates and
 * stops new bookings; POST {status: OK} → releases open maintenance blocks and reopens the room.
 */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireStaffOrOwner();
  const { room } = await staffRoom(u, params.id);
  const body = await parseBody(req, z.object({ status: z.enum(["OK", "UNDER_MAINTENANCE"]), startDate: date.optional(), endDate: date.optional(), note: z.string().trim().max(300).optional() }));
  if (body.status === "UNDER_MAINTENANCE") {
    let blockId: string | null = null;
    if (body.startDate && body.endDate) {
      if (body.endDate <= body.startDate) throw badRequest("End date must be after start date");
      const block = await createBlock({ propertyId: room.propertyId, roomId: room.id, startDate: body.startDate, endDate: body.endDate, reason: "MAINTENANCE", note: body.note, createdBy: u.id });
      blockId = block.id;
    }
    await db.update(rooms).set({ maintenanceStatus: "UNDER_MAINTENANCE", updatedBy: u.id }).where(eq(rooms.id, room.id));
    await audit({ actorId: u.id, action: "room.maintenance_on", entityType: "room", entityId: room.id, after: { ...body, blockId }, ...reqMeta(req) });
    return { ok: true, blockId };
  }
  const open = await db.select().from(inventoryBlocks).where(and(eq(inventoryBlocks.roomId, room.id), eq(inventoryBlocks.reason, "MAINTENANCE"), isNull(inventoryBlocks.releasedAt), gt(inventoryBlocks.endDate, todayIST())));
  for (const b of open) await releaseBlock(b.id);
  await db.update(rooms).set({ maintenanceStatus: "OK", updatedBy: u.id }).where(eq(rooms.id, room.id));
  await audit({ actorId: u.id, action: "room.maintenance_off", entityType: "room", entityId: room.id, after: { releasedBlocks: open.length }, ...reqMeta(req) });
  return { ok: true, releasedBlocks: open.length };
});
