import { describe, expect, it } from "vitest";
import {
  computeCancellationRefund,
  computeCouponDiscount,
  computeOwnerEarning,
  quote,
  refundBpsFor,
  resolveBaseRate,
  selectTaxRule,
  type PlanInput,
  type QuoteInput,
  type TaxRuleInput,
} from "@/services/pricing-engine";

const plan: PlanInput = {
  nightlyBed: 50000, // ₹500
  nightlyRoom: 150000, // ₹1,500
  weeklyBed: 315000, // ₹450/night
  weeklyRoom: null,
  monthlyBed: 1200000, // ₹400/night
  monthlyRoom: 3600000,
  extraAdultPerNight: 50000,
  childPerNight: 25000,
  acChargePerNight: 0,
  foodPerPersonPerDay: 20000,
  laundryPerMonth: 60000,
  cleaningFee: 0,
  securityDepositBed: 300000,
  securityDepositRoom: 900000,
  durationPrices: [
    { unit: "BED", nights: 5, totalPrice: 230000 }, // ₹460/night package
    { unit: "BED", nights: 10, totalPrice: 440000 },
  ],
};
const taxes: TaxRuleInput[] = [
  { code: "EXEMPT", name: "GST exempt", rateBps: 0, minNightly: 0, maxNightly: null, isExemptionRule: true, minNightsExempt: 90, maxMonthlyExempt: 2000000, priority: 100 },
  { code: "GST_5", name: "GST", rateBps: 500, minNightly: 0, maxNightly: 750000, isExemptionRule: false, minNightsExempt: null, maxMonthlyExempt: null, priority: 10 },
  { code: "GST_18", name: "GST", rateBps: 1800, minNightly: 750001, maxNightly: null, isExemptionRule: false, minNightsExempt: null, maxMonthlyExempt: null, priority: 10 },
];
const nights = (start: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(start + "T00:00:00Z") + i * 86400e3).toISOString().slice(0, 10));
const base = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  plan,
  unit: "BED",
  bedIds: ["b1"],
  roomCapacity: 3,
  maxOccupancy: 3,
  isAC: true,
  nights: nights("2026-10-05", 2), // Mon, Tue
  adults: 1,
  children: 0,
  services: [],
  context: { cityId: "c1", localityId: null, propertyId: "p1", roomId: "r1", customerId: "u1" },
  rules: [],
  taxRules: taxes,
  coupon: null,
  fees: { convenienceType: "FLAT", convenienceValue: 4900, convenienceTaxBps: 1800 },
  ...over,
});

describe("duration tiers", () => {
  it("uses nightly rate for short stays", () => expect(resolveBaseRate(plan, "BED", 2).perNight).toBe(50000));
  it("uses exact package total when stay equals a package", () => {
    const r = resolveBaseRate(plan, "BED", 5);
    expect(r.exactTotal).toBe(230000);
  });
  it("uses weekly rate for 7–9 nights", () => expect(resolveBaseRate(plan, "BED", 8).perNight).toBe(45000));
  it("uses the largest tier ≤ stay (10-night package for 15 nights)", () => expect(resolveBaseRate(plan, "BED", 15).perNight).toBe(44000));
  it("uses monthly rate for 30+ nights", () => expect(resolveBaseRate(plan, "BED", 45).perNight).toBe(40000));
  it("throws when no price is approved for the unit", () => expect(() => resolveBaseRate({ ...plan, weeklyRoom: null, nightlyRoom: null, monthlyRoom: null }, "ROOM", 2)).toThrow());
});

