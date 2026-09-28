import { z } from "zod";
import { db } from "@/db";
import { beds } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { ownerRoom, requireOwner } from "@/lib/owner-access";
import { nextBedNumbers, syncRoomBedCount } from "@/lib/owner-helpers";

/** POST {count, bedType, availableFrom}: add beds to a room. */
export const POST = api<{ roomId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { room, property } = await ownerRoom(u, params.roomId);
  const body = await parseBody(
    req,
    z.object({
      count: z.number().int().min(1).max(12).default(1),
      bedType: z.enum(["SINGLE", "BUNK_UPPER", "BUNK_LOWER", "DOUBLE", "QUEEN"]).default("SINGLE"),
      availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    }),
  );
  if (room.totalBeds + body.count > 24) throw badRequest("A room can have at most 24 beds");
  const nums = await nextBedNumbers(room.id, property.code, room.roomNumber, body.count);
  const rows = await db
    .insert(beds)
    .values(nums.map((n) => ({ roomId: room.id, bedNumber: n.bedNumber, code: n.code, bedType: body.bedType, availableFrom: body.availableFrom ?? null })))
    .returning();
  await syncRoomBedCount(room.id);
  await audit({ actorId: u.id, action: "bed.create", entityType: "room", entityId: room.id, after: { beds: rows.map((r) => r.code) }, ...reqMeta(req) });
  return rows;
});
