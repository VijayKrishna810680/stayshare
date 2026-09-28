import { api } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireStaffOrOwner, staffBooking } from "@/lib/owner-access";
import { latestInvoice, renderInvoicePdf } from "@/services/invoice";

/** GET: latest invoice PDF for a booking at my property (owner or assigned staff). */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  const u = await requireStaffOrOwner();
  const { booking } = await staffBooking(u, params.id);
  const inv = await latestInvoice(booking.id);
  if (!inv) throw notFound("No invoice has been issued for this booking yet");
  const pdf = await renderInvoicePdf(inv);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.invoiceNumber.replace(/\//g, "-")}.pdf"`, "Cache-Control": "private, no-store" } });
});
