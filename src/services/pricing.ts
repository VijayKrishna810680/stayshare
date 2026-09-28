import "server-only";
import { and, count, desc, eq, inArray, isNull, lte, or, gte, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  bookings,
  couponUsage,
  coupons,
  durationPrices,
  pricePlans,
  pricingRules,
  properties,
  rooms,
  taxRules,
} from "@/db/schema";
import { badRequest, notFound } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { listNights, nightsBetween } from "@/lib/dates";
import {
  quote,
  type CouponInput,
  type PlanInput,
  type Quote,
  type RuleInput,
  type TaxRuleInput,
  type Unit,
  PricingError,
} from "./pricing-engine";

export async function getActivePlan(roomId: string, tx: Tx | typeof db = db) {
  const [plan] = await tx
    .select()
    .from(pricePlans)
    .where(and(eq(pricePlans.roomId, roomId), eq(pricePlans.active, true)))
    .orderBy(desc(pricePlans.effectiveFrom))
    .limit(1);
  if (!plan) return null;
  const dps = await tx.select().from(durationPrices).where(eq(durationPrices.pricePlanId, plan.id));
  return { ...plan, durationPrices: dps };
}

export function toPlanInput(p: NonNullable<Awaited<ReturnType<typeof getActivePlan>>>): PlanInput {
  return {
    nightlyBed: p.nightlyBed,
    nightlyRoom: p.nightlyRoom,
    weeklyBed: p.weeklyBed,
    weeklyRoom: p.weeklyRoom,
    monthlyBed: p.monthlyBed,
    monthlyRoom: p.monthlyRoom,
    extraAdultPerNight: p.extraAdultPerNight,
    childPerNight: p.childPerNight,
    acChargePerNight: p.acChargePerNight,
    foodPerPersonPerDay: p.foodPerPersonPerDay,
    laundryPerMonth: p.laundryPerMonth,
    cleaningFee: p.cleaningFee,
    securityDepositBed: p.securityDepositBed,
    securityDepositRoom: p.securityDepositRoom,
    durationPrices: p.durationPrices.map((d) => ({ unit: d.unit, nights: d.nights, totalPrice: d.totalPrice })),
  };
}

export async function loadRules(ctx: { cityId: string; localityId: string | null; propertyId: string; roomId: string; customerId: string | null; bedIds: string[] }, checkIn: string, checkOut: string) {
  const scopeConds = [
    eq(pricingRules.scope, "GLOBAL"),
    and(eq(pricingRules.scope, "CITY"), eq(pricingRules.scopeId, ctx.cityId)),
    and(eq(pricingRules.scope, "PROPERTY"), eq(pricingRules.scopeId, ctx.propertyId)),
    and(eq(pricingRules.scope, "ROOM"), eq(pricingRules.scopeId, ctx.roomId)),
  ];
  if (ctx.localityId) scopeConds.push(and(eq(pricingRules.scope, "LOCALITY"), eq(pricingRules.scopeId, ctx.localityId)));
  if (ctx.customerId) scopeConds.push(and(eq(pricingRules.scope, "CUSTOMER"), eq(pricingRules.scopeId, ctx.customerId)));
  if (ctx.bedIds.length) scopeConds.push(and(eq(pricingRules.scope, "BED"), inArray(pricingRules.scopeId, ctx.bedIds)));
  const rows = await db
    .select()
    .from(pricingRules)
    .where(
      and(
        eq(pricingRules.active, true),
        or(...scopeConds),
        or(isNull(pricingRules.startDate), lte(pricingRules.startDate, checkOut)),
        or(isNull(pricingRules.endDate), gte(pricingRules.endDate, checkIn)),
      ),
    );
  return rows.map<RuleInput>((r) => ({
    id: r.id,
    name: r.name,
    ruleType: r.ruleType,
    scope: r.scope,
    scopeId: r.scopeId,
    adjustmentType: r.adjustmentType,
    value: r.value,
    unit: r.unit,
    daysOfWeek: r.daysOfWeek ?? [],
    startDate: r.startDate,
    endDate: r.endDate,
    minNights: r.minNights,
    priority: r.priority,
  }));
}

export async function loadTaxRules(): Promise<TaxRuleInput[]> {
  const rows = await db.select().from(taxRules).where(eq(taxRules.active, true));
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    rateBps: r.rateBps,
    minNightly: r.minNightly,
    maxNightly: r.maxNightly,
    isExemptionRule: r.isExemptionRule,
    minNightsExempt: r.minNightsExempt,
    maxMonthlyExempt: r.maxMonthlyExempt,
    priority: r.priority,
  }));
}

