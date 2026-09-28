import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, lt, lte, ne, notInArray, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  availabilityCalendars,
  beds,
  bookings,
  cities,
  maintenanceIssues,
  ownerEarnings,
  payouts,
  properties,
  reviews,
  rooms,
  supportTickets,
  users,
} from "@/db/schema";
import { addDays, listNights, nightsBetween, todayIST } from "@/lib/dates";
import { inIds } from "@/lib/owner-access";
import { bookingBeds, bookingGuests, bookingModifications, bookingServices, bookingStatusHistory, checkIns, checkOuts, payments as paymentsT, refunds as refundsT } from "@/db/schema";
import { maskPhone, maskEmail } from "@/lib/crypto";

/** Statuses that represent a live / sold stay. */
export const LIVE_STATUSES = ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN"] as const;
export const SOLD_STATUSES = ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT", "COMPLETED"] as const;

const activeBedCond = and(eq(beds.active, true), isNull(beds.deletedAt), eq(rooms.active, true), isNull(rooms.deletedAt));

/** Bed counts for a set of properties: total, occupied (status), available tonight (no calendar row). */
export async function bedStats(propertyIds: string[], night = todayIST()) {
  const [tot] = await db
    .select({ total: count(beds.id) })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(inIds(rooms.propertyId, propertyIds), activeBedCond));
  const [occ] = await db
    .select({ n: count(beds.id) })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(inIds(rooms.propertyId, propertyIds), activeBedCond, eq(beds.status, "OCCUPIED")));
  const [taken] = await db
    .select({ n: sql<number>`count(distinct ${availabilityCalendars.bedId})::int` })
    .from(availabilityCalendars)
    .innerJoin(rooms, eq(rooms.id, availabilityCalendars.roomId))
    .innerJoin(beds, eq(beds.id, availabilityCalendars.bedId))
    .where(
      and(
        inIds(rooms.propertyId, propertyIds),
        activeBedCond,
        eq(availabilityCalendars.night, night),
        sql`(${availabilityCalendars.status} <> 'HELD' OR ${availabilityCalendars.holdExpiresAt} > now())`,
      ),
    );
  const [unsellable] = await db
    .select({ n: count(beds.id) })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(
      and(
        inIds(rooms.propertyId, propertyIds),
        activeBedCond,
        or(inArray(beds.status, ["BLOCKED", "OCCUPIED"]), eq(rooms.maintenanceStatus, "UNDER_MAINTENANCE")),
        sql`NOT EXISTS (SELECT 1 FROM availability_calendars ac WHERE ac.bed_id = ${beds.id} AND ac.night = ${night})`,
      ),
    );
  const total = Number(tot?.total ?? 0);
  const available = Math.max(0, total - Number(taken?.n ?? 0) - Number(unsellable?.n ?? 0));
  return { total, occupied: Number(occ?.n ?? 0), available };
}

/** Occupancy over [from, to): booked bed-nights / (active beds × nights). */
export async function occupancy(propertyIds: string[], from: string, to: string) {
  const nights = Math.max(1, nightsBetween(from, to));
  const [booked] = await db
    .select({ n: count(availabilityCalendars.id) })
    .from(availabilityCalendars)
    .innerJoin(rooms, eq(rooms.id, availabilityCalendars.roomId))
    .where(and(inIds(rooms.propertyId, propertyIds), eq(availabilityCalendars.status, "BOOKED"), gte(availabilityCalendars.night, from), lt(availabilityCalendars.night, to)));
  const [bedsN] = await db
    .select({ n: count(beds.id) })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(inIds(rooms.propertyId, propertyIds), activeBedCond));
  const capacity = Number(bedsN?.n ?? 0) * nights;
  const bookedN = Number(booked?.n ?? 0);
  return { bookedBedNights: bookedN, capacityBedNights: capacity, pct: capacity ? Math.round((bookedN / capacity) * 1000) / 10 : 0 };
}

const bookingCols = {
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
  propertyId: bookings.propertyId,
  propertyName: properties.name,
  roomNumber: rooms.roomNumber,
  roomName: rooms.name,
  guestName: users.name,
  guestPhone: users.phone,
};

