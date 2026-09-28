import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { addDays, nightsBetween, todayIST } from "@/lib/dates";
import type { ExportColumn } from "@/lib/export";

/**
 * Admin reports. Each report declares its columns (money columns in paise) and a runner that takes
 * the common filter set. Booking-based reports filter on the booking date
 * (confirmed_at, falling back to created_at, in IST); occupancy reports use stay nights in the range.
 */
export type ReportFilters = {
  from: string;
  to: string;
  cityId?: string;
  propertyId?: string;
  ownerId?: string;
  status?: string;
  category?: string;
  sharing?: number;
  paymentStatus?: string;
  unit?: string;
};
export type FilterKey = "date" | "city" | "property" | "owner" | "status" | "category" | "sharing" | "paymentStatus" | "unit";
export type ReportColumn = ExportColumn & { pct?: boolean };
export type ReportDef = {
  key: string;
  label: string;
  group: "Bookings" | "Occupancy" | "Finance" | "Customers & partners" | "Engagement";
  description: string;
  financial: boolean;
  filters: FilterKey[];
  columns: ReportColumn[];
  run: (f: ReportFilters) => Promise<Record<string, unknown>[]>;
};

const STAYED = sql.raw(`('CONFIRMED','CHECK_IN_PENDING','CHECKED_IN','CHECKED_OUT','COMPLETED')`);
const REVENUE_STATUSES = sql.raw(`('CONFIRMED','CHECK_IN_PENDING','CHECKED_IN','CHECKED_OUT','COMPLETED','CANCELLED','REFUND_PENDING','PARTIALLY_REFUNDED','REFUNDED','NO_SHOW')`);
const bookedOn = sql.raw(`((coalesce(b.confirmed_at, b.created_at) AT TIME ZONE 'Asia/Kolkata')::date)`);

export function defaultFilters(): Pick<ReportFilters, "from" | "to"> {
  const to = todayIST();
  return { from: addDays(to, -29), to };
}

function and(parts: (SQL | null | undefined | false)[]): SQL {
  const p = parts.filter(Boolean) as SQL[];
  return p.length ? sql.join(p, sql` AND `) : sql`TRUE`;
}

/** Filters on bookings b / properties p / rooms r. */
function bookingConds(f: ReportFilters, opts: { date?: boolean } = {}): SQL {
  return and([
    sql`b.status <> 'DRAFT'`,
    opts.date !== false && f.from ? sql`${bookedOn} >= ${f.from}::date` : null,
    opts.date !== false && f.to ? sql`${bookedOn} <= ${f.to}::date` : null,
    f.cityId ? sql`p.city_id = ${f.cityId}::uuid` : null,
    f.propertyId ? sql`p.id = ${f.propertyId}::uuid` : null,
    f.ownerId ? sql`p.owner_id = ${f.ownerId}::uuid` : null,
    f.status ? sql`b.status::text = ${f.status}` : null,
    f.category ? sql`r.category::text = ${f.category}` : null,
    f.sharing ? sql`r.sharing_capacity = ${f.sharing}` : null,
    f.unit ? sql`b.unit::text = ${f.unit}` : null,
    f.paymentStatus ? sql`EXISTS (SELECT 1 FROM payments pay WHERE pay.booking_id = b.id AND pay.status::text = ${f.paymentStatus})` : null,
  ]);
}

const BK_FROM = sql.raw(`FROM bookings b JOIN properties p ON p.id = b.property_id JOIN cities c ON c.id = p.city_id JOIN rooms r ON r.id = b.room_id JOIN users cu ON cu.id = b.customer_id`);

async function rows(q: SQL, numeric: string[] = []) {
  const res = await db.execute(q);
  return (res.rows as Record<string, unknown>[]).map((r) => {
    const o = { ...r };
    for (const k of numeric) if (o[k] !== null && o[k] !== undefined) o[k] = Number(o[k]);
    return o;
  });
}

const m = (key: string, label: string): ReportColumn => ({ key, label, money: true, width: 14 });
const c = (key: string, label: string, width?: number): ReportColumn => ({ key, label, width });
const pct = (key: string, label: string): ReportColumn => ({ key, label, pct: true, width: 12 });

