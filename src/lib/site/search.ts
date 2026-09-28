import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { roomsAvailability, sweepExpiredHolds } from "@/services/availability";
import { nightsBetween, todayIST } from "@/lib/dates";

/** Search parameters shared by the /search page and GET /api/search. */
export const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(60).optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  guests: z.coerce.number().int().min(1).max(20).optional(),
  type: z.enum(["PRIVATE", "SHARED", "FAMILY"]).optional(),
  ac: z.enum(["1", "0"]).optional(),
  sharing: z.coerce.number().int().min(1).max(6).optional(),
  gender: z.enum(["MALE_ONLY", "FEMALE_ONLY", "MIXED", "FAMILY"]).optional(),
  facilities: z.string().max(200).optional(), // comma list: WIFI,PARKING,LAUNDRY,KITCHEN,ATTACHED_BATH,FOOD
  minPrice: z.coerce.number().int().min(0).optional(), // rupees
  maxPrice: z.coerce.number().int().min(0).optional(), // rupees
  rating: z.coerce.number().min(0).max(5).optional(),
  ptype: z.string().max(40).optional(),
  minStay: z.coerce.number().int().min(1).max(365).optional(), // property's minimum stay must be ≤ this
  instant: z.enum(["1"]).optional(),
  refundable: z.enum(["1"]).optional(),
  stay: z.enum(["monthly", "nightly"]).optional(),
  audience: z.enum(["STUDENTS", "WORKING_PROFESSIONALS", "FAMILIES", "TRAVELLERS"]).optional(),
  featured: z.enum(["1"]).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  sort: z.enum(["recommended", "price_asc", "price_desc", "rating", "nearest", "popular", "newest"]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});
export type SearchParams = z.infer<typeof searchSchema>;

export type ListingCard = {
  id: string;
  slug: string;
  name: string;
  city: string;
  citySlug: string;
  locality: string | null;
  landmark: string | null;
  propertyType: string;
  gender: string;
  ratingAvg: number;
  reviewCount: number;
  bookingCount: number;
  isFeatured: boolean;
  instantBooking: boolean;
  foodIncluded: boolean;
  image: string | null;
  fromNightly: number | null; // paise
  fromMonthly: number | null; // paise
  categories: string[];
  hasAC: boolean;
  hasNonAC: boolean;
  facilityKeys: string[];
  distanceKm: number | null;
  availableBeds: number | null; // only when dates are given
  roomIds: string[];
};

const MAX = 2147483647;
const FACILITY_KEYS = ["WIFI", "PARKING", "LAUNDRY", "KITCHEN", "ATTACHED_BATH", "FOOD"] as const;

/** Parse a Next.js searchParams object into validated search params (invalid keys are dropped). */
export function parseSearchParams(raw: Record<string, string | string[] | undefined>): SearchParams {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && val !== "") flat[k] = val;
  }
  const out: Record<string, unknown> = {};
  const shape = searchSchema.shape as Record<string, z.ZodTypeAny>;
  for (const [k, v] of Object.entries(flat)) {
    const s = shape[k];
    if (!s) continue;
    const r = s.safeParse(v);
    if (r.success && r.data !== undefined) out[k] = r.data;
  }
  return out as SearchParams;
}

