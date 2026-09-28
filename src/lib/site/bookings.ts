import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingGuests,
  bookingModifications,
  bookingStatusHistory,
  bookings,
  cancellations,
  cities,
  invoices,
  payments,
  properties,
  propertyImages,
  refunds,
  reviews,
  rooms,
  beds,
  bookingBeds,
  supportTickets,
} from "@/db/schema";
import { notFound } from "@/lib/errors";

export async function getOwnedBookingRow(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Booking not found");
  const [b] = await db.select().from(bookings).where(and(eq(bookings.id, id), isNull(bookings.deletedAt)));
  if (!b || b.customerId !== userId) throw notFound("Booking not found");
  return b;
}

/** Full booking view for its customer. */
export async function getBookingDetail(id: string, userId: string) {
  const b = await getOwnedBookingRow(id, userId);
  const [prop] = await db
    .select({ id: properties.id, name: properties.name, slug: properties.slug, addressLine: properties.addressLine, landmark: properties.landmark, postalCode: properties.postalCode, state: properties.state, city: cities.name, latitude: properties.latitude, longitude: properties.longitude, checkInTime: properties.checkInTime, checkOutTime: properties.checkOutTime, contactPhone: properties.contactPhone, showOwnerPhone: properties.showOwnerPhone })
    .from(properties)
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .where(eq(properties.id, b.propertyId));
  const [room] = await db.select({ id: rooms.id, roomNumber: rooms.roomNumber, name: rooms.name, category: rooms.category, isAC: rooms.isAC, bathroom: rooms.bathroom, totalBeds: rooms.totalBeds }).from(rooms).where(eq(rooms.id, b.roomId));
  const [cover] = await db.select({ url: propertyImages.url }).from(propertyImages).where(and(eq(propertyImages.propertyId, b.propertyId), eq(propertyImages.status, "APPROVED"))).orderBy(desc(propertyImages.isCover), asc(propertyImages.sortOrder)).limit(1);
  const [guests, pays, refs, mods, history, inv, rev, cancel, bedRows, tickets] = await Promise.all([
    db.select().from(bookingGuests).where(eq(bookingGuests.bookingId, b.id)).orderBy(desc(bookingGuests.isPrimary), asc(bookingGuests.createdAt)),
    db.select({ id: payments.id, purpose: payments.purpose, provider: payments.provider, method: payments.method, amount: payments.amount, status: payments.status, refundedAmount: payments.refundedAmount, providerPaymentId: payments.providerPaymentId, failureReason: payments.failureReason, capturedAt: payments.capturedAt, createdAt: payments.createdAt, modificationId: payments.modificationId }).from(payments).where(eq(payments.bookingId, b.id)).orderBy(desc(payments.createdAt)),
    db.select().from(refunds).where(eq(refunds.bookingId, b.id)).orderBy(desc(refunds.createdAt)),
    db.select().from(bookingModifications).where(eq(bookingModifications.bookingId, b.id)).orderBy(desc(bookingModifications.createdAt)),
    db.select({ id: bookingStatusHistory.id, fromStatus: bookingStatusHistory.fromStatus, toStatus: bookingStatusHistory.toStatus, note: bookingStatusHistory.note, createdAt: bookingStatusHistory.createdAt }).from(bookingStatusHistory).where(eq(bookingStatusHistory.bookingId, b.id)).orderBy(asc(bookingStatusHistory.createdAt)),
    db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, kind: invoices.kind, total: invoices.total, issuedAt: invoices.issuedAt }).from(invoices).where(eq(invoices.bookingId, b.id)).orderBy(desc(invoices.issuedAt)),
    db.select({ id: reviews.id, overall: reviews.overall, status: reviews.status, createdAt: reviews.createdAt }).from(reviews).where(eq(reviews.bookingId, b.id)),
    db.select().from(cancellations).where(eq(cancellations.bookingId, b.id)),
    db.select({ id: beds.id, bedNumber: beds.bedNumber }).from(bookingBeds).innerJoin(beds, eq(beds.id, bookingBeds.bedId)).where(and(eq(bookingBeds.bookingId, b.id), eq(bookingBeds.active, true))),
    db.select({ id: supportTickets.id, ticketNumber: supportTickets.ticketNumber, subject: supportTickets.subject, status: supportTickets.status }).from(supportTickets).where(eq(supportTickets.bookingId, b.id)),
  ]);
  const confirmedish = ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT", "COMPLETED"].includes(b.status);
  return {
    booking: {
      id: b.id,
      bookingNumber: b.bookingNumber,
      status: b.status,
      unit: b.unit,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      adults: b.adults,
      children: b.children,
      bedsCount: b.bedsCount,
      totalAmount: b.totalAmount,
      paidAmount: b.paidAmount,
      refundedAmount: b.refundedAmount,
      securityDeposit: b.securityDeposit,
      depositRefunded: b.depositRefunded,
      couponCode: b.couponCode,
      couponDiscount: b.couponDiscount,
      priceBreakdown: b.priceBreakdown,
      selectedServices: b.selectedServices,
      payAtProperty: b.payAtProperty,
      nonRefundable: b.nonRefundable,
      lockExpiresAt: b.lockExpiresAt?.toISOString() ?? null,
      cancellationPolicy: b.cancellationPolicy as { name?: string; description?: string; tiers?: { hoursBeforeCheckIn: number; refundBps: number }[] },
      specialRequests: b.specialRequests,
      qrToken: confirmedish ? b.qrToken : null,
      confirmedAt: b.confirmedAt?.toISOString() ?? null,
      cancelledAt: b.cancelledAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
    },
    property: prop ? { ...prop, contactPhone: prop.showOwnerPhone || confirmedish ? prop.contactPhone : null, image: cover?.url ?? null } : null,
    room: room ?? null,
    beds: bedRows,
    guests,
    payments: pays,
    refunds: refs,
    modifications: mods,
    statusHistory: history,
    invoices: inv,
    latestInvoice: inv[0] ?? null,
    review: rev[0] ?? null,
    cancellation: cancel[0] ?? null,
    tickets,
  };
}
export type BookingDetail = Awaited<ReturnType<typeof getBookingDetail>>;