// ───────────────────────── occupancy helper ─────────────────────────
async function occupancy(f: ReportFilters, groupBy: "property" | "sharing" | "category" | "ac" | "room", categories?: string[]) {
  const to1 = addDays(f.to, 1);
  const days = Math.max(1, nightsBetween(f.from, to1));
  const roomConds = and([
    sql`r.deleted_at IS NULL`,
    sql`r.active`,
    sql`r.approval_status = 'APPROVED'`,
    sql`p.deleted_at IS NULL`,
    categories ? sql`r.category::text IN (${sql.join(categories.map((x) => sql`${x}`), sql`, `)})` : null,
    f.cityId ? sql`p.city_id = ${f.cityId}::uuid` : null,
    f.propertyId ? sql`p.id = ${f.propertyId}::uuid` : null,
    f.ownerId ? sql`p.owner_id = ${f.ownerId}::uuid` : null,
    f.category ? sql`r.category::text = ${f.category}` : null,
    f.sharing ? sql`r.sharing_capacity = ${f.sharing}` : null,
  ]);
  const group = {
    property: sql.raw(`p.name AS "property", c.name AS "city"`),
    room: sql.raw(`p.name AS "property", 'Room ' || r.room_number || coalesce(' · ' || r.name, '') AS "room", r.sharing_capacity AS "sharing", CASE WHEN r.is_ac THEN 'AC' ELSE 'Non-AC' END AS "ac"`),
    sharing: sql.raw(`r.sharing_capacity || '-sharing' AS "sharing"`),
    category: sql.raw(`initcap(r.category::text) AS "category"`),
    ac: sql.raw(`CASE WHEN r.is_ac THEN 'AC' ELSE 'Non-AC' END AS "ac"`),
  }[groupBy];
  const groupKeys = { property: sql.raw(`p.name, c.name`), room: sql.raw(`p.name, r.room_number, r.name, r.sharing_capacity, r.is_ac`), sharing: sql.raw(`r.sharing_capacity`), category: sql.raw(`r.category`), ac: sql.raw(`r.is_ac`) }[groupBy];
  const statusCond = f.status ? sql`b.status::text = ${f.status}` : sql`b.status IN ${STAYED}`;
  return rows(
    sql`
    WITH bk AS (
      SELECT b.room_id,
        count(*) AS bookings,
        sum(GREATEST(0, LEAST(b.check_out, ${to1}::date) - GREATEST(b.check_in, ${f.from}::date)) * (CASE WHEN b.unit = 'ROOM' THEN rr.total_beds ELSE b.beds_count END)) AS bed_nights,
        sum(CASE WHEN b.nights > 0 THEN (b.room_charge::numeric * GREATEST(0, LEAST(b.check_out, ${to1}::date) - GREATEST(b.check_in, ${f.from}::date)) / b.nights) ELSE 0 END) AS revenue
      FROM bookings b JOIN rooms rr ON rr.id = b.room_id
      WHERE ${statusCond} AND b.check_in < ${to1}::date AND b.check_out > ${f.from}::date
      GROUP BY b.room_id
    )
    SELECT ${group},
      count(DISTINCT r.id)::int AS "rooms",
      sum((SELECT count(*) FROM beds bd WHERE bd.room_id = r.id AND bd.active AND bd.deleted_at IS NULL))::int AS "beds",
      (sum((SELECT count(*) FROM beds bd WHERE bd.room_id = r.id AND bd.active AND bd.deleted_at IS NULL)) * ${days})::int AS "capacity",
      coalesce(sum(bk.bed_nights), 0)::int AS "booked",
      coalesce(sum(bk.bookings), 0)::int AS "bookings",
      round(coalesce(sum(bk.revenue), 0))::bigint AS "revenue",
      CASE WHEN sum((SELECT count(*) FROM beds bd WHERE bd.room_id = r.id AND bd.active AND bd.deleted_at IS NULL)) > 0
        THEN round(100.0 * coalesce(sum(bk.bed_nights), 0) / (sum((SELECT count(*) FROM beds bd WHERE bd.room_id = r.id AND bd.active AND bd.deleted_at IS NULL)) * ${days}), 1) ELSE 0 END AS "occupancy"
    FROM rooms r JOIN properties p ON p.id = r.property_id JOIN cities c ON c.id = p.city_id
    LEFT JOIN bk ON bk.room_id = r.id
    WHERE ${roomConds}
    GROUP BY ${groupKeys}
    ORDER BY 1`,
    ["rooms", "beds", "capacity", "booked", "bookings", "revenue", "occupancy"],
  );
}
const occCols = (first: ReportColumn[]): ReportColumn[] => [...first, c("rooms", "Rooms"), c("beds", "Beds"), c("capacity", "Bed-nights available"), c("booked", "Bed-nights sold"), pct("occupancy", "Occupancy %"), c("bookings", "Bookings"), m("revenue", "Room revenue in period")];
const OCC_FILTERS: FilterKey[] = ["date", "city", "property", "owner", "category", "sharing", "status"];

