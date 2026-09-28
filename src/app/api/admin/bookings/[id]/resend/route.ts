import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, properties, users } from "@/db/schema";
import { api } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { prettyDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { badRequest, notFound } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { notify } from "@/services/notifications";
import { logAudit } from "../../../_lib/util";

/** POST — resend the booking confirmation on all active channels. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("bookings.manage");
  const [row] = await db.select({ b: bookings, name: users.name, prop: properties.name }).from(bookings).innerJoin(users, eq(users.id, bookings.customerId)).innerJoin(properties, eq(properties.id, bookings.propertyId)).where(eq(bookings.id, params.id));
  if (!row) throw notFound("Booking not found");
  if (!["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN"].includes(row.b.status)) throw badRequest("Only confirmed bookings have a confirmation to resend");
  await notify("booking.confirmed", {
    userId: row.b.customerId,
    vars: { name: row.name, bookingNumber: row.b.bookingNumber, propertyName: row.prop, checkIn: prettyDate(row.b.checkIn), checkOut: prettyDate(row.b.checkOut), amount: formatINR(row.b.totalAmount), link: `${env.appUrl}/account/bookings/${row.b.id}` },
    data: { bookingId: row.b.id },
  });
  await logAudit(req, u, "booking.resend_confirmation", "booking", row.b.id);
  return { ok: true };
});
