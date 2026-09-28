import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { addDays } from "@/lib/dates";

const ACTIVE = sql.raw(`('CONFIRMED','CHECK_IN_PENDING','CHECKED_IN')`);
const REVENUE = sql.raw(`('CONFIRMED','CHECK_IN_PENDING','CHECKED_IN','CHECKED_OUT','COMPLETED','CANCELLED','REFUND_PENDING','PARTIALLY_REFUNDED','REFUNDED','NO_SHOW')`);
const STAYED = sql.raw(`('CONFIRMED','CHECK_IN_PENDING','CHECKED_IN','CHECKED_OUT','COMPLETED')`);
const bookedOn = sql.raw(`((coalesce(b.confirmed_at, b.created_at) AT TIME ZONE 'Asia/Kolkata')::date)`);

async function one<T extends Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T> {
  const r = await db.execute(q);
  const row = (r.rows[0] ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? 0 : Number(v)])) as T;
}


export async function loadDashboard(today: string) {
  const since = addDays(today, -29);
  const [k, series, topCities, topProps] = await Promise.all([
    one<Record<string, number>>(sql`SELECT
      (SELECT count(*) FROM users WHERE deleted_at IS NULL) AS users,
      (SELECT count(DISTINCT ur.user_id) FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ro.key = 'OWNER') AS owners,
      (SELECT count(*) FROM properties WHERE deleted_at IS NULL) AS properties,
      (SELECT count(*) FROM properties WHERE deleted_at IS NULL AND approval_status IN ('PENDING','CHANGES_REQUESTED')) AS pending_props,
      (SELECT count(*) FROM rooms WHERE deleted_at IS NULL AND approval_status = 'PENDING') AS pending_rooms,
      (SELECT count(*) FROM rooms WHERE deleted_at IS NULL) AS rooms,
      (SELECT count(*) FROM beds WHERE deleted_at IS NULL AND active) AS beds,
      (SELECT count(*) FROM bookings b WHERE b.status IN ${ACTIVE}) AS active_bookings,
      (SELECT count(*) FROM bookings b WHERE b.status IN ('COMPLETED','CHECKED_OUT')) AS completed,
      (SELECT count(*) FROM bookings b WHERE b.cancelled_at IS NOT NULL OR b.status IN ('CANCELLED','REFUNDED','PARTIALLY_REFUNDED','REFUND_PENDING')) AS cancelled,
      (SELECT count(*) FROM bookings b WHERE ${bookedOn} = ${today}::date AND b.status NOT IN ('DRAFT','PAYMENT_PENDING','INVENTORY_LOCKED')) AS today_bookings,
      (SELECT count(*) FROM bookings b WHERE b.check_in = ${today}::date AND b.status IN ('CONFIRMED','CHECK_IN_PENDING','CHECKED_IN')) AS today_checkins,
      (SELECT count(*) FROM bookings b WHERE b.check_out = ${today}::date AND b.status IN ('CHECKED_IN','CHECKED_OUT','COMPLETED')) AS today_checkouts,
      (SELECT coalesce(sum(b.total_amount - b.security_deposit), 0) FROM bookings b WHERE b.status IN ${REVENUE}) AS gbv,
      (SELECT coalesce(sum(oe.commission), 0) FROM owner_earnings oe JOIN bookings b ON b.id = oe.booking_id WHERE b.status IN ${REVENUE}) AS commission,
      (SELECT coalesce(sum(b.convenience_fee), 0) FROM bookings b WHERE b.status IN ${REVENUE}) AS convenience,
      (SELECT coalesce(sum(net_payable), 0) FROM owner_earnings WHERE status IN ('PENDING','ELIGIBLE','ON_HOLD','IN_PAYOUT')) AS owner_payable,
      (SELECT coalesce(sum(amount), 0) FROM refunds WHERE status IN ('COMPLETED','PROCESSING')) AS refunded,
      (SELECT count(*) FROM refunds WHERE status = 'REQUESTED') AS refund_requests,
      (SELECT count(*) FROM payments WHERE status = 'FAILED') AS failed_payments,
      (SELECT count(*) FROM support_tickets WHERE status NOT IN ('RESOLVED','CLOSED')) AS open_tickets,
      (SELECT count(*) FROM chat_conversations WHERE status = 'OPEN') AS open_chats,
      (SELECT coalesce(sum(unread_for_agent), 0) FROM chat_conversations WHERE status = 'OPEN') AS unread_chats,
      (SELECT coalesce(sum(CASE WHEN b.unit = 'ROOM' THEN r.total_beds ELSE b.beds_count END), 0) FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.status IN ${STAYED} AND b.check_in <= ${today}::date AND b.check_out > ${today}::date) AS occupied_beds,
      (SELECT count(*) FROM beds bd JOIN rooms r ON r.id = bd.room_id JOIN properties p ON p.id = r.property_id WHERE bd.active AND bd.deleted_at IS NULL AND r.approval_status = 'APPROVED' AND r.active AND p.approval_status = 'APPROVED' AND p.active AND NOT p.blocked) AS live_beds
    `),
    db.execute(sql`
      WITH d AS (SELECT generate_series(${since}::date, ${today}::date, interval '1 day')::date AS day)
      SELECT to_char(d.day, 'DD Mon') AS label, count(b.id)::int AS bookings, coalesce(sum(b.total_amount - b.security_deposit), 0)::bigint AS gbv,
        coalesce(sum(b.convenience_fee), 0)::bigint + coalesce(sum(oe.commission), 0)::bigint AS revenue
      FROM d LEFT JOIN bookings b ON ${bookedOn} = d.day AND b.status IN ${REVENUE}
      LEFT JOIN owner_earnings oe ON oe.booking_id = b.id
      GROUP BY d.day ORDER BY d.day`),
    db.execute(sql`SELECT c.name AS label, count(b.id)::int AS value FROM bookings b JOIN properties p ON p.id = b.property_id JOIN cities c ON c.id = p.city_id WHERE b.status IN ${REVENUE} GROUP BY c.name ORDER BY 2 DESC LIMIT 6`),
    db.execute(sql`SELECT p.name AS label, coalesce(sum(b.total_amount - b.security_deposit), 0)::bigint AS value FROM bookings b JOIN properties p ON p.id = b.property_id WHERE b.status IN ${REVENUE} GROUP BY p.name ORDER BY 2 DESC LIMIT 6`),
  ]);
  return { k, series: series.rows as { label: string; bookings: number; gbv: string; revenue: string }[], topCities: topCities.rows, topProps: topProps.rows };
}