export const REPORTS: ReportDef[] = [
  {
    key: "bookings",
    label: "Booking report",
    group: "Bookings",
    description: "Every booking in the period with guest, stay, status and amounts.",
    financial: false,
    filters: ["date", "city", "property", "owner", "status", "category", "sharing", "paymentStatus", "unit"],
    columns: [c("bookingNumber", "Booking #", 22), c("bookedOn", "Booked on"), c("customer", "Customer", 18), c("phone", "Phone"), c("property", "Property", 24), c("city", "City"), c("room", "Room"), c("unit", "Unit"), c("checkIn", "Check-in"), c("checkOut", "Check-out"), c("nights", "Nights"), c("guests", "Guests"), c("status", "Status", 16), m("total", "Total"), m("paid", "Paid"), m("refunded", "Refunded")],
    run: (f) =>
      rows(
        sql`SELECT b.booking_number AS "bookingNumber", to_char(${bookedOn}, 'YYYY-MM-DD') AS "bookedOn", cu.name AS "customer", cu.phone AS "phone", p.name AS "property", c.name AS "city", r.room_number AS "room", b.unit AS "unit", b.check_in::text AS "checkIn", b.check_out::text AS "checkOut", b.nights AS "nights", (b.adults + b.children) AS "guests", b.status AS "status", b.total_amount AS "total", b.paid_amount AS "paid", b.refunded_amount AS "refunded"
        ${BK_FROM} WHERE ${bookingConds(f)} ORDER BY coalesce(b.confirmed_at, b.created_at) DESC LIMIT 5000`,
        ["total", "paid", "refunded", "nights", "guests"],
      ),
  },
  {
    key: "occupancy",
    label: "Occupancy report",
    group: "Occupancy",
    description: "Bed-night occupancy per property for stays within the date range.",
    financial: false,
    filters: OCC_FILTERS,
    columns: occCols([c("property", "Property", 26), c("city", "City")]),
    run: (f) => occupancy(f, "property"),
  },
  {
    key: "shared-occupancy",
    label: "Shared-room occupancy",
    group: "Occupancy",
    description: "Occupancy of shared rooms and dormitories by room and sharing capacity.",
    financial: false,
    filters: OCC_FILTERS,
    columns: occCols([c("property", "Property", 24), c("room", "Room", 18), c("sharing", "Sharing"), c("ac", "AC")]),
    run: (f) => occupancy(f, "room", ["SHARED", "DORMITORY"]),
  },
  {
    key: "private-occupancy",
    label: "Private-room occupancy",
    group: "Occupancy",
    description: "Occupancy of private and family rooms.",
    financial: false,
    filters: OCC_FILTERS,
    columns: occCols([c("property", "Property", 24), c("room", "Room", 18), c("sharing", "Sharing"), c("ac", "AC")]),
    run: (f) => occupancy(f, "room", ["PRIVATE", "FAMILY"]),
  },
  {
    key: "ac-vs-nonac",
    label: "AC vs non-AC",
    group: "Occupancy",
    description: "Occupancy, bookings and revenue split by AC and non-AC rooms.",
    financial: false,
    filters: OCC_FILTERS,
    columns: occCols([c("ac", "Room type")]),
    run: (f) => occupancy(f, "ac"),
  },
  {
    key: "room-type",
    label: "Room-type performance",
    group: "Bookings",
    description: "Bookings, nights and revenue by room category, sharing capacity and AC.",
    financial: false,
    filters: ["date", "city", "property", "owner", "status", "unit"],
    columns: [c("category", "Category"), c("sharing", "Sharing"), c("ac", "AC"), c("bookings", "Bookings"), c("nights", "Nights"), m("roomRevenue", "Room revenue"), m("avgNightly", "Avg nightly / unit"), m("gbv", "Gross booking value")],
    run: (f) =>
      rows(
        sql`SELECT initcap(r.category::text) AS "category", r.sharing_capacity AS "sharing", CASE WHEN r.is_ac THEN 'AC' ELSE 'Non-AC' END AS "ac", count(*)::int AS "bookings", sum(b.nights)::int AS "nights", sum(b.room_charge)::bigint AS "roomRevenue",
          round(sum(b.room_charge)::numeric / NULLIF(sum(b.nights * GREATEST(b.beds_count, 1)), 0))::bigint AS "avgNightly", sum(b.total_amount - b.security_deposit)::bigint AS "gbv"
        ${BK_FROM} WHERE ${bookingConds(f)} AND b.status IN ${REVENUE_STATUSES} GROUP BY r.category, r.sharing_capacity, r.is_ac ORDER BY 1, 2, 3`,
        ["bookings", "nights", "roomRevenue", "avgNightly", "gbv"],
      ),
  },
  {
    key: "city-bookings",
    label: "City-wise bookings",
    group: "Bookings",
    description: "Bookings, nights, cancellations and value per city.",
    financial: false,
    filters: ["date", "city", "owner", "status", "category", "unit"],
    columns: [c("city", "City"), c("bookings", "Bookings"), c("nights", "Nights"), c("cancelled", "Cancelled"), m("gbv", "Gross booking value"), m("avg", "Avg booking value")],
    run: (f) =>
      rows(
        sql`SELECT c.name AS "city", count(*)::int AS "bookings", sum(b.nights)::int AS "nights", count(*) FILTER (WHERE b.cancelled_at IS NOT NULL)::int AS "cancelled", sum(b.total_amount - b.security_deposit)::bigint AS "gbv", round(avg(b.total_amount - b.security_deposit))::bigint AS "avg"
        ${BK_FROM} WHERE ${bookingConds(f)} AND b.status NOT IN ('PAYMENT_PENDING','INVENTORY_LOCKED') GROUP BY c.name ORDER BY 2 DESC`,
        ["bookings", "nights", "cancelled", "gbv", "avg"],
      ),
  },
  {
    key: "duration",
    label: "Duration-wise bookings",
    group: "Bookings",
    description: "Bookings grouped by length of stay (nightly, weekly, monthly, long stay).",
    financial: false,
    filters: ["date", "city", "property", "owner", "status", "category", "unit"],
    columns: [c("bucket", "Length of stay", 18), c("bookings", "Bookings"), c("nights", "Nights"), c("avgNights", "Avg nights"), m("gbv", "Gross booking value")],
    run: (f) =>
      rows(
        sql`SELECT CASE WHEN b.nights = 1 THEN '1 night' WHEN b.nights < 7 THEN '2–6 nights' WHEN b.nights < 30 THEN '7–29 nights (weekly)' WHEN b.nights < 90 THEN '30–89 nights (monthly)' ELSE '90+ nights (long stay)' END AS "bucket",
          min(b.nights) AS sort, count(*)::int AS "bookings", sum(b.nights)::int AS "nights", round(avg(b.nights), 1) AS "avgNights", sum(b.total_amount - b.security_deposit)::bigint AS "gbv"
        ${BK_FROM} WHERE ${bookingConds(f)} AND b.status NOT IN ('PAYMENT_PENDING','INVENTORY_LOCKED') GROUP BY 1 ORDER BY sort`,
        ["bookings", "nights", "avgNights", "gbv"],
      ),
  },
  {
    key: "revenue",
    label: "Revenue report",
    group: "Finance",
    description: "Daily gross booking value, taxes, convenience fees, commission and platform revenue.",
    financial: true,
    filters: ["date", "city", "property", "owner", "category", "unit"],
    columns: [c("date", "Date"), c("bookings", "Bookings"), m("gbv", "Gross booking value"), m("discounts", "Discounts"), m("tax", "GST on stay"), m("convenience", "Convenience fees"), m("commission", "Commission"), m("platformRevenue", "Platform revenue"), m("ownerPayable", "Owner payable"), m("refunded", "Refunded")],
    run: (f) =>
      rows(
        sql`SELECT to_char(${bookedOn}, 'YYYY-MM-DD') AS "date", count(*)::int AS "bookings", sum(b.total_amount - b.security_deposit)::bigint AS "gbv", sum(b.coupon_discount + b.promo_discount)::bigint AS "discounts", sum(b.tax_amount)::bigint AS "tax", sum(b.convenience_fee)::bigint AS "convenience",
          coalesce(sum(oe.commission), 0)::bigint AS "commission", (coalesce(sum(oe.commission), 0) + sum(b.convenience_fee))::bigint AS "platformRevenue", coalesce(sum(oe.net_payable), 0)::bigint AS "ownerPayable", sum(b.refunded_amount)::bigint AS "refunded"
        ${BK_FROM} LEFT JOIN owner_earnings oe ON oe.booking_id = b.id WHERE ${bookingConds(f)} AND b.status IN ${REVENUE_STATUSES} GROUP BY 1 ORDER BY 1`,
        ["bookings", "gbv", "discounts", "tax", "convenience", "commission", "platformRevenue", "ownerPayable", "refunded"],
      ),
  },
  {
    key: "property-earnings",
    label: "Property-wise earnings",
    group: "Finance",
    description: "Owner earnings per property: room revenue, commission, fees, net payable and paid out.",
    financial: true,
    filters: ["date", "city", "property", "owner"],
    columns: [c("property", "Property", 24), c("owner", "Owner", 18), c("bookings", "Bookings"), m("roomRevenue", "Room revenue"), m("commission", "Commission"), m("gatewayFee", "Gateway fee"), m("propertyDiscount", "Property discounts"), m("refundDeduction", "Refund deductions"), m("netPayable", "Net payable"), m("paid", "Paid out"), m("outstanding", "Outstanding")],
    run: (f) =>
      rows(
        sql`SELECT p.name AS "property", ow.name AS "owner", count(*)::int AS "bookings", sum(oe.room_revenue)::bigint AS "roomRevenue", sum(oe.commission)::bigint AS "commission", sum(oe.gateway_fee)::bigint AS "gatewayFee", sum(oe.property_discount)::bigint AS "propertyDiscount", sum(oe.refund_deduction)::bigint AS "refundDeduction",
          sum(oe.net_payable)::bigint AS "netPayable", coalesce(sum(oe.net_payable) FILTER (WHERE oe.status = 'PAID'), 0)::bigint AS "paid", coalesce(sum(oe.net_payable) FILTER (WHERE oe.status <> 'PAID' AND oe.status <> 'REVERSED'), 0)::bigint AS "outstanding"
        FROM owner_earnings oe JOIN bookings b ON b.id = oe.booking_id JOIN properties p ON p.id = oe.property_id JOIN cities c ON c.id = p.city_id JOIN rooms r ON r.id = b.room_id JOIN users ow ON ow.id = oe.owner_id
        WHERE ${bookingConds({ ...f, status: undefined })} GROUP BY p.name, ow.name ORDER BY "netPayable" DESC`,
        ["bookings", "roomRevenue", "commission", "gatewayFee", "propertyDiscount", "refundDeduction", "netPayable", "paid", "outstanding"],
      ),
  },
  {
    key: "commission",
    label: "Commission report",
    group: "Finance",
    description: "Commission earned per property with the effective rate.",
    financial: true,
    filters: ["date", "city", "property", "owner"],
    columns: [c("property", "Property", 24), c("city", "City"), c("bookings", "Bookings"), m("base", "Commissionable revenue"), pct("rate", "Avg rate %"), m("commission", "Commission")],
    run: (f) =>
      rows(
        sql`SELECT p.name AS "property", c.name AS "city", count(*)::int AS "bookings", sum(oe.room_revenue - oe.property_discount - oe.refund_deduction)::bigint AS "base", round(avg(oe.commission_bps) / 100.0, 2) AS "rate", sum(oe.commission)::bigint AS "commission"
        FROM owner_earnings oe JOIN bookings b ON b.id = oe.booking_id JOIN properties p ON p.id = oe.property_id JOIN cities c ON c.id = p.city_id JOIN rooms r ON r.id = b.room_id
        WHERE ${bookingConds({ ...f, status: undefined })} GROUP BY p.name, c.name ORDER BY "commission" DESC`,
        ["bookings", "base", "rate", "commission"],
      ),
  },
  {
    key: "tax",
    label: "Tax (GST) report",
    group: "Finance",
    description: "Monthly taxable value and GST collected, by effective rate. Verify filings with your CA.",
    financial: true,
    filters: ["date", "city", "property", "owner"],
    columns: [c("month", "Month"), pct("rate", "GST rate %"), c("bookings", "Bookings"), m("taxable", "Taxable value"), m("gst", "GST on stay"), m("convenience", "Convenience fees"), m("convenienceGst", "GST on convenience fee"), m("totalGst", "Total GST")],
    run: (f) =>
      rows(
        sql`WITH x AS (
          SELECT b.*, coalesce((b.price_breakdown->>'convenienceTax')::int, 0) AS conv_tax, ${bookedOn} AS d
          ${BK_FROM} WHERE ${bookingConds(f)} AND b.status IN ${REVENUE_STATUSES}
        )
        SELECT to_char(d, 'YYYY-MM') AS "month",
          CASE WHEN (total_amount - security_deposit - tax_amount - convenience_fee - conv_tax) > 0 THEN round(100.0 * tax_amount / (total_amount - security_deposit - tax_amount - convenience_fee - conv_tax)) ELSE 0 END AS "rate",
          count(*)::int AS "bookings", sum(total_amount - security_deposit - tax_amount - convenience_fee - conv_tax)::bigint AS "taxable", sum(tax_amount)::bigint AS "gst", sum(convenience_fee)::bigint AS "convenience", sum(conv_tax)::bigint AS "convenienceGst", sum(tax_amount + conv_tax)::bigint AS "totalGst"
        FROM x GROUP BY 1, 2 ORDER BY 1, 2`,
        ["rate", "bookings", "taxable", "gst", "convenience", "convenienceGst", "totalGst"],
      ),
  },
  {
    key: "payments",
    label: "Payment report",
    group: "Finance",
    description: "All payment attempts with provider references, method, fees and status.",
    financial: true,
    filters: ["date", "city", "property", "paymentStatus"],
    columns: [c("date", "Date", 16), c("bookingNumber", "Booking #", 22), c("customer", "Customer", 18), c("purpose", "Purpose"), c("provider", "Provider"), c("orderId", "Order id", 22), c("paymentId", "Payment id", 22), c("method", "Method"), m("amount", "Amount"), m("fee", "Gateway fee"), m("refunded", "Refunded"), c("status", "Status"), c("failure", "Failure reason", 20)],
    run: (f) =>
      rows(
        sql`SELECT to_char(pay.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS "date", b.booking_number AS "bookingNumber", coalesce(u.name, bu.name) AS "customer", pay.purpose AS "purpose", pay.provider AS "provider", pay.provider_order_id AS "orderId", pay.provider_payment_id AS "paymentId", pay.method AS "method", pay.amount AS "amount", pay.gateway_fee AS "fee", pay.refunded_amount AS "refunded", pay.status AS "status", pay.failure_reason AS "failure"
        FROM payments pay LEFT JOIN bookings b ON b.id = pay.booking_id LEFT JOIN properties p ON p.id = b.property_id LEFT JOIN users u ON u.id = pay.user_id LEFT JOIN users bu ON bu.id = b.customer_id
        WHERE ${and([
          sql`(pay.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${f.from}::date AND ${f.to}::date`,
          f.paymentStatus ? sql`pay.status::text = ${f.paymentStatus}` : null,
          f.cityId ? sql`p.city_id = ${f.cityId}::uuid` : null,
          f.propertyId ? sql`p.id = ${f.propertyId}::uuid` : null,
        ])} ORDER BY pay.created_at DESC LIMIT 5000`,
        ["amount", "fee", "refunded"],
      ),
  },
  {
    key: "refunds",
    label: "Refund report",
    group: "Finance",
    description: "Refunds requested and processed, with provider refund references.",
    financial: true,
    filters: ["date", "city", "property"],
    columns: [c("date", "Requested", 16), c("bookingNumber", "Booking #", 22), c("customer", "Customer", 18), c("kind", "Kind"), m("amount", "Amount"), c("status", "Status"), c("providerRefundId", "Provider refund id", 22), c("reason", "Reason", 24), c("processedAt", "Processed", 16)],
    run: (f) =>
      rows(
        sql`SELECT to_char(rf.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS "date", b.booking_number AS "bookingNumber", cu.name AS "customer", rf.kind AS "kind", rf.amount AS "amount", rf.status AS "status", rf.provider_refund_id AS "providerRefundId", rf.reason AS "reason", to_char(rf.processed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS "processedAt"
        FROM refunds rf JOIN bookings b ON b.id = rf.booking_id JOIN properties p ON p.id = b.property_id JOIN users cu ON cu.id = b.customer_id
        WHERE ${and([sql`(rf.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${f.from}::date AND ${f.to}::date`, f.cityId ? sql`p.city_id = ${f.cityId}::uuid` : null, f.propertyId ? sql`p.id = ${f.propertyId}::uuid` : null])}
        ORDER BY rf.created_at DESC LIMIT 5000`,
        ["amount"],
      ),
  },
  {
    key: "cancellations",
    label: "Cancellation report",
    group: "Bookings",
    description: "Cancellations with who cancelled, reason, refund and retained penalty.",
    financial: false,
    filters: ["date", "city", "property", "owner"],
    columns: [c("date", "Cancelled", 16), c("bookingNumber", "Booking #", 22), c("property", "Property", 22), c("customer", "Customer", 18), c("by", "Cancelled by"), c("reason", "Reason", 24), m("refund", "Refund"), m("penalty", "Retained"), c("status", "Status")],
    run: (f) =>
      rows(
        sql`SELECT to_char(cn.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS "date", b.booking_number AS "bookingNumber", p.name AS "property", cu.name AS "customer", cn.requested_role AS "by", cn.reason AS "reason", cn.refund_amount AS "refund", cn.penalty AS "penalty", cn.status AS "status"
        FROM cancellations cn JOIN bookings b ON b.id = cn.booking_id JOIN properties p ON p.id = b.property_id JOIN users cu ON cu.id = b.customer_id
        WHERE ${and([sql`(cn.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${f.from}::date AND ${f.to}::date`, f.cityId ? sql`p.city_id = ${f.cityId}::uuid` : null, f.propertyId ? sql`p.id = ${f.propertyId}::uuid` : null, f.ownerId ? sql`p.owner_id = ${f.ownerId}::uuid` : null])}
        ORDER BY cn.created_at DESC LIMIT 5000`,
        ["refund", "penalty"],
      ),
  },
  {
    key: "payouts",
    label: "Payout report",
    group: "Finance",
    description: "Owner payouts with deductions, status and bank reference / UTR.",
    financial: true,
    filters: ["date", "owner"],
    columns: [c("payoutNumber", "Payout #", 16), c("owner", "Owner", 20), c("business", "Business", 20), m("amount", "Amount"), m("deductions", "Deductions"), m("net", "Net paid"), c("status", "Status"), c("method", "Method"), c("reference", "Reference / UTR", 20), c("createdAt", "Created", 16), c("paidAt", "Paid", 16)],
    run: (f) =>
      rows(
        sql`SELECT po.payout_number AS "payoutNumber", u.name AS "owner", op.business_name AS "business", po.amount AS "amount", po.deductions AS "deductions", po.net_amount AS "net", po.status AS "status", po.method AS "method", po.reference AS "reference", to_char(po.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS "createdAt", to_char(po.paid_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS "paidAt"
        FROM payouts po JOIN users u ON u.id = po.owner_id LEFT JOIN owner_profiles op ON op.user_id = po.owner_id
        WHERE ${and([sql`(po.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${f.from}::date AND ${f.to}::date`, f.ownerId ? sql`po.owner_id = ${f.ownerId}::uuid` : null])} ORDER BY po.created_at DESC`,
        ["amount", "deductions", "net"],
      ),
  },
  {
    key: "customers",
    label: "Customer report",
    group: "Customers & partners",
    description: "Customers with bookings in the period: stays, nights and net spend.",
    financial: false,
    filters: ["date", "city", "property", "status"],
    columns: [c("customer", "Customer", 20), c("email", "Email", 24), c("phone", "Phone"), c("bookings", "Bookings"), c("nights", "Nights"), m("spend", "Net spend"), c("lastBooking", "Last booking"), c("status", "Account")],
    run: (f) =>
      rows(
        sql`SELECT cu.name AS "customer", cu.email AS "email", cu.phone AS "phone", count(*)::int AS "bookings", sum(b.nights)::int AS "nights", sum(b.paid_amount - b.refunded_amount)::bigint AS "spend", to_char(max(${bookedOn}), 'YYYY-MM-DD') AS "lastBooking", cu.status AS "status"
        ${BK_FROM} WHERE ${bookingConds(f)} GROUP BY cu.id ORDER BY "spend" DESC LIMIT 5000`,
        ["bookings", "nights", "spend"],
      ),
  },
  {
    key: "owners",
    label: "Property-owner report",
    group: "Customers & partners",
    description: "Partners with KYC/bank status, inventory, bookings and payout totals.",
    financial: true,
    filters: ["date", "city", "owner"],
    columns: [c("owner", "Owner", 20), c("business", "Business", 20), c("kyc", "KYC"), c("bank", "Bank verified"), c("properties", "Properties"), c("rooms", "Rooms"), c("bookings", "Bookings (period)"), m("gbv", "GBV (period)"), m("netPayable", "Net payable (period)"), m("paidTotal", "Paid out (all time)")],
    run: (f) =>
      rows(
        sql`SELECT u.name AS "owner", op.business_name AS "business", op.kyc_status AS "kyc", CASE WHEN op.bank_verified THEN 'Yes' ELSE 'No' END AS "bank",
          (SELECT count(*) FROM properties p WHERE p.owner_id = u.id AND p.deleted_at IS NULL ${f.cityId ? sql`AND p.city_id = ${f.cityId}::uuid` : sql``})::int AS "properties",
          (SELECT count(*) FROM rooms r JOIN properties p ON p.id = r.property_id WHERE p.owner_id = u.id AND r.deleted_at IS NULL)::int AS "rooms",
          (SELECT count(*) FROM bookings b JOIN properties p ON p.id = b.property_id WHERE p.owner_id = u.id AND b.status IN ${REVENUE_STATUSES} AND ${bookedOn} BETWEEN ${f.from}::date AND ${f.to}::date)::int AS "bookings",
          (SELECT coalesce(sum(b.total_amount - b.security_deposit), 0) FROM bookings b JOIN properties p ON p.id = b.property_id WHERE p.owner_id = u.id AND b.status IN ${REVENUE_STATUSES} AND ${bookedOn} BETWEEN ${f.from}::date AND ${f.to}::date)::bigint AS "gbv",
          (SELECT coalesce(sum(oe.net_payable), 0) FROM owner_earnings oe JOIN bookings b ON b.id = oe.booking_id WHERE oe.owner_id = u.id AND ${bookedOn} BETWEEN ${f.from}::date AND ${f.to}::date)::bigint AS "netPayable",
          (SELECT coalesce(sum(po.net_amount), 0) FROM payouts po WHERE po.owner_id = u.id AND po.status = 'PAID')::bigint AS "paidTotal"
        FROM owner_profiles op JOIN users u ON u.id = op.user_id WHERE ${f.ownerId ? sql`u.id = ${f.ownerId}::uuid` : sql`TRUE`} ORDER BY u.name`,
        ["properties", "rooms", "bookings", "gbv", "netPayable", "paidTotal"],
      ),
  },
  {
    key: "coupons",
    label: "Coupon report",
    group: "Engagement",
    description: "Coupon redemptions and total discount given in the period.",
    financial: false,
    filters: ["date"],
    columns: [c("code", "Code"), c("title", "Title", 22), c("type", "Type"), c("fundedBy", "Funded by"), c("uses", "Uses (period)"), m("discount", "Discount (period)"), c("usedTotal", "Used (all time)"), c("limit", "Usage limit"), c("active", "Active")],
    run: (f) =>
      rows(
        sql`SELECT cp.code AS "code", cp.title AS "title", cp.discount_type AS "type", cp.funded_by AS "fundedBy", count(cu.id)::int AS "uses", coalesce(sum(cu.discount), 0)::bigint AS "discount", cp.used_count AS "usedTotal", cp.usage_limit AS "limit", CASE WHEN cp.active THEN 'Yes' ELSE 'No' END AS "active"
        FROM coupons cp LEFT JOIN coupon_usage cu ON cu.coupon_id = cp.id AND (cu.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY cp.id ORDER BY "uses" DESC, cp.code`,
        ["uses", "discount", "usedTotal", "limit"],
      ),
  },
  {
    key: "reviews",
    label: "Review report",
    group: "Engagement",
    description: "Ratings per property for reviews written in the period.",
    financial: false,
    filters: ["date", "city", "property", "owner"],
    columns: [c("property", "Property", 24), c("city", "City"), c("reviews", "Reviews"), c("overall", "Overall"), c("cleanliness", "Cleanliness"), c("staff", "Staff"), c("value", "Value"), c("safety", "Safety"), c("hidden", "Hidden"), c("reported", "Reported")],
    run: (f) =>
      rows(
        sql`SELECT p.name AS "property", c.name AS "city", count(*)::int AS "reviews", round(avg(rv.overall), 2) AS "overall", round(avg(rv.cleanliness), 2) AS "cleanliness", round(avg(rv.staff), 2) AS "staff", round(avg(rv.value_for_money), 2) AS "value", round(avg(rv.safety), 2) AS "safety", count(*) FILTER (WHERE rv.status = 'HIDDEN')::int AS "hidden", count(*) FILTER (WHERE rv.report_count > 0)::int AS "reported"
        FROM reviews rv JOIN properties p ON p.id = rv.property_id JOIN cities c ON c.id = p.city_id
        WHERE ${and([sql`(rv.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${f.from}::date AND ${f.to}::date`, f.cityId ? sql`p.city_id = ${f.cityId}::uuid` : null, f.propertyId ? sql`p.id = ${f.propertyId}::uuid` : null, f.ownerId ? sql`p.owner_id = ${f.ownerId}::uuid` : null])}
        GROUP BY p.name, c.name ORDER BY "overall" DESC`,
        ["reviews", "overall", "cleanliness", "staff", "value", "safety", "hidden", "reported"],
      ),
  },
  {
    key: "support",
    label: "Support report",
    group: "Engagement",
    description: "Support tickets raised in the period with status and resolution time.",
    financial: false,
    filters: ["date", "status"],
    columns: [c("ticket", "Ticket #"), c("createdAt", "Created", 16), c("category", "Category"), c("priority", "Priority"), c("status", "Status"), c("subject", "Subject", 28), c("raisedBy", "Raised by", 18), c("assignee", "Assigned to", 18), c("resolutionHours", "Resolution (h)")],
    run: (f) =>
      rows(
        sql`SELECT t.ticket_number AS "ticket", to_char(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS "createdAt", t.category AS "category", t.priority AS "priority", t.status AS "status", t.subject AS "subject", ru.name AS "raisedBy", au.name AS "assignee", CASE WHEN t.resolved_at IS NOT NULL THEN round(extract(epoch FROM (t.resolved_at - t.created_at)) / 3600.0, 1) END AS "resolutionHours"
        FROM support_tickets t JOIN users ru ON ru.id = t.raised_by_id LEFT JOIN users au ON au.id = t.assigned_to_id
        WHERE ${and([sql`(t.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${f.from}::date AND ${f.to}::date`, f.status ? sql`t.status::text = ${f.status}` : null])} ORDER BY t.created_at DESC LIMIT 5000`,
        ["resolutionHours"],
      ),
  },
  {
    key: "subscriptions",
    label: "Subscription report",
    group: "Finance",
    description: "Customer and partner subscriptions started in the period with revenue.",
    financial: true,
    filters: ["date", "status"],
    columns: [c("user", "Subscriber", 20), c("email", "Email", 22), c("plan", "Plan", 18), c("audience", "Audience"), c("status", "Status"), c("startsAt", "Starts"), c("endsAt", "Ends"), m("pricePaid", "Price paid"), c("complimentary", "Complimentary")],
    run: (f) =>
      rows(
        sql`SELECT u.name AS "user", u.email AS "email", sp.name AS "plan", s.audience AS "audience", s.status AS "status", to_char(s.starts_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "startsAt", to_char(s.ends_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "endsAt", s.price_paid AS "pricePaid", CASE WHEN s.granted_by IS NOT NULL THEN 'Yes' ELSE 'No' END AS "complimentary"
        FROM subscriptions s JOIN users u ON u.id = s.user_id JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE ${and([sql`(s.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${f.from}::date AND ${f.to}::date`, f.status ? sql`s.status = ${f.status}` : null])} ORDER BY s.created_at DESC`,
        ["pricePaid"],
      ),
  },
];

export function getReport(key: string) {
  return REPORTS.find((r) => r.key === key) ?? null;
}

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Parse filters from URLSearchParams / record, applying defaults and basic validation. */
export function parseReportFilters(q: Record<string, string | undefined>): ReportFilters {
  const d = defaultFilters();
  let from = q.from && DATE.test(q.from) ? q.from : d.from;
  let to = q.to && DATE.test(q.to) ? q.to : d.to;
  if (from > to) [from, to] = [to, from];
  if (nightsBetween(from, to) > 3660) from = addDays(to, -3660);
  const id = (v?: string) => (v && UUID.test(v) ? v : undefined);
  const word = (v?: string) => (v && /^[A-Z_]{2,40}$/.test(v) ? v : undefined);
  return {
    from,
    to,
    cityId: id(q.city),
    propertyId: id(q.property),
    ownerId: id(q.owner),
    status: word(q.status),
    category: word(q.category),
    sharing: q.sharing && /^\d{1,2}$/.test(q.sharing) ? Number(q.sharing) : undefined,
    paymentStatus: word(q.paymentStatus),
    unit: q.unit === "BED" || q.unit === "ROOM" ? q.unit : undefined,
  };
}