/** Validate a coupon for a prospective booking; throws a friendly error when not applicable. */
export async function validateCoupon(
  code: string,
  ctx: { userId: string | null; cityId: string; propertyId: string; nights: number; amount: number; unit: Unit },
): Promise<CouponInput & { id: string }> {
  const [c] = await db.select().from(coupons).where(eq(coupons.code, code.trim().toUpperCase()));
  const now = new Date();
  if (!c || !c.active) throw badRequest("This coupon code is not valid");
  if (c.validFrom > now || c.validTo < now) throw badRequest("This coupon has expired or is not active yet");
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) throw badRequest("This coupon has reached its usage limit");
  if (c.cityId && c.cityId !== ctx.cityId) throw badRequest("This coupon is not valid in this city");
  if (c.propertyId && c.propertyId !== ctx.propertyId) throw badRequest("This coupon is not valid for this property");
  if (c.unit && c.unit !== ctx.unit) throw badRequest(c.unit === "BED" ? "This coupon is for bed bookings only" : "This coupon is for entire-room bookings only");
  if (ctx.nights < c.minNights) throw badRequest(`This coupon needs a minimum stay of ${c.minNights} nights`);
  if (ctx.amount < c.minBookingAmount) throw badRequest(`Minimum booking value for this coupon is ₹${c.minBookingAmount / 100}`);
  if (ctx.userId) {
    const [{ used }] = (await db
      .select({ used: count() })
      .from(couponUsage)
      .where(and(eq(couponUsage.couponId, c.id), eq(couponUsage.userId, ctx.userId)))) as [{ used: number }];
    if (used >= c.perUserLimit) throw badRequest("You have already used this coupon");
    if (c.firstBookingOnly) {
      const [{ n }] = (await db
        .select({ n: count() })
        .from(bookings)
        .where(and(eq(bookings.customerId, ctx.userId), inArray(bookings.status, ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "COMPLETED"])))) as [{ n: number }];
      if (n > 0) throw badRequest("This coupon is only for your first booking");
    }
  }
  return {
    id: c.id,
    code: c.code,
    discountType: c.discountType,
    value: c.value,
    maxDiscount: c.maxDiscount,
    fundedBy: c.fundedBy,
    nonRefundable: c.nonRefundable,
  };
}

export type QuoteRequest = {
  roomId: string;
  unit: Unit;
  bedIds: string[]; // resolved bed ids for BED bookings (can be placeholders of correct length for estimates)
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  services: string[];
  couponCode?: string | null;
  customerId: string | null;
};

export async function buildQuote(req: QuoteRequest): Promise<{ quote: Quote; coupon: (CouponInput & { id: string }) | null; room: typeof rooms.$inferSelect; property: typeof properties.$inferSelect }> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, req.roomId));
  if (!room || room.deletedAt) throw notFound("Room not found");
  const [property] = await db.select().from(properties).where(eq(properties.id, room.propertyId));
  if (!property) throw notFound("Property not found");
  const n = nightsBetween(req.checkIn, req.checkOut);
  if (n < 1) throw badRequest("Check-out must be after check-in");
  if (n < property.minStayNights) throw badRequest(`Minimum stay at this property is ${property.minStayNights} night(s)`);
  if (n > property.maxStayNights) throw badRequest(`Maximum stay at this property is ${property.maxStayNights} nights`);
  if (req.unit === "BED" && !room.allowBedBooking) throw badRequest("This room can only be booked as an entire room");
  if (req.unit === "ROOM" && !room.allowEntireRoomBooking) throw badRequest("This room is available per bed only");

  const plan = await getActivePlan(room.id);
  if (!plan) throw badRequest("This room is not open for booking yet (price pending approval)");
  const ctx = {
    cityId: property.cityId,
    localityId: property.localityId,
    propertyId: property.id,
    roomId: room.id,
    customerId: req.customerId,
    bedIds: req.bedIds,
  };
  const { getActiveBenefits } = await import("./subscriptions");
  const [rules, taxes, fees, member] = await Promise.all([
    loadRules(ctx, req.checkIn, req.checkOut),
    loadTaxRules(),
    getSettings(["fees.convenienceType", "fees.convenienceValue", "fees.convenienceTaxBps"]),
    getActiveBenefits(req.customerId, "CUSTOMER"),
  ]);
  const base = {
    plan: toPlanInput(plan),
    unit: req.unit,
    bedIds: req.bedIds,
    roomCapacity: room.totalBeds,
    maxOccupancy: room.maxOccupancy,
    isAC: room.isAC,
    nights: listNights(req.checkIn, req.checkOut),
    adults: req.adults,
    children: req.children,
    services: req.services,
    context: ctx,
    rules,
    taxRules: taxes,
    membership: member
      ? { planName: member.planName, discountBps: member.bookingDiscountBps ?? 0, maxDiscount: member.maxDiscountPerBooking ?? null, waiveConvenienceFee: Boolean(member.waiveConvenienceFee) }
      : null,
    fees: {
      convenienceType: fees["fees.convenienceType"] as "FLAT" | "PERCENT",
      convenienceValue: fees["fees.convenienceValue"],
      convenienceTaxBps: fees["fees.convenienceTaxBps"],
    },
  };
  try {
    let coupon: (CouponInput & { id: string }) | null = null;
    if (req.couponCode) {
      const pre = quote({ ...base, coupon: null });
      coupon = await validateCoupon(req.couponCode, {
        userId: req.customerId,
        cityId: property.cityId,
        propertyId: property.id,
        nights: n,
        amount: pre.taxableAmount,
        unit: req.unit,
      });
    }
    return { quote: quote({ ...base, coupon }), coupon, room, property };
  } catch (e) {
    if (e instanceof PricingError) throw badRequest(e.message);
    throw e;
  }
}

/** Lowest approved nightly price among a property's approved rooms — used for listing cards & sorting. */
export async function refreshStartingPrice(propertyId: string) {
  const res = await db.execute<{ min: number | null }>(sql`
    SELECT MIN(LEAST(
      COALESCE(pp.nightly_bed, 2147483647),
      COALESCE(pp.nightly_room, 2147483647),
      COALESCE(pp.monthly_bed / 30, 2147483647),
      COALESCE(pp.monthly_room / 30, 2147483647)
    )) AS min
    FROM price_plans pp JOIN rooms r ON r.id = pp.room_id
    WHERE r.property_id = ${propertyId} AND pp.active = true AND r.approval_status = 'APPROVED' AND r.active = true AND r.deleted_at IS NULL`);
  let min = res.rows[0]?.min ?? null;
  if (min !== null && Number(min) >= 2147483647) min = null;
  await db.update(properties).set({ startingPrice: min === null ? null : Number(min) }).where(eq(properties.id, propertyId));
}
