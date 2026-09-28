import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { retryBookingPayment } from "@/services/booking";

/** Retry payment for a booking whose inventory hold is still valid. */
export const POST = api<{ id: string }>(
  async (_req, { params }) => {
    const u = await requireUser();
    return retryBookingPayment(params.id, { id: u.id, name: u.name, email: u.email, phone: u.phone });
  },
  { rateLimit: { limit: 10, windowSec: 300 } },
);
