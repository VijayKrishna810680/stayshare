import { api } from "@/lib/api";
import { requireStaffOrOwner, staffBooking } from "@/lib/owner-access";
import { bookingDetail } from "@/services/owner-reports";
import { freeBedsForStay } from "@/services/owner-reports";

/** GET: booking for the front desk (no owner earnings) + free beds for re-assignment at check-in. */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireStaffOrOwner();
  const { booking } = await staffBooking(u, params.id);
  const detail = await bookingDetail(booking.id);
  const freeBeds = ["CONFIRMED", "CHECK_IN_PENDING"].includes(booking.status) && booking.unit === "BED" ? await freeBedsForStay(booking) : [];
  return { ...detail, freeBeds };
});