describe("quote", () => {
  it("computes room charge, GST 5%, convenience fee + GST, deposit", () => {
    const q = quote(base());
    expect(q.roomCharge).toBe(100000);
    expect(q.taxRateBps).toBe(500);
    expect(q.taxAmount).toBe(5000);
    expect(q.convenienceFee).toBe(4900);
    expect(q.convenienceTax).toBe(882);
    expect(q.securityDeposit).toBe(300000);
    expect(q.totalAmount).toBe(100000 + 5000 + 4900 + 882 + 300000);
    expect(q.lines.filter((l) => l.kind !== "info").reduce((a, l) => a + l.amount, 0)).toBe(q.totalAmount);
  });
  it("exact 5-night package total is charged", () => {
    expect(quote(base({ nights: nights("2026-10-05", 5) })).roomCharge).toBe(230000);
  });
  it("multiplies per bed", () => {
    expect(quote(base({ bedIds: ["b1", "b2"], adults: 2 })).roomCharge).toBe(200000);
  });
  it("rejects more adults than beds for bed bookings", () => {
    expect(() => quote(base({ adults: 2 }))).toThrow(/bed/);
  });
  it("adds extra adult & child charges for entire-room bookings", () => {
    const q = quote(base({ unit: "ROOM", bedIds: [], roomCapacity: 2, maxOccupancy: 4, adults: 3, children: 1 }));
    expect(q.extraGuestCharge).toBe((50000 + 25000) * 2);
    expect(q.securityDeposit).toBe(900000);
  });
  it("adds food per person per day and laundry per month", () => {
    const q = quote(base({ services: ["FOOD", "LAUNDRY"] }));
    expect(q.foodCharge).toBe(20000 * 2);
    expect(q.laundryCharge).toBe(60000);
  });
  it("weekend surge applies only on Fri/Sat nights", () => {
    const q = quote(
      base({
        nights: nights("2026-10-09", 2), // Fri, Sat
        rules: [{ id: "w", name: "Weekend", ruleType: "WEEKEND", scope: "PROPERTY", scopeId: "p1", adjustmentType: "PERCENT", value: 1000, unit: null, daysOfWeek: [5, 6], startDate: null, endDate: null, minNights: null, priority: 1 }],
      }),
    );
    expect(q.roomCharge).toBe(110000);
    expect(q.appliedRules).toContain("Weekend");
  });
  it("admin SET_NIGHTLY_PRICE override for a customer wins", () => {
    const q = quote(base({ rules: [{ id: "o", name: "VIP", ruleType: "OVERRIDE", scope: "CUSTOMER", scopeId: "u1", adjustmentType: "SET_NIGHTLY_PRICE", value: 30000, unit: null, daysOfWeek: [], startDate: null, endDate: null, minNights: null, priority: 9 }] }));
    expect(q.roomCharge).toBe(60000);
  });
  it("rules for another city do not apply", () => {
    const q = quote(base({ rules: [{ id: "c", name: "Other city", ruleType: "SURGE", scope: "CITY", scopeId: "c2", adjustmentType: "PERCENT", value: 5000, unit: null, daysOfWeek: [], startDate: null, endDate: null, minNights: null, priority: 1 }] }));
    expect(q.roomCharge).toBe(100000);
  });
  it("promotion is shown as a separate discount and reduces taxable value", () => {
    const q = quote(base({ rules: [{ id: "p", name: "Promo", ruleType: "PROMOTION", scope: "GLOBAL", scopeId: null, adjustmentType: "PERCENT", value: -1000, unit: null, daysOfWeek: [], startDate: null, endDate: null, minNights: null, priority: 1 }] }));
    expect(q.promoDiscount).toBe(10000);
    expect(q.taxableAmount).toBe(90000);
    expect(q.taxAmount).toBe(4500);
  });
  it("coupon: percent with cap, applied before tax", () => {
    const q = quote(base({ coupon: { code: "X", discountType: "PERCENT", value: 5000, maxDiscount: 20000, fundedBy: "PLATFORM", nonRefundable: false } }));
    expect(q.couponDiscount).toBe(20000);
    expect(q.taxableAmount).toBe(80000);
    expect(q.taxAmount).toBe(4000);
  });
  it("membership discount and waived convenience fee", () => {
    const q = quote(base({ membership: { planName: "Plus", discountBps: 500, maxDiscount: null, waiveConvenienceFee: true } }));
    expect(q.convenienceFee).toBe(0);
    expect(q.lines.find((l) => l.key === "member")?.amount).toBe(-5000);
  });
  it("18% GST slab above ₹7,500/night", () => {
    const q = quote(base({ unit: "ROOM", bedIds: [], plan: { ...plan, nightlyRoom: 900000 } }));
    expect(q.taxRateBps).toBe(1800);
  });
  it("long stay ≥90 nights at ≤₹20,000/month per person is GST exempt", () => {
    const q = quote(base({ nights: nights("2026-10-01", 90) }));
    expect(q.taxRateBps).toBe(0);
    expect(q.taxAmount).toBe(0);
  });
});

