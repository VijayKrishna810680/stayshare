import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { refreshStartingPrice } from "@/services/pricing";
import { defined, logAudit } from "../../_lib/util";

const schema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  active: z.boolean().optional(),
  maintenanceStatus: z.enum(["OK", "UNDER_MAINTENANCE"]).optional(),
  cleaningStatus: z.enum(["CLEAN", "NEEDS_CLEANING", "IN_PROGRESS"]).optional(),
  maxOccupancy: z.number().int().min(1).max(50).optional(),
  genderEligibility: z.enum(["MALE_ONLY", "FEMALE_ONLY", "MIXED", "FAMILY", "ANY"]).optional(),
  allowBedBooking: z.boolean().optional(),
  allowEntireRoomBooking: z.boolean().optional(),
  description: z.string().max(2000).nullable().optional(),
});

/** PATCH room status / key fields. */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.manage");
  const b = defined(await parseBody(req, schema));
  if (!Object.keys(b).length) throw badRequest("Nothing to update");
  const [before] = await db.select().from(rooms).where(eq(rooms.id, params.id));
  if (!before) throw notFound("Room not found");
  if ((b.allowBedBooking ?? before.allowBedBooking) === false && (b.allowEntireRoomBooking ?? before.allowEntireRoomBooking) === false) throw badRequest("A room must allow bed booking or entire-room booking");
  const [after] = await db.update(rooms).set({ ...b, updatedBy: u.id }).where(eq(rooms.id, params.id)).returning();
  await refreshStartingPrice(before.propertyId);
  await logAudit(req, u, "room.update", "room", params.id, Object.fromEntries(Object.keys(b).map((k) => [k, before[k as keyof typeof before]])), b);
  return after;
});
