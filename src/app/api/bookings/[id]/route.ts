import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { getBookingDetail } from "@/lib/site/bookings";

/** Booking details for its customer: guests, payments, refunds, modifications, history, invoice meta. */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return getBookingDetail(params.id, u.id);
});
