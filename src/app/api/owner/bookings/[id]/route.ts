import { api } from "@/lib/api";
import { ownerBooking, requireOwner } from "@/lib/owner-access";
import { bookingDetail } from "@/services/owner-reports";

/** GET: booking details for the owner's drawer (guest phones masked until check-in). */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireOwner();
  const { booking } = await ownerBooking(u, params.id);
  return bookingDetail(booking.id, { includeFinance: true });
});
