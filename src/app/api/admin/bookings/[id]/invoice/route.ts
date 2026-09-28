import { api } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";
import { latestInvoice, renderInvoicePdf } from "@/services/invoice";

/** GET — latest invoice PDF for a booking. */
export const GET = api<{ id: string }>(async (_req, { params }) => {
  await requirePermission("bookings.view", "payments.view");
  const inv = await latestInvoice(params.id);
  if (!inv) throw notFound("No invoice has been issued for this booking yet");
  const pdf = await renderInvoicePdf(inv);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.invoiceNumber.replace(/\//g, "-")}.pdf"`, "Cache-Control": "private, no-store" } });
});