export async function searchProperties(p: SearchParams, opts: { ids?: string[] } = {}): Promise<{ items: ListingCard[]; total: number; page: number; pageSize: number; datesApplied: boolean }> {
  const page = p.page ?? 1;
  const pageSize = p.pageSize ?? 12;
  const facilities = (p.facilities ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is (typeof FACILITY_KEYS)[number] => (FACILITY_KEYS as readonly string[]).includes(s));

  // ── room-level conditions ──
  const roomConds: SQL[] = [sql`r.approval_status = 'APPROVED'`, sql`r.active = true`, sql`r.deleted_at IS NULL`, sql`r.maintenance_status = 'OK'`];
  if (p.type === "PRIVATE") roomConds.push(sql`r.category = 'PRIVATE'`);
  if (p.type === "SHARED") roomConds.push(sql`r.category IN ('SHARED','DORMITORY')`);
  if (p.type === "FAMILY") roomConds.push(sql`r.category = 'FAMILY'`);
  if (p.ac === "1") roomConds.push(sql`r.is_ac = true`);
  if (p.ac === "0") roomConds.push(sql`r.is_ac = false`);
  if (p.sharing) roomConds.push(p.sharing >= 6 ? sql`r.sharing_capacity >= 6` : sql`r.sharing_capacity = ${p.sharing}`);
  if (facilities.includes("ATTACHED_BATH")) roomConds.push(sql`r.bathroom = 'ATTACHED'`);
  if (p.guests) roomConds.push(sql`(r.max_occupancy >= ${p.guests} OR (r.allow_bed_booking AND r.total_beds >= ${p.guests}))`);
  if (p.stay === "monthly") roomConds.push(sql`(pp.monthly_bed IS NOT NULL OR pp.monthly_room IS NOT NULL)`);
  if (p.stay === "nightly") roomConds.push(sql`(pp.nightly_bed IS NOT NULL OR pp.nightly_room IS NOT NULL)`);
  const monthlyMode = p.stay === "monthly";
  const priceExpr = monthlyMode
    ? sql`LEAST(COALESCE(pp.monthly_bed, ${MAX}), COALESCE(pp.monthly_room, ${MAX}))`
    : sql`LEAST(COALESCE(pp.nightly_bed, ${MAX}), COALESCE(pp.nightly_room, ${MAX}), COALESCE(pp.monthly_bed / 30, ${MAX}), COALESCE(pp.monthly_room / 30, ${MAX}))`;
  if (p.minPrice) roomConds.push(sql`${priceExpr} >= ${p.minPrice * 100}`);
  if (p.maxPrice) roomConds.push(sql`${priceExpr} <= ${p.maxPrice * 100}`);

  // ── property-level conditions ──
  const propConds: SQL[] = [sql`p.approval_status = 'APPROVED'`, sql`p.active = true`, sql`p.blocked = false`, sql`p.deleted_at IS NULL`];
  if (p.city) propConds.push(sql`c.slug = ${p.city.toLowerCase()}`);
  if (p.q) {
    const like = `%${p.q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
    propConds.push(sql`(p.name ILIKE ${like} OR c.name ILIKE ${like} OR l.name ILIKE ${like} OR p.landmark ILIKE ${like} OR p.address_line ILIKE ${like} OR p.postal_code ILIKE ${like} OR pt.name ILIKE ${like})`);
  }
  if (p.gender) propConds.push(sql`p.gender_eligibility = ${p.gender}`);
  if (p.rating) propConds.push(sql`p.rating_avg >= ${p.rating}`);
  if (p.ptype) propConds.push(sql`pt.key = ${p.ptype}`);
  if (p.minStay) propConds.push(sql`p.min_stay_nights <= ${p.minStay}`);
  if (p.instant) propConds.push(sql`p.instant_booking = true`);
  if (p.refundable) propConds.push(sql`(cp.key IS NULL OR cp.key <> 'NON_REFUNDABLE')`);
  if (p.audience) propConds.push(sql`p.target_audience @> ${JSON.stringify([p.audience])}::jsonb`);
  if (p.featured) propConds.push(sql`p.is_featured = true`);
  if (opts.ids) propConds.push(opts.ids.length ? sql`p.id IN (${sql.join(opts.ids.map((id) => sql`${id}::uuid`), sql`, `)})` : sql`false`);
  for (const f of facilities) {
    if (f === "ATTACHED_BATH") continue;
    const facilityExists = sql`EXISTS (SELECT 1 FROM property_facilities pf JOIN facilities f ON f.id = pf.facility_id WHERE pf.property_id = p.id AND pf.status = 'APPROVED' AND f.key = ${f})`;
    if (f === "FOOD") propConds.push(sql`(p.food_included = true OR ${facilityExists})`);
    else propConds.push(facilityExists);
  }
  if (p.checkIn && p.checkOut && nightsBetween(p.checkIn, p.checkOut) > 0) {
    const n = nightsBetween(p.checkIn, p.checkOut);
    propConds.push(sql`p.min_stay_nights <= ${n} AND p.max_stay_nights >= ${n}`);
  }

  const hasGeo = p.lat !== undefined && p.lng !== undefined;
  const distance = hasGeo
    ? sql`CASE WHEN p.latitude IS NULL OR p.longitude IS NULL THEN NULL ELSE 6371 * acos(LEAST(1, GREATEST(-1, cos(radians(${p.lat})) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(${p.lng})) + sin(radians(${p.lat})) * sin(radians(p.latitude))))) END`
    : sql`NULL::double precision`;

  const sort = p.sort ?? (hasGeo ? "nearest" : "recommended");
  const priceCol = monthlyMode ? sql`agg.min_monthly` : sql`agg.min_nightly`;
  const orderBy =
    sort === "price_asc"
      ? sql`${priceCol} ASC NULLS LAST, p.rating_avg DESC`
      : sort === "price_desc"
        ? sql`${priceCol} DESC NULLS LAST`
        : sort === "rating"
          ? sql`p.rating_avg DESC, p.review_count DESC`
          : sort === "popular"
            ? sql`p.booking_count DESC, p.rating_avg DESC`
            : sort === "newest"
              ? sql`COALESCE(p.approved_at, p.created_at) DESC`
              : sort === "nearest" && hasGeo
                ? sql`distance_km ASC NULLS LAST`
                : sql`p.is_featured DESC, (p.rating_avg * LN(p.review_count + 2)) DESC, p.booking_count DESC`;

  const datesApplied = Boolean(p.checkIn && p.checkOut && p.checkOut > p.checkIn && p.checkIn >= todayIST());
  const paginateInSql = !datesApplied;
  const limitClause = paginateInSql ? sql`LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}` : sql`LIMIT 400`;

  const q = sql`
    WITH matching AS (
      SELECT r.property_id, r.id AS room_id, r.category, r.is_ac,
        NULLIF(LEAST(COALESCE(pp.nightly_bed, ${MAX}), COALESCE(pp.nightly_room, ${MAX})), ${MAX}) AS nightly,
        NULLIF(LEAST(COALESCE(pp.monthly_bed, ${MAX}), COALESCE(pp.monthly_room, ${MAX})), ${MAX}) AS monthly
      FROM rooms r
      JOIN price_plans pp ON pp.room_id = r.id AND pp.active = true
      WHERE ${sql.join(roomConds, sql` AND `)}
    ),
    agg AS (
      SELECT property_id, MIN(nightly) AS min_nightly, MIN(monthly) AS min_monthly,
        array_agg(DISTINCT room_id::text) AS room_ids,
        array_agg(DISTINCT category::text) AS categories,
        bool_or(is_ac) AS has_ac, bool_or(NOT is_ac) AS has_non_ac
      FROM matching GROUP BY property_id
    )
    SELECT p.id, p.slug, p.name, c.name AS city, c.slug AS city_slug, l.name AS locality, p.landmark, pt.name AS property_type,
      p.gender_eligibility AS gender, p.rating_avg, p.review_count, p.booking_count, p.is_featured, p.instant_booking, p.food_included,
      agg.min_nightly, agg.min_monthly, agg.room_ids, agg.categories, agg.has_ac, agg.has_non_ac,
      (SELECT url FROM property_images pi WHERE pi.property_id = p.id AND pi.status = 'APPROVED' ORDER BY pi.is_cover DESC, pi.sort_order ASC LIMIT 1) AS image,
      (SELECT COALESCE(array_agg(f.key), '{}') FROM property_facilities pf JOIN facilities f ON f.id = pf.facility_id WHERE pf.property_id = p.id AND pf.status = 'APPROVED') AS facility_keys,
      ${distance} AS distance_km,
      COUNT(*) OVER() AS total_count
    FROM properties p
    JOIN agg ON agg.property_id = p.id
    JOIN cities c ON c.id = p.city_id
    JOIN property_types pt ON pt.id = p.property_type_id
    LEFT JOIN localities l ON l.id = p.locality_id
    LEFT JOIN cancellation_policies cp ON cp.id = p.cancellation_policy_id
    WHERE ${sql.join(propConds, sql` AND `)}
    ORDER BY ${orderBy}
    ${limitClause}`;

  const res = await db.execute<Record<string, unknown>>(q);
  let items: ListingCard[] = res.rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    city: String(r.city),
    citySlug: String(r.city_slug),
    locality: (r.locality as string) ?? null,
    landmark: (r.landmark as string) ?? null,
    propertyType: String(r.property_type),
    gender: String(r.gender),
    ratingAvg: Number(r.rating_avg ?? 0),
    reviewCount: Number(r.review_count ?? 0),
    bookingCount: Number(r.booking_count ?? 0),
    isFeatured: Boolean(r.is_featured),
    instantBooking: Boolean(r.instant_booking),
    foodIncluded: Boolean(r.food_included),
    image: (r.image as string) ?? null,
    fromNightly: r.min_nightly == null ? null : Number(r.min_nightly),
    fromMonthly: r.min_monthly == null ? null : Number(r.min_monthly),
    categories: (r.categories as string[]) ?? [],
    hasAC: Boolean(r.has_ac),
    hasNonAC: Boolean(r.has_non_ac),
    facilityKeys: (r.facility_keys as string[]) ?? [],
    distanceKm: r.distance_km == null ? null : Number(r.distance_km),
    availableBeds: null,
    roomIds: (r.room_ids as string[]) ?? [],
  }));
  let total = res.rows.length ? Number(res.rows[0]!.total_count) : 0;

  if (datesApplied) {
    await sweepExpiredHolds();
    const allRooms = items.flatMap((i) => i.roomIds);
    const avail = await roomsAvailability(allRooms, p.checkIn!, p.checkOut!);
    const need = p.guests ?? 1;
    items = items
      .map((i) => ({ ...i, availableBeds: i.roomIds.reduce((a, id) => a + (avail.get(id)?.availableBeds ?? 0), 0) }))
      .filter((i) => (i.availableBeds ?? 0) >= Math.min(need, 1) && i.roomIds.some((id) => (avail.get(id)?.availableBeds ?? 0) >= 1));
    total = items.length;
    items = items.slice((page - 1) * pageSize, page * pageSize);
  }
  return { items, total, page, pageSize, datesApplied };
}

/** Convenience for home-page rails. */
export async function listingRail(p: SearchParams, limit = 8) {
  const { items } = await searchProperties({ ...p, pageSize: limit, page: 1 });
  return items;
}
