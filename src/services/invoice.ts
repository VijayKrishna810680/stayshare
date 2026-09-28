import "server-only";
import { desc, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { bookingGuests, bookingServices, bookings, cities, invoices, ownerProfiles, payments, properties, rooms, users } from "@/db/schema";
import { nextInvoiceNumber } from "@/lib/counters";
import { notFound } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { formatINRAscii } from "@/lib/money";
import { prettyDate } from "@/lib/dates";

type InvoiceData = {
  platform: { name: string; legalName: string; gstin: string; address: string; email: string; phone: string };
  property: { name: string; code: string; address: string; gstin: string | null };
  customer: { name: string; email: string | null; phone: string | null };
  booking: { number: string; checkIn: string; checkOut: string; nights: number; unit: string; room: string; guests: number };
  lines: { label: string; amount: number; kind: string }[];
  extras: { label: string; amount: number }[];
  subtotal: number;
  taxAmount: number;
  total: number;
  deposit: number;
  paid: number;
  refunded: number;
  balanceDue: number;
  payments: { mode: string; txnId: string | null; amount: number; date: string | null }[];
  sac: string;
};

/** Snapshot every figure at issue time so later price changes never alter a GST invoice. */
export async function createInvoice(bookingId: string, kind: "BOOKING" | "FINAL" = "BOOKING") {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw notFound("Booking not found");
  const [p] = await db.select().from(properties).where(eq(properties.id, b.propertyId));
  const [r] = await db.select().from(rooms).where(eq(rooms.id, b.roomId));
  const [c] = await db.select().from(cities).where(eq(cities.id, p!.cityId));
  const [u] = await db.select().from(users).where(eq(users.id, b.customerId));
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, p!.ownerId));
  const guests = await db.select().from(bookingGuests).where(eq(bookingGuests.bookingId, b.id));
  const services = await db.select().from(bookingServices).where(eq(bookingServices.bookingId, b.id));
  const pays = await db.select().from(payments).where(eq(payments.bookingId, b.id));
  const s = await getSettings(["platform.name", "platform.legalName", "platform.gstin", "platform.address", "platform.supportEmail", "platform.supportPhone"]);
  const bd = (b.priceBreakdown ?? { lines: [] }) as { lines: { label: string; amount: number; kind: string }[] };
  const extras = services.filter((x) => x.atCheckout).map((x) => ({ label: x.description, amount: x.amount }));
  const extrasTotal = extras.reduce((a, x) => a + x.amount, 0);
  const captured = pays.filter((x) => ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(x.status));
  const data: InvoiceData = {
    platform: { name: s["platform.name"], legalName: s["platform.legalName"], gstin: s["platform.gstin"], address: s["platform.address"], email: s["platform.supportEmail"], phone: s["platform.supportPhone"] },
    property: { name: p!.name, code: p!.code, address: `${p!.addressLine}, ${c?.name ?? ""}, ${p!.state} ${p!.postalCode}`, gstin: op?.gstin ?? null },
    customer: { name: u?.name ?? guests[0]?.name ?? "Guest", email: u?.email ?? null, phone: u?.phone ?? null },
    booking: { number: b.bookingNumber, checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights, unit: b.unit === "BED" ? `${b.bedsCount} bed(s)` : "Entire room", room: `${r?.roomNumber ?? ""} ${r?.name ?? ""}`.trim(), guests: b.adults + b.children },
    lines: bd.lines,
    extras,
    subtotal: b.totalAmount - b.taxAmount - b.securityDeposit + extrasTotal,
    taxAmount: b.taxAmount,
    total: b.totalAmount + extrasTotal,
    deposit: b.securityDeposit,
    paid: b.paidAmount,
    refunded: b.refundedAmount,
    balanceDue: Math.max(0, b.totalAmount + extrasTotal - b.paidAmount),
    payments: captured.map((x) => ({ mode: x.method, txnId: x.providerPaymentId, amount: x.amount, date: x.capturedAt?.toISOString() ?? null })),
    sac: "996311",
  };
  const [inv] = await db
    .insert(invoices)
    .values({ invoiceNumber: await nextInvoiceNumber(), bookingId: b.id, kind, data, subtotal: data.subtotal, taxAmount: data.taxAmount, total: data.total })
    .returning();
  return inv!;
}

export async function latestInvoice(bookingId: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.bookingId, bookingId)).orderBy(desc(invoices.issuedAt)).limit(1);
  return inv ?? null;
}

