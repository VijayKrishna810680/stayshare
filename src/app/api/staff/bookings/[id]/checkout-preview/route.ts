import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requireStaffOrOwner, staffBooking } from "@/lib/owner-access";
import { checkoutPreview } from "@/services/stay";

const schema = z.object({
  damageCharges: z.number().int().min(0).max(100_000_000).default(0),
  extraCharges: z.array(z.object({ description: z.string().trim().min(1).max(120), amount: z.number().int().min(0).max(100_000_000) })).max(30).default([]),
});

/** POST: live settlement preview — deposit refund / amount due. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireStaffOrOwner();
  const { booking } = await staffBooking(u, params.id);
  const body = await parseBody(req, schema);
  return checkoutPreview(booking, body);
});
