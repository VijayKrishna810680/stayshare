import { z } from "zod";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaffOrOwner, staffBooking } from "@/lib/owner-access";
import { checkOut } from "@/services/stay";
import { latestInvoice } from "@/services/invoice";

const schema = z.object({
  inspection: z.object({ keysReturned: z.boolean(), roomCondition: z.enum(["GOOD", "FAIR", "DAMAGED"]), damages: z.string().trim().max(1000).optional(), checklist: z.record(z.boolean()).optional() }),
  damageCharges: z.number().int().min(0).max(100_000_000).default(0),
  extraCharges: z.array(z.object({ description: z.string().trim().min(1).max(120), amount: z.number().int().min(1).max(100_000_000) })).max(30).default([]),
  cashCollected: z.number().int().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
});

/** POST: check the guest out, settle charges against the deposit and trigger the deposit refund + final invoice. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requireStaffOrOwner();
  const { booking } = await staffBooking(u, params.id);
  const body = await parseBody(req, schema);
  const calc = await checkOut(booking.id, u.id, body);
  const inv = await latestInvoice(booking.id).catch(() => null);
  await audit({ actorId: u.id, action: "booking.check_out", entityType: "booking", entityId: booking.id, before: { status: booking.status }, after: { ...calc, cashCollected: body.cashCollected, inspection: body.inspection }, ...reqMeta(req) });
  return { ...calc, cashCollected: body.cashCollected, invoiceNumber: inv?.invoiceNumber ?? null };
});