// PDF standard fonts are WinAnsi-only; strip anything outside Latin-1.
const safe = (s: string) => s.replace(/₹/g, "Rs.").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export async function renderInvoicePdf(inv: typeof invoices.$inferSelect): Promise<Uint8Array> {
  const d = inv.data as unknown as InvoiceData;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = rgb(0.05, 0.45, 0.4);
  const grey = rgb(0.35, 0.35, 0.4);
  let y = 800;
  const text = (t: string, x: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(safe(t), { x, y: yy, size: o.size ?? 10, font: o.b ? bold : font, color: o.color ?? rgb(0.1, 0.1, 0.12) });
  const right = (t: string, xr: number, yy: number, o: { size?: number; b?: boolean } = {}) => {
    const w = (o.b ? bold : font).widthOfTextAtSize(safe(t), o.size ?? 10);
    text(t, xr - w, yy, o);
  };

  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: brand });
  text(d.platform.name, 40, 810, { size: 20, b: true, color: rgb(1, 1, 1) });
  right(inv.kind === "FINAL" ? "FINAL TAX INVOICE" : "TAX INVOICE", 555, 812, { size: 12, b: true });
  y = 770;
  text(d.platform.legalName, 40, y, { b: true });
  right(`Invoice No: ${inv.invoiceNumber}`, 555, y, { b: true });
  y -= 13;
  text(d.platform.address, 40, y, { size: 9, color: grey });
  right(`Date: ${prettyDate(inv.issuedAt)}`, 555, y, { size: 9 });
  y -= 13;
  text(`GSTIN: ${d.platform.gstin}  |  ${d.platform.email}  |  ${d.platform.phone}`, 40, y, { size: 9, color: grey });
  right(`SAC: ${d.sac}`, 555, y, { size: 9 });

  y -= 30;
  text("Billed to", 40, y, { b: true, color: brand });
  text("Property", 300, y, { b: true, color: brand });
  y -= 14;
  text(d.customer.name, 40, y);
  text(`${d.property.name} (${d.property.code})`, 300, y);
  y -= 13;
  text(d.customer.email ?? "", 40, y, { size: 9, color: grey });
  const addr = d.property.address;
  text(addr.slice(0, 55), 300, y, { size: 9, color: grey });
  y -= 13;
  text(d.customer.phone ?? "", 40, y, { size: 9, color: grey });
  if (addr.length > 55) text(addr.slice(55, 110), 300, y, { size: 9, color: grey });
  if (d.property.gstin) {
    y -= 13;
    text(`Property GSTIN: ${d.property.gstin}`, 300, y, { size: 9, color: grey });
  }

  y -= 28;
  page.drawRectangle({ x: 40, y: y - 34, width: 515, height: 46, color: rgb(0.95, 0.97, 0.97) });
  text(`Booking ${d.booking.number}`, 50, y, { b: true });
  text(`Room ${d.booking.room} - ${d.booking.unit}`, 300, y);
  y -= 14;
  text(`Check-in ${prettyDate(d.booking.checkIn)}   Check-out ${prettyDate(d.booking.checkOut)}`, 50, y, { size: 9 });
  text(`${d.booking.nights} night(s), ${d.booking.guests} guest(s)`, 300, y, { size: 9 });

  y -= 40;
  text("Description", 40, y, { b: true });
  right("Amount", 555, y, { b: true });
  y -= 6;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.7, color: grey });
  y -= 16;
  for (const l of [...d.lines, ...d.extras.map((e) => ({ ...e, kind: "charge" }))]) {
    text(l.label.slice(0, 80), 40, y, { size: 10, color: l.kind === "discount" ? brand : undefined });
    right(formatINRAscii(l.amount), 555, y);
    y -= 16;
  }
  page.drawLine({ start: { x: 300, y: y + 6 }, end: { x: 555, y: y + 6 }, thickness: 0.7, color: grey });
  const tot = (label: string, amt: number, b = false) => {
    y -= 4;
    text(label, 300, y, { b });
    right(formatINRAscii(amt), 555, y, { b });
    y -= 14;
  };
  tot("Taxable value", d.subtotal);
  tot("Taxes", d.taxAmount);
  if (d.deposit) tot("Refundable deposit", d.deposit);
  tot("Total", d.total, true);
  tot("Paid", d.paid);
  if (d.refunded) tot("Refunded", d.refunded);
  tot("Balance due", d.balanceDue, true);

  y -= 16;
  text("Payments", 40, y, { b: true, color: brand });
  y -= 14;
  if (!d.payments.length) {
    text("No online payment recorded (pay at property).", 40, y, { size: 9, color: grey });
    y -= 13;
  }
  for (const p of d.payments) {
    text(`${p.mode}  |  Txn ${p.txnId ?? "-"}  |  ${p.date ? prettyDate(p.date) : ""}`, 40, y, { size: 9 });
    right(formatINRAscii(p.amount), 555, y, { size: 9 });
    y -= 13;
  }

  text("GST is collected and remitted by the platform as e-commerce operator where applicable (CGST Act s.9(5)).", 40, 70, { size: 8, color: grey });
  text("This is a computer-generated invoice. Security deposit is refundable per the property's policy and is not a taxable supply.", 40, 58, { size: 8, color: grey });
  text("DEVELOPMENT BUILD - replace platform legal details and GSTIN in Admin > Settings before production.", 40, 40, { size: 8, color: rgb(0.7, 0.2, 0.2) });
  return pdf.save();
}