export async function arrivalsDepartures(propertyIds: string[], day = todayIST()) {
  const base = db.select(bookingCols).from(bookings).innerJoin(properties, eq(properties.id, bookings.propertyId)).innerJoin(rooms, eq(rooms.id, bookings.roomId)).innerJoin(users, eq(users.id, bookings.customerId));
  const arrivals = await base.where(and(inIds(bookings.propertyId, propertyIds), eq(bookings.checkIn, day), inArray(bookings.status, ["CONFIRMED", "CHECK_IN_PENDING"]))).orderBy(bookings.checkIn);
  const departures = await db
    .select(bookingCols)
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .innerJoin(users, eq(users.id, bookings.customerId))
    .where(and(inIds(bookings.propertyId, propertyIds), lte(bookings.checkOut, day), eq(bookings.status, "CHECKED_IN")))
    .orderBy(bookings.checkOut);
  const inHouse = await db
    .select(bookingCols)
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .innerJoin(users, eq(users.id, bookings.customerId))
    .where(and(inIds(bookings.propertyId, propertyIds), eq(bookings.status, "CHECKED_IN")))
    .orderBy(bookings.checkOut);
  return { arrivals, departures, inHouse };
}

export async function upcomingArrivals(propertyIds: string[], days = 7, limit = 50) {
  const today = todayIST();
  return db
    .select(bookingCols)
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .innerJoin(users, eq(users.id, bookings.customerId))
    .where(and(inIds(bookings.propertyId, propertyIds), gte(bookings.checkIn, today), lte(bookings.checkIn, addDays(today, days)), inArray(bookings.status, ["CONFIRMED", "CHECK_IN_PENDING"])))
    .orderBy(bookings.checkIn)
    .limit(limit);
}

export async function upcomingDepartures(propertyIds: string[], days = 7, limit = 50) {
  const today = todayIST();
  return db
    .select(bookingCols)
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .innerJoin(users, eq(users.id, bookings.customerId))
    .where(and(inIds(bookings.propertyId, propertyIds), eq(bookings.status, "CHECKED_IN"), lte(bookings.checkOut, addDays(today, days))))
    .orderBy(bookings.checkOut)
    .limit(limit);
}

export type BookingListRow = Awaited<ReturnType<typeof upcomingArrivals>>[number];

