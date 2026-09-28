import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { availabilityCalendars, beds, bookings } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { conflict } from "@/lib/errors";
import { todayIST } from "@/lib/dates";
import { requireStaffOrOwner, staffBed } from "@/lib/owner-access";
import { markBedClean } from "@/services/stay";

/**
 * POST {action}: housekeeping on a bed.
 *  clean      → CLEANING/other → AVAILABLE (markBedClean)
 *  cleaning   → mark as needing cleaning
 *  occupied   → manual occupied (only when no booking holds the bed tonight)
 *  available  → manual available (only when no checked-in guest is on it)
 */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireStaffOrOwner();
  const { bed } = await staffBed(u, params.id);
  const { action } = await parseBody(req, z.object({ action: z.enum(["clean", "cleaning", "occupied", "available"]) }));
  if (action === "clean") await markBedClean(bed.id);
  else if (action === "cleaning") {
    if (bed.status === "OCCUPIED") throw conflict("Bed is occupied");
    await db.update(beds).set({ status: "CLEANING" }).where(eq(beds.id, bed.id));
  } else if (action === "occupied") {
    const [row] = await db.select().from(availabilityCalendars).where(and(eq(availabilityCalendars.bedId, bed.id), eq(availabilityCalendars.night, todayIST())));
    if (row) throw conflict(row.status === "BLOCKED" ? "This bed is blocked tonight" : "This bed is booked tonight — check the guest in instead");
    await db.update(beds).set({ status: "OCCUPIED" }).where(eq(beds.id, bed.id));
  } else {
    if (bed.currentBookingId) {
      const [b] = await db.select({ status: bookings.status }).from(bookings).where(and(eq(bookings.id, bed.currentBookingId), inArray(bookings.status, ["CHECKED_IN"])));
      if (b) throw conflict("A checked-in guest is on this bed — check them out first");
    }
    await db.update(beds).set({ status: "AVAILABLE", currentBookingId: null, currentCustomerId: null }).where(eq(beds.id, bed.id));
  }
  await audit({ actorId: u.id, action: `bed.${action}`, entityType: "bed", entityId: bed.id, before: { status: bed.status }, ...reqMeta(req) });
  return { ok: true };
});
