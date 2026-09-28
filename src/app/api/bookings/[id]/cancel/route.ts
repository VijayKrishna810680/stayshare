import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { getOwnedBookingRow } from "@/lib/site/bookings";
import { cancelBooking, cancellationPreview, PENDING_STATUSES } from "@/services/booking";

const CANCELLABLE = [...PENDING_STATUSES, "CONFIRMED", "CHECK_IN_PENDING"];

/** GET: refund preview under the booking's cancellation policy snapshot. */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const b = await getOwnedBookingRow(params.id, u.id);
  const calc = cancellationPreview(b);
  return { cancellable: CANCELLABLE.includes(b.status), status: b.status, paidAmount: b.paidAmount, nonRefundable: b.nonRefundable, policy: b.cancellationPolicy, ...calc };
});

/** POST {reason}: cancel and start the refund automatically. */
export const POST = api<{ id: string }>(
  async (req, { params }) => {
    const u = await requireUser();
    const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(3, "Tell us why you're cancelling").max(500) }));
    await getOwnedBookingRow(params.id, u.id);
    return cancelBooking(params.id, { id: u.id, role: "CUSTOMER" }, reason);
  },
  { rateLimit: { limit: 10, windowSec: 300 } },
);