export async function ownerDashboard(ownerId: string) {
  const today = todayIST();
  const props = await db
    .select({ id: properties.id, approvalStatus: properties.approvalStatus })
    .from(properties)
    .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));
  const ids = props.map((p) => p.id);
  const [roomsN] = await db.select({ n: count(rooms.id) }).from(rooms).where(and(inIds(rooms.propertyId, ids), eq(rooms.active, true), isNull(rooms.deletedAt)));
  const bedsS = await bedStats(ids, today);
  const ad = await arrivalsDepartures(ids, today);
  const [upcoming] = await db
    .select({ n: count(bookings.id) })
    .from(bookings)
    .where(and(inIds(bookings.propertyId, ids), gte(bookings.checkIn, today), inArray(bookings.status, ["CONFIRMED", "CHECK_IN_PENDING"])));
  const [rev] = await db
    .select({ gross: sum(ownerEarnings.grossBookingValue), net: sum(ownerEarnings.netPayable) })
    .from(ownerEarnings)
    .where(and(eq(ownerEarnings.ownerId, ownerId), ne(ownerEarnings.status, "REVERSED")));
  const [pend] = await db
    .select({ n: sum(ownerEarnings.netPayable) })
    .from(ownerEarnings)
    .where(and(eq(ownerEarnings.ownerId, ownerId), inArray(ownerEarnings.status, ["PENDING", "ELIGIBLE", "ON_HOLD", "IN_PAYOUT"])));
  const [paid] = await db
    .select({ n: sum(payouts.netAmount), c: count(payouts.id) })
    .from(payouts)
    .where(and(eq(payouts.ownerId, ownerId), eq(payouts.status, "PAID")));
  const occ = await occupancy(ids, addDays(today, -30), today);
  const latestReviews = await db
    .select({ id: reviews.id, overall: reviews.overall, title: reviews.title, text: reviews.text, createdAt: reviews.createdAt, propertyName: properties.name, propertyId: reviews.propertyId, guest: users.name })
    .from(reviews)
    .innerJoin(properties, eq(properties.id, reviews.propertyId))
    .innerJoin(users, eq(users.id, reviews.customerId))
    .where(inIds(reviews.propertyId, ids))
    .orderBy(desc(reviews.createdAt))
    .limit(5);
  const [tickets] = await db
    .select({ n: count(supportTickets.id) })
    .from(supportTickets)
    .where(and(eq(supportTickets.raisedById, ownerId), notInArray(supportTickets.status, ["RESOLVED", "CLOSED"])));
  const [maint] = await db.select({ n: count(maintenanceIssues.id) }).from(maintenanceIssues).where(and(inIds(maintenanceIssues.propertyId, ids), ne(maintenanceIssues.status, "RESOLVED")));
  return {
    properties: {
      total: props.length,
      approved: props.filter((p) => p.approvalStatus === "APPROVED").length,
      pending: props.filter((p) => p.approvalStatus === "PENDING").length,
      draft: props.filter((p) => ["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(p.approvalStatus)).length,
    },
    rooms: Number(roomsN?.n ?? 0),
    beds: bedsS,
    arrivalsToday: ad.arrivals,
    departuresToday: ad.departures,
    inHouse: ad.inHouse,
    upcomingBookings: Number(upcoming?.n ?? 0),
    revenue: { gross: Number(rev?.gross ?? 0), net: Number(rev?.net ?? 0) },
    pendingEarnings: Number(pend?.n ?? 0),
    completedPayouts: { amount: Number(paid?.n ?? 0), count: Number(paid?.c ?? 0) },
    occupancy: occ,
    latestReviews,
    openTickets: Number(tickets?.n ?? 0),
    openMaintenance: Number(maint?.n ?? 0),
  };
}

// ───────────────────────────── reports ─────────────────────────────

export type ReportFilters = { from: string; to: string; propertyId?: string | null; status?: string | null };

async function scopedIds(ownerId: string, propertyId?: string | null) {
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt), propertyId ? eq(properties.id, propertyId) : undefined));
  return rows.map((r) => r.id);
}

export async function occupancyReport(ownerId: string, f: ReportFilters) {
  const ids = await scopedIds(ownerId, f.propertyId);
  const props = await db.select({ id: properties.id, name: properties.name, code: properties.code, city: cities.name }).from(properties).innerJoin(cities, eq(cities.id, properties.cityId)).where(inIds(properties.id, ids));
  const out = [];
  for (const p of props) {
    const o = await occupancy([p.id], f.from, f.to);
    const b = await bedStats([p.id]);
    out.push({ property: p.name, code: p.code, city: p.city, beds: b.total, bookedBedNights: o.bookedBedNights, capacityBedNights: o.capacityBedNights, occupancyPct: o.pct });
  }
  return out.sort((a, b) => b.occupancyPct - a.occupancyPct);
}

export async function bookingsReport(ownerId: string, f: ReportFilters) {
  const ids = await scopedIds(ownerId, f.propertyId);
  const rows = await db
    .select({ ...bookingCols, createdAt: bookings.createdAt, source: bookings.source, taxAmount: bookings.taxAmount })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .innerJoin(users, eq(users.id, bookings.customerId))
    .where(
      and(
        inIds(bookings.propertyId, ids),
        gte(bookings.checkIn, f.from),
        lt(bookings.checkIn, f.to),
        f.status ? eq(bookings.status, f.status as (typeof bookings.status.enumValues)[number]) : notInArray(bookings.status, ["DRAFT"]),
      ),
    )
    .orderBy(desc(bookings.checkIn))
    .limit(5000);
  return rows.map((r) => ({
    bookingNumber: r.bookingNumber,
    property: r.propertyName,
    room: r.roomNumber,
    guest: r.guestName,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights: r.nights,
    unit: r.unit === "ROOM" ? "Entire room" : `${r.bedsCount} bed(s)`,
    status: r.status,
    total: r.totalAmount,
    paid: r.paidAmount,
  }));
}