describe("tax & coupon helpers", () => {
  it("selectTaxRule falls back to slab when not exempt", () => expect(selectTaxRule(taxes, 50000, 10, 1500000)?.code).toBe("GST_5"));
  it("flat coupon never exceeds amount", () => expect(computeCouponDiscount({ code: "F", discountType: "FLAT", value: 500000, maxDiscount: null, fundedBy: "PLATFORM", nonRefundable: false }, 100000)).toBe(100000));
});

describe("cancellation & refunds", () => {
  const tiers = [
    { hoursBeforeCheckIn: 72, refundBps: 10000 },
    { hoursBeforeCheckIn: 24, refundBps: 5000 },
    { hoursBeforeCheckIn: 0, refundBps: 0 },
  ];
  it("tier selection", () => {
    expect(refundBpsFor(tiers, 100)).toBe(10000);
    expect(refundBpsFor(tiers, 30)).toBe(5000);
    expect(refundBpsFor(tiers, 2)).toBe(0);
  });
  const args = { paidAmount: 410782, securityDeposit: 300000, convenienceFee: 4900, convenienceTax: 882, tiers, nonRefundable: false, refundConvenienceFee: false, checkedIn: false };
  it("50% refund of stay + full deposit, convenience fee retained", () => {
    const r = computeCancellationRefund({ ...args, hoursBefore: 30 });
    expect(r.refundableBase).toBe(105000);
    expect(r.stayRefund).toBe(52500);
    expect(r.depositRefund).toBe(300000);
    expect(r.totalRefund).toBe(352500);
    expect(r.retained).toBe(410782 - 352500);
  });
  it("non-refundable bookings return only the deposit", () => {
    expect(computeCancellationRefund({ ...args, hoursBefore: 500, nonRefundable: true }).totalRefund).toBe(300000);
  });
  it("admin override refund %", () => {
    expect(computeCancellationRefund({ ...args, hoursBefore: 1, overrideRefundBps: 10000 }).stayRefund).toBe(105000);
  });
});

describe("owner settlement", () => {
  it("net = revenue − property-funded discount − commission − gateway fee", () => {
    const e = computeOwnerEarning({ roomRevenue: 100000, taxes: 5000, grossBookingValue: 110782, couponDiscount: 10000, promoDiscount: 0, couponFundedBy: "PROPERTY", commissionBps: 1500, gatewayFee: 2000, gatewayFeeBorneBy: "OWNER" });
    expect(e.propertyDiscount).toBe(10000);
    expect(e.commission).toBe(13500);
    expect(e.netPayable).toBe(90000 - 13500 - 2000);
  });
  it("platform-funded discounts don't reduce owner payout", () => {
    const e = computeOwnerEarning({ roomRevenue: 100000, taxes: 5000, grossBookingValue: 100000, couponDiscount: 10000, promoDiscount: 5000, couponFundedBy: "PLATFORM", commissionBps: 1000, gatewayFee: 2000, gatewayFeeBorneBy: "PLATFORM" });
    expect(e.platformDiscount).toBe(15000);
    expect(e.netPayable).toBe(90000);
  });
  it("partial cancellation retains share", () => {
    const e = computeOwnerEarning({ roomRevenue: 100000, taxes: 0, grossBookingValue: 100000, couponDiscount: 0, promoDiscount: 0, couponFundedBy: null, commissionBps: 1000, gatewayFee: 0, gatewayFeeBorneBy: "OWNER", retainedShareBps: 5000 });
    expect(e.refundDeduction).toBe(50000);
    expect(e.netPayable).toBe(45000);
  });
});
