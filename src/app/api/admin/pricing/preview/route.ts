import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { properties, rooms } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { listNights, nightsBetween } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { buildQuote, loadRules, loadTaxRules, validateCoupon } from "@/services/pricing";
import { PricingError, quote, type CouponInput } from "@/services/pricing-engine";
import { planSchema } from "../../_lib/pricing";

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const body = z.object({
  roomId: z.string().uuid(),
  unit: z.enum(["BED", "ROOM"]),
  beds: z.number().int().min(1).max(50).default(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(20).default(0),
  services: z.array(z.enum(["FOOD", "LAUNDRY"])).default([]),
  couponCode: z.string().trim().max(30).nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  /** Unsaved plan from the editor — preview before saving. */
  draftPlan: planSchema.nullable().optional(),
});

/** Live price preview using the real pricing engine (saved plan via buildQuote, or a draft plan). */
export const POST = api(async (req) => {
  await requirePermission("pricing.manage", "properties.approve");
  const b = await parseBody(req, body);
  const bedIds = b.unit === "BED" ? Array(b.beds).fill(PLACEHOLDER) : [];
  if (!b.draftPlan) {
    const { quote: q } = await buildQuote({ roomId: b.roomId, unit: b.unit, bedIds, checkIn: b.checkIn, checkOut: b.checkOut, adults: b.adults, children: b.children, services: b.services, couponCode: b.couponCode || null, customerId: b.customerId ?? null });
    return q;
  }
  const [room] = await db.select().from(rooms).where(eq(rooms.id, b.roomId));
  if (!room) throw notFound("Room not found");
  const [property] = await db.select().from(properties).where(eq(properties.id, room.propertyId));
  if (!property) throw notFound();
  const n = nightsBetween(b.checkIn, b.checkOut);
  if (n < 1) throw badRequest("Check-out must be after check-in");
  const ctx = { cityId: property.cityId, localityId: property.localityId, propertyId: property.id, roomId: room.id, customerId: b.customerId ?? null, bedIds };
  const [rules, taxes, fees] = await Promise.all([loadRules(ctx, b.checkIn, b.checkOut), loadTaxRules(), getSettings(["fees.convenienceType", "fees.convenienceValue", "fees.convenienceTaxBps"])]);
  const { name: _n, ...plan } = b.draftPlan;
  void _n;
  const base = {
    plan,
    unit: b.unit,
    bedIds,
    roomCapacity: room.totalBeds,
    maxOccupancy: room.maxOccupancy,
    isAC: room.isAC,
    nights: listNights(b.checkIn, b.checkOut),
    adults: b.adults,
    children: b.children,
    services: b.services,
    context: ctx,
    rules,
    taxRules: taxes,
    membership: null,
    fees: { convenienceType: fees["fees.convenienceType"] as "FLAT" | "PERCENT", convenienceValue: fees["fees.convenienceValue"], convenienceTaxBps: fees["fees.convenienceTaxBps"] },
  };
  try {
    let coupon: CouponInput | null = null;
    if (b.couponCode) {
      const pre = quote({ ...base, coupon: null });
      coupon = await validateCoupon(b.couponCode, { userId: b.customerId ?? null, cityId: property.cityId, propertyId: property.id, nights: n, amount: pre.taxableAmount, unit: b.unit });
    }
    return quote({ ...base, coupon });
  } catch (e) {
    if (e instanceof PricingError) throw badRequest(e.message);
    throw e;
  }
});