export async function revenueReport(ownerId: string, f: ReportFilters) {
  const ids = await scopedIds(ownerId, f.propertyId);
  const rows = await db
    .select({
      property: properties.name,
      code: properties.code,
      bookings: count(ownerEarnings.id),
      gross: sql<number>`coalesce(sum(${ownerEarnings.grossBookingValue}),0)::int`,
      taxes: sql<number>`coalesce(sum(${ownerEarnings.taxes}),0)::int`,
      commission: sql<number>`coalesce(sum(${ownerEarnings.commission}),0)::int`,
      gatewayFee: sql<number>`coalesce(sum(${ownerEarnings.gatewayFee}),0)::int`,
      discounts: sql<number>`coalesce(sum(${ownerEarnings.propertyDiscount}),0)::int`,
      deductions: sql<number>`coalesce(sum(${ownerEarnings.penalties} + ${ownerEarnings.refundDeduction}),0)::int`,
      net: sql<number>`coalesce(sum(${ownerEarnings.netPayable}),0)::int`,
    })
    .from(ownerEarnings)
    .innerJoin(bookings, eq(bookings.id, ownerEarnings.bookingId))
    .innerJoin(properties, eq(properties.id, ownerEarnings.propertyId))
    .where(and(eq(ownerEarnings.ownerId, ownerId), inIds(ownerEarnings.propertyId, ids), gte(bookings.checkIn, f.from), lt(bookings.checkIn, f.to), f.status ? eq(ownerEarnings.status, f.status as (typeof ownerEarnings.status.enumValues)[number]) : undefined))
    .groupBy(properties.name, properties.code)
    .orderBy(desc(sql`sum(${ownerEarnings.netPayable})`));
  return rows.map((r) => ({ ...r, bookings: Number(r.bookings), gross: Number(r.gross), taxes: Number(r.taxes), commission: Number(r.commission), gatewayFee: Number(r.gatewayFee), discounts: Number(r.discounts), deductions: Number(r.deductions), net: Number(r.net) }));
}

export const REPORT_COLUMNS = {
  occupancy: [
    { key: "property", label: "Property", width: 32 },
    { key: "code", label: "Code" },
    { key: "city", label: "City" },
    { key: "beds", label: "Beds" },
    { key: "bookedBedNights", label: "Booked bed-nights" },
    { key: "capacityBedNights", label: "Capacity bed-nights" },
    { key: "occupancyPct", label: "Occupancy %" },
  ],
  bookings: [
    { key: "bookingNumber", label: "Booking #", width: 22 },
    { key: "property", label: "Property", width: 30 },
    { key: "room", label: "Room" },
    { key: "guest", label: "Guest", width: 22 },
    { key: "checkIn", label: "Check-in" },
    { key: "checkOut", label: "Check-out" },
    { key: "nights", label: "Nights" },
    { key: "unit", label: "Unit" },
    { key: "status", label: "Status" },
    { key: "total", label: "Total", money: true },
    { key: "paid", label: "Paid", money: true },
  ],
  revenue: [
    { key: "property", label: "Property", width: 32 },
    { key: "code", label: "Code" },
    { key: "bookings", label: "Bookings" },
    { key: "gross", label: "Gross", money: true },
    { key: "taxes", label: "Taxes", money: true },
    { key: "commission", label: "Commission", money: true },
    { key: "gatewayFee", label: "Gateway fee", money: true },
    { key: "discounts", label: "Property discounts", money: true },
    { key: "deductions", label: "Penalties & refunds", money: true },
    { key: "net", label: "Net payable", money: true },
  ],
} as const;

