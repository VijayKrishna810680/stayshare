import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { cancelBooking, cancellationPreview } from "@/services/booking";
import { logAudit } from "../../../_lib/util";

/** GET ?overrideBps= — refund preview for an admin cancellation. */
export const GET = api<{ id: string }>(async (req, { params }) => {
  await requirePermission("bookings.manage");
  const [b] = await db.select().from(bookings).where(eq(bookings.id, params.id));
  if (!b) throw notFound("Booking not found");
  const o = req.nextUrl.searchParams.get("overrideBps");
  const override = o === null || o === "" ? null : Math.max(0, Math.min(10000, Math.round(Number(o))));
  return { policy: cancellationPreview(b), preview: cancellationPreview(b, override), paidAmount: b.paidAmount, status: b.status };
});

const schema = z.object({ reason: z.string().trim().min(3, "Give a cancellation reason").max(500), overrideRefundBps: z.number().int().min(0).max(10000).nullable().optional(), adminNotes: z.string().max(1000).nullable().optional() });

/** POST — cancel as ADMIN, optionally overriding the refund percentage. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("bookings.manage");
  const b = await parseBody(req, schema);
  const [before] = await db.select({ status: bookings.status, paidAmount: bookings.paidAmount }).from(bookings).where(eq(bookings.id, params.id));
  if (!before) throw notFound("Booking not found");
  const calc = await cancelBooking(params.id, { id: u.id, role: "ADMIN" }, b.reason, { overrideRefundBps: b.overrideRefundBps ?? null, adminNotes: b.adminNotes ?? undefined });
  await logAudit(req, u, "booking.admin_cancel", "booking", params.id, before, { ...b, refund: calc.totalRefund, refundBps: calc.refundBps });
  return calc;
});
