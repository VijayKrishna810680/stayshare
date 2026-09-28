import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { getOwnedBookingRow } from "@/lib/site/bookings";
import { createInvoice, latestInvoice, renderInvoicePdf } from "@/services/invoice";

const INVOICEABLE = ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT", "COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "REFUND_PENDING", "CANCELLED", "NO_SHOW"];

/** Download the latest GST invoice (PDF). Issues one on first request for confirmed bookings. */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  const b = await getOwnedBookingRow(params.id, u.id);
  let inv = await latestInvoice(b.id);
  if (!inv) {
    if (!INVOICEABLE.includes(b.status) || (b.paidAmount === 0 && !b.payAtProperty)) throw notFound("An invoice is issued once your booking is confirmed");
    inv = await createInvoice(b.id, "BOOKING");
  }
  const pdf = await renderInvoicePdf(inv);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="StayShare-${inv.invoiceNumber.replace(/[^\w-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