/** Calendar grid for one property & month: per room, per night → counts of booked/held/blocked beds. */
export async function monthGrid(propertyId: string, month: string) {
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, "0")}-01`;
  const nights = listNights(start, next);
  const roomRows = await db
    .select({ id: rooms.id, roomNumber: rooms.roomNumber, name: rooms.name, maintenanceStatus: rooms.maintenanceStatus })
    .from(rooms)
    .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt), eq(rooms.active, true)))
    .orderBy(rooms.roomNumber);
  const bedCounts = await db
    .select({ roomId: beds.roomId, n: count(beds.id) })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(eq(rooms.propertyId, propertyId), eq(beds.active, true), isNull(beds.deletedAt)))
    .groupBy(beds.roomId);
  const cal = await db
    .select({ roomId: availabilityCalendars.roomId, night: availabilityCalendars.night, status: availabilityCalendars.status, n: count(availabilityCalendars.id) })
    .from(availabilityCalendars)
    .innerJoin(rooms, eq(rooms.id, availabilityCalendars.roomId))
    .where(and(eq(rooms.propertyId, propertyId), gte(availabilityCalendars.night, start), lt(availabilityCalendars.night, next), sql`(${availabilityCalendars.status} <> 'HELD' OR ${availabilityCalendars.holdExpiresAt} > now())`))
    .groupBy(availabilityCalendars.roomId, availabilityCalendars.night, availabilityCalendars.status);
  const bc = Object.fromEntries(bedCounts.map((b) => [b.roomId, Number(b.n)]));
  const cells: Record<string, Record<string, { BOOKED: number; HELD: number; BLOCKED: number }>> = {};
  for (const c of cal) {
    const r = (cells[c.roomId] ??= {});
    const d = (r[c.night] ??= { BOOKED: 0, HELD: 0, BLOCKED: 0 });
    d[c.status] += Number(c.n);
  }
  return { nights, rooms: roomRows.map((r) => ({ ...r, totalBeds: bc[r.id] ?? 0, cells: cells[r.id] ?? {} })) };
}

// ───────────────────────────── booking detail (owner drawer / staff desk) ─────────────────────────────

export async function bookingDetail(bookingId: string, opts: { includeFinance?: boolean } = {}) {
  const [row] = await db
    .select({ b: bookings, propertyName: properties.name, propertyCode: properties.code, checkInTime: properties.checkInTime, checkOutTime: properties.checkOutTime, roomNumber: rooms.roomNumber, roomName: rooms.name, roomCategory: rooms.category, customerName: users.name, customerPhone: users.phone, customerEmail: users.email })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .innerJoin(users, eq(users.id, bookings.customerId))
    .where(eq(bookings.id, bookingId));
  if (!row) return null;
  const b = row.b;
  const reveal = ["CHECKED_IN"].includes(b.status);
  const guests = await db.select().from(bookingGuests).where(eq(bookingGuests.bookingId, b.id));
  const bedRows = await db
    .select({ id: beds.id, code: beds.code, bedNumber: beds.bedNumber, bedType: beds.bedType, roomNumber: rooms.roomNumber })
    .from(bookingBeds)
    .innerJoin(beds, eq(beds.id, bookingBeds.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(eq(bookingBeds.bookingId, b.id), eq(bookingBeds.active, true)));
  const pays = await db
    .select({ id: paymentsT.id, purpose: paymentsT.purpose, method: paymentsT.method, amount: paymentsT.amount, status: paymentsT.status, createdAt: paymentsT.createdAt, refundedAmount: paymentsT.refundedAmount })
    .from(paymentsT)
    .where(eq(paymentsT.bookingId, b.id))
    .orderBy(desc(paymentsT.createdAt));
  const refs = await db.select({ id: refundsT.id, amount: refundsT.amount, kind: refundsT.kind, status: refundsT.status, createdAt: refundsT.createdAt }).from(refundsT).where(eq(refundsT.bookingId, b.id));
  const mods = await db.select().from(bookingModifications).where(eq(bookingModifications.bookingId, b.id)).orderBy(desc(bookingModifications.createdAt));
  const history = await db.select().from(bookingStatusHistory).where(eq(bookingStatusHistory.bookingId, b.id)).orderBy(desc(bookingStatusHistory.createdAt));
  const services = await db.select().from(bookingServices).where(eq(bookingServices.bookingId, b.id));
  const [ci] = await db.select().from(checkIns).where(eq(checkIns.bookingId, b.id));
  const [co] = await db.select().from(checkOuts).where(eq(checkOuts.bookingId, b.id));
  let earning = null;
  if (opts.includeFinance) [earning] = await db.select().from(ownerEarnings).where(eq(ownerEarnings.bookingId, b.id));
  const depositHeld = Math.min(b.paidAmount, b.securityDeposit);
  return {
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
    specialRequests: b.specialRequests,
    payAtProperty: b.payAtProperty,
    source: b.source,
    createdAt: b.createdAt,
    propertyId: b.propertyId,
    propertyName: row.propertyName,
    propertyCode: row.propertyCode,
    checkInTime: row.checkInTime,
    checkOutTime: row.checkOutTime,
    roomId: b.roomId,
    roomNumber: row.roomNumber,
    roomName: row.roomName,
    roomCategory: row.roomCategory,
    customer: { name: row.customerName, phone: reveal ? row.customerPhone : maskPhone(row.customerPhone), email: reveal ? row.customerEmail : maskEmail(row.customerEmail) },
    guests: guests.map((g) => ({ id: g.id, name: g.name, isPrimary: g.isPrimary, gender: g.gender, age: g.age, phone: reveal ? g.phone : maskPhone(g.phone), idType: g.idType, idLast4: g.idLast4 })),
    beds: bedRows,
    money: {
      lines: b.priceBreakdown?.lines ?? [],
      totalAmount: b.totalAmount,
      paidAmount: b.paidAmount,
      refundedAmount: b.refundedAmount,
      securityDeposit: b.securityDeposit,
      depositHeld,
      depositPending: Math.max(0, b.securityDeposit - depositHeld),
      balanceDue: Math.max(0, b.totalAmount - b.paidAmount),
    },
    payments: pays,
    refunds: refs,
    services,
    modifications: mods.map((m) => ({ id: m.id, type: m.type, status: m.status, priceDiff: m.priceDiff, payload: m.payload, note: m.note, createdAt: m.createdAt })),
    history: history.map((h) => ({ id: h.id, from: h.fromStatus, to: h.toStatus, note: h.note, at: h.createdAt })),
    checkInRecord: ci ? { at: ci.actualTime, idDocType: ci.idDocType, idLast4: ci.idLast4, depositCollected: ci.depositCollected, notes: ci.notes, hasIdFile: Boolean(ci.idFileId), idFileId: ci.idFileId } : null,
    checkOutRecord: co ? { at: co.actualTime, damageCharges: co.damageCharges, extraCharges: co.extraCharges, depositRefund: co.depositRefund, amountDue: co.amountDue, notes: co.notes, inspection: co.inspection } : null,
    earning: earning ?? null,
  };
}
export type BookingDetail = NonNullable<Awaited<ReturnType<typeof bookingDetail>>>;

// ───────────────────────────── earnings statement ─────────────────────────────
export async function earningRows(ownerId: string, f: { propertyId?: string; status?: string; payoutId?: string }) {
  const rows = await db
    .select({ e: ownerEarnings, bookingNumber: bookings.bookingNumber, checkIn: bookings.checkIn, checkOut: bookings.checkOut, bookingStatus: bookings.status, property: properties.name })
    .from(ownerEarnings)
    .innerJoin(bookings, eq(bookings.id, ownerEarnings.bookingId))
    .innerJoin(properties, eq(properties.id, ownerEarnings.propertyId))
    .where(
      and(
        eq(ownerEarnings.ownerId, ownerId),
        f.propertyId ? eq(ownerEarnings.propertyId, f.propertyId) : undefined,
        f.status ? eq(ownerEarnings.status, f.status as (typeof ownerEarnings.status.enumValues)[number]) : undefined,
        f.payoutId ? eq(ownerEarnings.payoutId, f.payoutId) : undefined,
      ),
    )
    .orderBy(desc(ownerEarnings.createdAt))
    .limit(10000);
  return rows.map((r) => ({
    bookingNumber: r.bookingNumber,
    property: r.property,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    bookingStatus: r.bookingStatus,
    gross: r.e.grossBookingValue,
    taxes: r.e.taxes,
    roomRevenue: r.e.roomRevenue,
    commissionPct: r.e.commissionBps / 100,
    commission: r.e.commission,
    gatewayFee: r.e.gatewayFee,
    platformDiscount: r.e.platformDiscount,
    propertyDiscount: r.e.propertyDiscount,
    penalties: r.e.penalties,
    refundDeduction: r.e.refundDeduction,
    adjustments: r.e.adjustments,
    net: r.e.netPayable,
    status: r.e.status,
    eligibleAt: r.e.eligibleAt,
  }));
}

export const EARNINGS_EXPORT_COLUMNS = [
  { key: "bookingNumber", label: "Booking #", width: 22 },
  { key: "property", label: "Property", width: 28 },
  { key: "checkIn", label: "Check-in" },
  { key: "checkOut", label: "Check-out" },
  { key: "gross", label: "Gross", money: true },
  { key: "taxes", label: "Taxes", money: true },
  { key: "commissionPct", label: "Commission %" },
  { key: "commission", label: "Commission", money: true },
  { key: "gatewayFee", label: "Gateway fee", money: true },
  { key: "platformDiscount", label: "Platform discount", money: true },
  { key: "propertyDiscount", label: "Property discount", money: true },
  { key: "penalties", label: "Penalties", money: true },
  { key: "refundDeduction", label: "Refund deductions", money: true },
  { key: "adjustments", label: "Adjustments", money: true },
  { key: "net", label: "Net payable", money: true },
  { key: "status", label: "Status" },
];

// ───────────────────────────── bed picker for check-in ─────────────────────────────
/** Free beds in the booking's property for the remaining stay (plus the beds already assigned to it). */
export async function freeBedsForStay(b: typeof bookings.$inferSelect) {
  const today = todayIST();
  const from = today > b.checkIn ? today : b.checkIn;
  const [room] = await db.select({ genderEligibility: rooms.genderEligibility, category: rooms.category }).from(rooms).where(eq(rooms.id, b.roomId));
  const all = await db
    .select({ id: beds.id, code: beds.code, bedNumber: beds.bedNumber, bedType: beds.bedType, status: beds.status, roomId: rooms.id, roomNumber: rooms.roomNumber, roomName: rooms.name, isAC: rooms.isAC, category: rooms.category, maintenance: rooms.maintenanceStatus, allowBed: rooms.allowBedBooking })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(eq(rooms.propertyId, b.propertyId), activeBedCond, eq(rooms.approvalStatus, "APPROVED")))
    .orderBy(rooms.roomNumber, beds.bedNumber);
  const taken = await db
    .selectDistinct({ bedId: availabilityCalendars.bedId, bookingId: availabilityCalendars.bookingId })
    .from(availabilityCalendars)
    .innerJoin(rooms, eq(rooms.id, availabilityCalendars.roomId))
    .where(and(eq(rooms.propertyId, b.propertyId), gte(availabilityCalendars.night, from), lt(availabilityCalendars.night, b.checkOut), sql`(${availabilityCalendars.status} <> 'HELD' OR ${availabilityCalendars.holdExpiresAt} > now())`));
  const mine = new Set(taken.filter((t) => t.bookingId === b.id).map((t) => t.bedId));
  const busy = new Set(taken.filter((t) => t.bookingId !== b.id).map((t) => t.bedId));
  return all
    .filter((x) => x.maintenance === "OK" && x.allowBed && (mine.has(x.id) || (!busy.has(x.id) && !["OCCUPIED", "BLOCKED"].includes(x.status))))
    .filter((x) => !room || x.category === room.category || mine.has(x.id))
    .map((x) => ({ ...x, assigned: mine.has(x.id), needsCleaning: x.status === "CLEANING" }));
}
