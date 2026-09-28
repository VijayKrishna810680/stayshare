import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, refunds } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { decideRefund, processRefund } from "@/services/booking";
import { logAudit } from "../../_lib/util";

const schema = z.object({ action: z.enum(["approve", "reject", "retry"]), amount: z.number().int().min(1).nullable().optional(), notes: z.string().trim().max(1000).nullable().optional() });

/** POST {action: approve|reject|retry, amount (paise), notes} */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("refunds.approve");
  const b = await parseBody(req, schema);
  const [r] = await db.select().from(refunds).where(eq(refunds.id, params.id));
  if (!r) throw notFound("Refund not found");
  if (b.action === "retry") {
    await processRefund(r.id, u.id);
  } else {
    if (b.action === "reject" && (!b.notes || b.notes.length < 3)) throw badRequest("Add a reason for rejecting the refund");
    if (b.action === "approve" && b.amount) {
      const [bk] = await db.select({ paid: bookings.paidAmount, refunded: bookings.refundedAmount }).from(bookings).where(eq(bookings.id, r.bookingId));
      const max = (bk?.paid ?? 0) - (bk?.refunded ?? 0);
      if (b.amount > max) throw badRequest(`Refund cannot exceed the refundable balance of ${formatINR(max)}`);
    }
    await decideRefund(r.id, u.id, b.action === "approve", b.notes ?? undefined, b.amount ?? undefined);
  }
  const [after] = await db.select().from(refunds).where(eq(refunds.id, r.id));
  await logAudit(req, u, `refund.${b.action}`, "refund", r.id, r, after);
  return after;
});
