import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { coupons } from "@/db/schema";

export async function publicCoupons() {
  const now = new Date();
  return db
    .select({ code: coupons.code, title: coupons.title, description: coupons.description, discountType: coupons.discountType, value: coupons.value, maxDiscount: coupons.maxDiscount, minBookingAmount: coupons.minBookingAmount, minNights: coupons.minNights, validTo: coupons.validTo, unit: coupons.unit, firstBookingOnly: coupons.firstBookingOnly, nonRefundable: coupons.nonRefundable })
    .from(coupons)
    .where(and(eq(coupons.active, true), eq(coupons.isPublic, true), lte(coupons.validFrom, now), gte(coupons.validTo, now)))
    .orderBy(asc(coupons.validTo));
}

