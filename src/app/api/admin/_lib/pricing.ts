import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { durationPrices, pricePlans, rooms } from "@/db/schema";
import { badRequest, notFound } from "@/lib/errors";
import { getActivePlan, refreshStartingPrice } from "@/services/pricing";
import { recordPriceChanges } from "./util";

const money = z.number().int().min(0).max(100_000_000);
const optMoney = money.nullable();

export const planSchema = z.object({
  name: z.string().trim().min(1).max(80).default("Standard"),
  nightlyBed: optMoney,
  nightlyRoom: optMoney,
  weeklyBed: optMoney,
  weeklyRoom: optMoney,
  monthlyBed: optMoney,
  monthlyRoom: optMoney,
  extraAdultPerNight: money.default(0),
  childPerNight: money.default(0),
  acChargePerNight: money.default(0),
  foodPerPersonPerDay: money.default(0),
  laundryPerMonth: money.default(0),
  cleaningFee: money.default(0),
  securityDepositBed: money.default(0),
  securityDepositRoom: money.default(0),
  durationPrices: z
    .array(z.object({ unit: z.enum(["BED", "ROOM"]), nights: z.number().int().min(1).max(365), totalPrice: money.min(1) }))
    .max(40)
    .default([]),
});
export type PlanValues = z.infer<typeof planSchema>;

export const PLAN_FIELDS = [
  "nightlyBed",
  "nightlyRoom",
  "weeklyBed",
  "weeklyRoom",
  "monthlyBed",
  "monthlyRoom",
  "extraAdultPerNight",
  "childPerNight",
  "acChargePerNight",
  "foodPerPersonPerDay",
  "laundryPerMonth",
  "cleaningFee",
  "securityDepositBed",
  "securityDepositRoom",
] as const;

function hasUnitPrice(p: PlanValues, unit: "BED" | "ROOM") {
  const [n, w, m] = unit === "BED" ? [p.nightlyBed, p.weeklyBed, p.monthlyBed] : [p.nightlyRoom, p.weeklyRoom, p.monthlyRoom];
  return Boolean(n || w || m || p.durationPrices.some((d) => d.unit === unit));
}

/** Throws a friendly error when a plan would leave a bookable unit without any price. */
export function validatePlan(p: PlanValues, room: { allowBedBooking: boolean; allowEntireRoomBooking: boolean }) {
  if (!room.allowBedBooking && !room.allowEntireRoomBooking) throw badRequest("Enable bed booking or entire-room booking for this room");
  if (room.allowBedBooking && !hasUnitPrice(p, "BED")) throw badRequest("Bed booking is enabled — enter at least one bed price (nightly, weekly, monthly or a package)");
  if (room.allowEntireRoomBooking && !hasUnitPrice(p, "ROOM")) throw badRequest("Entire-room booking is enabled — enter at least one entire-room price (nightly, weekly, monthly or a package)");
  const seen = new Set<string>();
  for (const d of p.durationPrices) {
    const k = `${d.unit}:${d.nights}`;
    if (seen.has(k)) throw badRequest(`Duplicate ${d.nights}-night ${d.unit.toLowerCase()} package`);
    seen.add(k);
  }
}

const dpKey = (d: { unit: string; nights: number }) => `duration.${d.unit}.${d.nights}`;

/**
 * Create a new ACTIVE price plan for a room (previous active plan is deactivated with effectiveTo),
 * record every changed value in price_history (reason required) and refresh the property's starting price.
 */