/** My bookings list with property/room summary. */
export async function listMyBookings(userId: string, statuses?: readonly string[]) {
  const conds = [eq(bookings.customerId, userId), isNull(bookings.deletedAt)];
  if (statuses?.length) conds.push(inArray(bookings.status, statuses as (typeof bookings.$inferSelect.status)[]));
  const rows = await db
    .select({
      id: bookings.id,
      bookingNumber: bookings.bookingNumber,
      status: bookings.status,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      nights: bookings.nights,
      unit: bookings.unit,
      bedsCount: bookings.bedsCount,
      adults: bookings.adults,
      children: bookings.children,
      totalAmount: bookings.totalAmount,
      paidAmount: bookings.paidAmount,
      refundedAmount: bookings.refundedAmount,
      lockExpiresAt: bookings.lockExpiresAt,
      createdAt: bookings.createdAt,
      propertyName: properties.name,
      propertySlug: properties.slug,
      propertyId: properties.id,
      city: cities.name,
      roomNumber: rooms.roomNumber,
      roomName: rooms.name,
      category: rooms.category,
      isAC: rooms.isAC,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .where(and(...conds))
    .orderBy(desc(bookings.checkIn));
  const pids = [...new Set(rows.map((r) => r.propertyId))];
  const imgs = pids.length
    ? await db.select({ propertyId: propertyImages.propertyId, url: propertyImages.url, isCover: propertyImages.isCover, sortOrder: propertyImages.sortOrder }).from(propertyImages).where(and(inArray(propertyImages.propertyId, pids), eq(propertyImages.status, "APPROVED")))
    : [];
  const cover = new Map<string, string>();
  for (const i of imgs.sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder)) if (!cover.has(i.propertyId)) cover.set(i.propertyId, i.url);
  const reviewed = rows.length ? new Set((await db.select({ b: reviews.bookingId }).from(reviews).where(inArray(reviews.bookingId, rows.map((r) => r.id)))).map((x) => x.b)) : new Set<string>();
  return rows.map((r) => ({ ...r, image: cover.get(r.propertyId) ?? null, reviewed: reviewed.has(r.id), lockExpiresAt: r.lockExpiresAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }));
}
export type MyBooking = Awaited<ReturnType<typeof listMyBookings>>[number];
