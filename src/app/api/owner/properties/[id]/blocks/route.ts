import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { beds, rooms } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { createBlock } from "@/services/availability";
import { nightsBetween } from "@/lib/dates";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

/** POST: block dates (owner block, maintenance or an offline/walk-in booking). */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const p = await assertOwnsProperty(u, params.id);
  const body = await parseBody(
    req,
    z.object({
      roomId: z.string().uuid().optional().nullable(),
      bedId: z.string().uuid().optional().nullable(),
      startDate: date,
      endDate: date,
      reason: z.enum(["OWNER_BLOCK", "MAINTENANCE", "OFFLINE_BOOKING"]),
      note: z.string().trim().max(300).optional(),
    }),
  );
  if (body.endDate <= body.startDate) throw badRequest("End date must be after start date");
  if (nightsBetween(body.startDate, body.endDate) > 366) throw badRequest("Blocks can span at most one year");
  if (body.roomId) {
    const [r] = await db.select().from(rooms).where(and(eq(rooms.id, body.roomId), isNull(rooms.deletedAt)));
    if (!r || r.propertyId !== p.id) throw badRequest("Room does not belong to this property");
  }
  if (body.bedId) {
    const [b] = await db.select({ roomId: beds.roomId }).from(beds).where(eq(beds.id, body.bedId));
    const [r] = b ? await db.select().from(rooms).where(eq(rooms.id, b.roomId)) : [];
    if (!r || r.propertyId !== p.id) throw badRequest("Bed does not belong to this property");
  }
  const block = await createBlock({ propertyId: p.id, roomId: body.roomId ?? null, bedId: body.bedId ?? null, startDate: body.startDate, endDate: body.endDate, reason: body.reason, note: body.note, createdBy: u.id });
  await audit({ actorId: u.id, action: "inventory.block", entityType: "property", entityId: p.id, after: block, ...reqMeta(req) });
  return block;
});