export async function savePricePlan(
  roomId: string,
  values: PlanValues,
  actorId: string,
  opts: { reason: string; effectiveFrom?: Date | null; effectiveTo?: Date | null; roomFlags?: { allowBedBooking?: boolean; allowEntireRoomBooking?: boolean } },
) {
  if (!opts.reason || opts.reason.trim().length < 3) throw badRequest("A reason is required for every price change");
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room || room.deletedAt) throw notFound("Room not found");
  const flags = { allowBedBooking: opts.roomFlags?.allowBedBooking ?? room.allowBedBooking, allowEntireRoomBooking: opts.roomFlags?.allowEntireRoomBooking ?? room.allowEntireRoomBooking };
  validatePlan(values, flags);
  const old = await getActivePlan(roomId);
  const effectiveFrom = opts.effectiveFrom ?? new Date();
  const plan = await db.transaction(async (tx) => {
    if (opts.roomFlags && (flags.allowBedBooking !== room.allowBedBooking || flags.allowEntireRoomBooking !== room.allowEntireRoomBooking)) {
      await tx.update(rooms).set({ ...flags, updatedBy: actorId }).where(eq(rooms.id, roomId));
    }
    await tx
      .update(pricePlans)
      .set({ active: false, effectiveTo: new Date(), updatedBy: actorId })
      .where(and(eq(pricePlans.roomId, roomId), eq(pricePlans.active, true)));
    const { durationPrices: dps, ...rest } = values;
    const [plan] = await tx
      .insert(pricePlans)
      .values({ ...rest, roomId, active: true, effectiveFrom, effectiveTo: opts.effectiveTo ?? null, approvedBy: actorId, createdBy: actorId, updatedBy: actorId })
      .returning();
    if (dps.length) await tx.insert(durationPrices).values(dps.map((d) => ({ ...d, pricePlanId: plan!.id })));
    const before: Record<string, unknown> = old ? Object.fromEntries(PLAN_FIELDS.map((f) => [f, old[f]])) : {};
    const after: Record<string, unknown> = Object.fromEntries(PLAN_FIELDS.map((f) => [f, rest[f]]));
    for (const d of old?.durationPrices ?? []) before[dpKey(d)] = d.totalPrice;
    for (const d of dps) after[dpKey(d)] = d.totalPrice;
    for (const k of Object.keys(before)) if (k.startsWith("duration.") && !(k in after)) after[k] = null;
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    await recordPriceChanges({ entityType: "ROOM", entityId: roomId, before, after, fields, changedBy: actorId, reason: opts.reason, effectiveFrom, effectiveTo: opts.effectiveTo ?? null }, tx);
    return plan!;
  });
  await refreshStartingPrice(room.propertyId);
  return { plan, previousPlanId: old?.id ?? null, propertyId: room.propertyId };
}

export function planToValues(p: NonNullable<Awaited<ReturnType<typeof getActivePlan>>>): PlanValues {
  return {
    name: p.name,
    ...(Object.fromEntries(PLAN_FIELDS.map((f) => [f, p[f]])) as Omit<PlanValues, "name" | "durationPrices">),
    durationPrices: p.durationPrices.map((d) => ({ unit: d.unit, nights: d.nights, totalPrice: d.totalPrice })),
  };
}

/** Scale base prices (nightly/weekly/monthly/packages) by bps, rounding to whole rupees. */
export function scalePlan(v: PlanValues, bps: number, includeExtras: boolean): PlanValues {
  const f = (x: number | null) => (x == null ? null : Math.max(100, Math.round((x * (10000 + bps)) / 10000 / 100) * 100));
  const g = (x: number) => (includeExtras ? Math.max(0, Math.round((x * (10000 + bps)) / 10000 / 100) * 100) : x);
  return {
    ...v,
    nightlyBed: f(v.nightlyBed),
    nightlyRoom: f(v.nightlyRoom),
    weeklyBed: f(v.weeklyBed),
    weeklyRoom: f(v.weeklyRoom),
    monthlyBed: f(v.monthlyBed),
    monthlyRoom: f(v.monthlyRoom),
    extraAdultPerNight: g(v.extraAdultPerNight),
    childPerNight: g(v.childPerNight),
    acChargePerNight: g(v.acChargePerNight),
    foodPerPersonPerDay: g(v.foodPerPersonPerDay),
    laundryPerMonth: g(v.laundryPerMonth),
    cleaningFee: g(v.cleaningFee),
    durationPrices: v.durationPrices.map((d) => ({ ...d, totalPrice: f(d.totalPrice)! })),
  };
}
