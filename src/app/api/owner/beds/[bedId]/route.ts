import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { beds } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { conflict } from "@/lib/errors";
import { ownerBed, requireOwner } from "@/lib/owner-access";
import { bedsHaveFutureBookings, syncRoomBedCount } from "@/lib/owner-helpers";

/** PATCH {bedType?, availableFrom?, active?}: edit or (de)activate a bed. */
export const PATCH = api<{ bedId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { bed, room } = await ownerBed(u, params.bedId);
  const body = await parseBody(
    req,
    z.object({
      bedType: z.enum(["SINGLE", "BUNK_UPPER", "BUNK_LOWER", "DOUBLE", "QUEEN"]).optional(),
      availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      active: z.boolean().optional(),
    }),
  );
  if (body.active === false && bed.active) {
    if (bed.status === "OCCUPIED") throw conflict("This bed is occupied right now");
    if (await bedsHaveFutureBookings([bed.id])) throw conflict("This bed has upcoming bookings. Move those guests before deactivating it.");
  }
  const [upd] = await db.update(beds).set(body).where(eq(beds.id, bed.id)).returning();
  if (body.active !== undefined) await syncRoomBedCount(room.id);
  await audit({ actorId: u.id, action: "bed.update", entityType: "bed", entityId: bed.id, before: { bedType: bed.bedType, availableFrom: bed.availableFrom, active: bed.active }, after: body, ...reqMeta(req) });
  return upd;
});

/** DELETE: remove a bed (soft delete). Not allowed with future bookings. */
export const DELETE = api<{ bedId: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { bed, room } = await ownerBed(u, params.bedId);
  if (bed.status === "OCCUPIED") throw conflict("This bed is occupied right now");
  if (await bedsHaveFutureBookings([bed.id])) throw conflict("This bed has upcoming bookings and can't be removed");
  await db.update(beds).set({ active: false, deletedAt: new Date() }).where(eq(beds.id, bed.id));
  await syncRoomBedCount(room.id);
  await audit({ actorId: u.id, action: "bed.delete", entityType: "bed", entityId: bed.id, before: { code: bed.code }, ...reqMeta(req) });
  return { ok: true };
});
