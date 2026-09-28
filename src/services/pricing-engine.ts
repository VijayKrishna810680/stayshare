/**
 * StayShare pricing engine — PURE functions (no DB), fully unit-tested.
 *
 * Final payable =
 *     room/bed charge (duration tier rate × nights, adjusted per night by admin rules)
 *   + AC charge + extra adult/child charges + food + laundry + cleaning fee
 *   − promotional discount − coupon discount           → taxable value
 *   + GST on taxable value (slab by nightly tariff, long-stay exemption)
 *   + convenience fee + GST on convenience fee
 *   + refundable security deposit
 *
 * All amounts are integer paise. Percentages are basis points.
 */

export type Unit = "BED" | "ROOM";

export type PlanInput = {
  nightlyBed: number | null;
  nightlyRoom: number | null;
  weeklyBed: number | null;
  weeklyRoom: number | null;
  monthlyBed: number | null;
  monthlyRoom: number | null;
  extraAdultPerNight: number;
  childPerNight: number;
  acChargePerNight: number;
  foodPerPersonPerDay: number;
  laundryPerMonth: number;
  cleaningFee: number;
  securityDepositBed: number;
  securityDepositRoom: number;
  durationPrices: { unit: Unit; nights: number; totalPrice: number }[];
};

export type RuleInput = {
  id: string;
  name: string;
  ruleType: "SEASONAL" | "WEEKEND" | "SURGE" | "FESTIVAL" | "PROMOTION" | "OVERRIDE";
  scope: "GLOBAL" | "CITY" | "LOCALITY" | "PROPERTY" | "ROOM" | "BED" | "CUSTOMER";
  scopeId: string | null;
  adjustmentType: "PERCENT" | "FIXED_PER_NIGHT" | "SET_NIGHTLY_PRICE";
  value: number;
  unit: Unit | null;
  daysOfWeek: number[];
  startDate: string | null;
  endDate: string | null;
  minNights: number | null;
  priority: number;
};

export type TaxRuleInput = {
  code: string;
  name: string;
  rateBps: number;
  minNightly: number;
  maxNightly: number | null;
  isExemptionRule: boolean;
  minNightsExempt: number | null;
  maxMonthlyExempt: number | null;
  priority: number;
};

export type CouponInput = {
  code: string;
  discountType: "PERCENT" | "FLAT";
  value: number;
  maxDiscount: number | null;
  fundedBy: "PLATFORM" | "PROPERTY";
  nonRefundable: boolean;
};

export type QuoteInput = {
  plan: PlanInput;
  unit: Unit;
  /** For BED bookings: the bed ids (length = beds booked). For ROOM: ignored. */
  bedIds: string[];
  roomCapacity: number; // number of beds / included occupancy for entire-room bookings
  maxOccupancy: number;
  isAC: boolean;
  nights: string[]; // YYYY-MM-DD, each night of the stay
  adults: number;
  children: number;
  services: string[]; // "FOOD", "LAUNDRY"
  context: { cityId: string; localityId: string | null; propertyId: string; roomId: string; customerId: string | null };
  rules: RuleInput[];
  taxRules: TaxRuleInput[];
  coupon: CouponInput | null;
  /** Active customer membership (StayShare Plus etc.) */
  membership?: { planName: string; discountBps: number; maxDiscount: number | null; waiveConvenienceFee: boolean } | null;
  fees: { convenienceType: "FLAT" | "PERCENT"; convenienceValue: number; convenienceTaxBps: number };
};

export type QuoteLine = { key: string; label: string; amount: number; kind: "charge" | "discount" | "tax" | "deposit" | "info" };

export type Quote = {
  unit: Unit;
  nights: number;
  units: number;
  tierLabel: string;
  baseNightlyPerUnit: number;
  nightly: { night: string; amount: number }[]; // room/bed charge per night (all units)
  roomCharge: number;
  acCharge: number;
  extraGuestCharge: number;
  foodCharge: number;
  laundryCharge: number;
  cleaningFee: number;
  promoDiscount: number;
  couponDiscount: number;
  couponFundedBy: "PLATFORM" | "PROPERTY" | null;
  taxableAmount: number;
  taxRateBps: number;
  taxCode: string | null;
  taxAmount: number;
  convenienceFee: number;
  convenienceTax: number;
  securityDeposit: number;
  totalAmount: number; // final payable incl. deposit
  payableExDeposit: number;
  nonRefundable: boolean;
  appliedRules: string[];
  lines: QuoteLine[];
};

export class PricingError extends Error {}

const round = (n: number) => Math.round(n);
const bps = (amount: number, b: number) => Math.round((amount * b) / 10000);

/** Choose the duration tier: the largest tier whose length ≤ stay length. */
export function resolveBaseRate(plan: PlanInput, unit: Unit, nights: number): { perNight: number; exactTotal: number | null; label: string } {
  const tiers: { nights: number; total: number; label: string }[] = [];
  const nightly = unit === "BED" ? plan.nightlyBed : plan.nightlyRoom;
  const weekly = unit === "BED" ? plan.weeklyBed : plan.weeklyRoom;
  const monthly = unit === "BED" ? plan.monthlyBed : plan.monthlyRoom;
  if (nightly) tiers.push({ nights: 1, total: nightly, label: "Nightly rate" });
  if (weekly) tiers.push({ nights: 7, total: weekly, label: "Weekly rate" });
  if (monthly) tiers.push({ nights: 30, total: monthly, label: "Monthly rate" });
  for (const d of plan.durationPrices) {
    if (d.unit !== unit) continue;
    // explicit duration packages take precedence over weekly/monthly with the same length
    const idx = tiers.findIndex((t) => t.nights === d.nights);
    const t = { nights: d.nights, total: d.totalPrice, label: `${d.nights}-night package` };
    if (idx >= 0) tiers[idx] = t;
    else tiers.push(t);
  }
  if (!tiers.length) throw new PricingError(`No approved ${unit === "BED" ? "bed" : "room"} price for this room yet`);
  tiers.sort((a, b) => a.nights - b.nights);
  let chosen = tiers[0]!;
  for (const t of tiers) if (t.nights <= nights) chosen = t;
  const perNight = round(chosen.total / chosen.nights);
  return {
    perNight,
    exactTotal: chosen.nights === nights ? chosen.total : null,
    label: chosen.nights > nights ? `${chosen.label} (minimum tier)` : chosen.label,
  };
}

function ruleMatches(r: RuleInput, q: QuoteInput, night: string, bedId: string | null): boolean {
  if (r.unit && r.unit !== q.unit) return false;
  if (r.minNights && q.nights.length < r.minNights) return false;
  if (r.startDate && night < r.startDate) return false;
  if (r.endDate && night > r.endDate) return false;
  if (r.daysOfWeek.length) {
    const dow = new Date(night + "T00:00:00Z").getUTCDay();
    if (!r.daysOfWeek.includes(dow)) return false;
  }
  const c = q.context;
  switch (r.scope) {
    case "GLOBAL":
      return true;
    case "CITY":
      return r.scopeId === c.cityId;
    case "LOCALITY":
      return r.scopeId === c.localityId;
    case "PROPERTY":
      return r.scopeId === c.propertyId;
    case "ROOM":
      return r.scopeId === c.roomId;
    case "BED":
      return bedId !== null && r.scopeId === bedId;
    case "CUSTOMER":
      return c.customerId !== null && r.scopeId === c.customerId;
  }
}

/** Price one unit (a bed or the whole room) for one night. Returns [chargedAmount, promoDiscount]. */
function priceUnitNight(base: number, q: QuoteInput, night: string, bedId: string | null, applied: Set<string>): [number, number] {
  const matching = q.rules.filter((r) => ruleMatches(r, q, night, bedId)).sort((a, b) => b.priority - a.priority);
  let price = base;
  const setRule = matching.find((r) => r.adjustmentType === "SET_NIGHTLY_PRICE");
  if (setRule) {
    price = setRule.value;
    applied.add(setRule.name);
  }
  let promo = 0;
  for (const r of matching) {
    if (r.adjustmentType === "SET_NIGHTLY_PRICE") continue;
    const delta = r.adjustmentType === "PERCENT" ? bps(price, r.value) : r.value;
    if (r.ruleType === "PROMOTION" && delta < 0) {
      promo += -delta; // shown separately as a promotional discount
    } else {
      price += delta;
    }
    applied.add(r.name);
  }
  price = Math.max(0, price);
  promo = Math.min(promo, price);
  return [price, promo];
}

export function selectTaxRule(rules: TaxRuleInput[], nightlyTariffPerUnit: number, nights: number, monthlyPerPerson: number) {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    if (!r.isExemptionRule) continue;
    if (r.minNightsExempt && nights < r.minNightsExempt) continue;
    if (r.maxMonthlyExempt && monthlyPerPerson > r.maxMonthlyExempt) continue;
    return r;
  }
  for (const r of sorted) {
    if (r.isExemptionRule) continue;
    if (nightlyTariffPerUnit < r.minNightly) continue;
    if (r.maxNightly !== null && nightlyTariffPerUnit > r.maxNightly) continue;
    return r;
  }
  return null;
}

export function computeCouponDiscount(c: CouponInput, eligibleAmount: number): number {
  const raw = c.discountType === "PERCENT" ? bps(eligibleAmount, c.value) : c.value;
  const capped = c.maxDiscount ? Math.min(raw, c.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, eligibleAmount));
}

export function quote(q: QuoteInput): Quote {
  const n = q.nights.length;
  if (n < 1) throw new PricingError("Check-out must be after check-in");
  const units = q.unit === "BED" ? q.bedIds.length : 1;
  if (units < 1) throw new PricingError("Select at least one bed");
  const persons = q.adults + q.children;
  if (q.adults < 1) throw new PricingError("At least one adult is required");
  if (q.unit === "BED" && q.adults > units) throw new PricingError("Each adult needs a bed. Select more beds.");
  if (q.unit === "ROOM" && persons > q.maxOccupancy) throw new PricingError(`This room allows at most ${q.maxOccupancy} guests`);

  const base = resolveBaseRate(q.plan, q.unit, n);
  const applied = new Set<string>();
  const nightly: { night: string; amount: number }[] = [];
  let roomCharge = 0;
  let promo = 0;
  const unitIds: (string | null)[] = q.unit === "BED" ? q.bedIds : [null];

  // If the stay exactly matches a package and no rule touches it, charge the exact package total.
  const anyRule = q.nights.some((night) => unitIds.some((b) => q.rules.some((r) => ruleMatches(r, q, night, b))));
  if (base.exactTotal !== null && !anyRule) {
    roomCharge = base.exactTotal * units;
    const per = Math.floor(roomCharge / n);
    q.nights.forEach((night, i) => nightly.push({ night, amount: i === n - 1 ? roomCharge - per * (n - 1) : per }));
  } else {
    for (const night of q.nights) {
      let nightTotal = 0;
      for (const b of unitIds) {
        const [p, d] = priceUnitNight(base.perNight, q, night, b, applied);
        nightTotal += p;
        promo += d;
      }
      nightly.push({ night, amount: nightTotal });
      roomCharge += nightTotal;
    }
  }

  const acCharge = q.isAC && q.plan.acChargePerNight > 0 ? q.plan.acChargePerNight * n * units : 0;

  let extraGuestCharge = 0;
  if (q.unit === "ROOM") {
    const extraAdults = Math.max(0, q.adults - q.roomCapacity);
    extraGuestCharge = extraAdults * q.plan.extraAdultPerNight * n + q.children * q.plan.childPerNight * n;
  }

  const foodCharge = q.services.includes("FOOD") ? q.plan.foodPerPersonPerDay * persons * n : 0;
  const laundryCharge = q.services.includes("LAUNDRY") ? q.plan.laundryPerMonth * Math.max(1, Math.ceil(n / 30)) * (q.unit === "BED" ? units : 1) : 0;
  const cleaningFee = q.plan.cleaningFee;

  const grossCharges = roomCharge + acCharge + extraGuestCharge + foodCharge + laundryCharge + cleaningFee;
  const afterPromo = grossCharges - promo;
  const couponDiscount = q.coupon ? computeCouponDiscount(q.coupon, afterPromo) : 0;
  let memberDiscount = 0;
  if (q.membership && q.membership.discountBps > 0) {
    const raw = bps(afterPromo - couponDiscount, q.membership.discountBps);
    memberDiscount = Math.max(0, Math.min(q.membership.maxDiscount ? Math.min(raw, q.membership.maxDiscount) : raw, afterPromo - couponDiscount));
  }
  promo += memberDiscount; // member savings are platform-funded and reported with promotions
  const taxableAmount = afterPromo - couponDiscount - memberDiscount;

  // GST slab is decided by the per-unit nightly tariff actually charged.
  const nightlyTariffPerUnit = round((roomCharge + acCharge - promo) / n / units);
  const personsPerUnit = q.unit === "BED" ? 1 : Math.max(1, persons);
  const monthlyPerPerson = round((nightlyTariffPerUnit * 30) / personsPerUnit);
  const tax = selectTaxRule(q.taxRules, nightlyTariffPerUnit, n, monthlyPerPerson);
  const taxRateBps = tax?.rateBps ?? 0;
  const taxAmount = bps(taxableAmount, taxRateBps);

  const convenienceFee = q.membership?.waiveConvenienceFee ? 0 : q.fees.convenienceType === "PERCENT" ? bps(taxableAmount, q.fees.convenienceValue) : q.fees.convenienceValue;
  const convenienceTax = bps(convenienceFee, q.fees.convenienceTaxBps);

  const securityDeposit = q.unit === "BED" ? q.plan.securityDepositBed * units : q.plan.securityDepositRoom;

  const payableExDeposit = taxableAmount + taxAmount + convenienceFee + convenienceTax;
  const totalAmount = payableExDeposit + securityDeposit;

  const unitLabel = q.unit === "BED" ? `${units} bed${units > 1 ? "s" : ""}` : "Entire room";
  const lines: QuoteLine[] = [
    { key: "room", label: `${unitLabel} × ${n} night${n > 1 ? "s" : ""} (${base.label})`, amount: roomCharge, kind: "charge" },
  ];
  if (acCharge) lines.push({ key: "ac", label: "AC charge", amount: acCharge, kind: "charge" });
  if (extraGuestCharge) lines.push({ key: "extra", label: "Additional guest charge", amount: extraGuestCharge, kind: "charge" });
  if (foodCharge) lines.push({ key: "food", label: "Food / meal plan", amount: foodCharge, kind: "charge" });
  if (laundryCharge) lines.push({ key: "laundry", label: "Laundry", amount: laundryCharge, kind: "charge" });
  if (cleaningFee) lines.push({ key: "cleaning", label: "Cleaning fee", amount: cleaningFee, kind: "charge" });
  if (promo - memberDiscount) lines.push({ key: "promo", label: "Promotional discount", amount: -(promo - memberDiscount), kind: "discount" });
  if (memberDiscount) lines.push({ key: "member", label: `${q.membership!.planName} member discount`, amount: -memberDiscount, kind: "discount" });
  if (couponDiscount) lines.push({ key: "coupon", label: `Coupon ${q.coupon!.code}`, amount: -couponDiscount, kind: "discount" });
  lines.push({
    key: "tax",
    label: tax ? `${tax.name}${taxRateBps ? ` (${taxRateBps / 100}%)` : ""}` : "Taxes",
    amount: taxAmount,
    kind: "tax",
  });
  if (convenienceFee) lines.push({ key: "convenience", label: "Convenience fee", amount: convenienceFee, kind: "charge" });
  if (q.membership?.waiveConvenienceFee) lines.push({ key: "convenienceWaived", label: `Convenience fee waived (${q.membership.planName})`, amount: 0, kind: "info" });
  if (convenienceTax) lines.push({ key: "convenienceTax", label: "GST on convenience fee", amount: convenienceTax, kind: "tax" });
  if (securityDeposit) lines.push({ key: "deposit", label: "Refundable security deposit", amount: securityDeposit, kind: "deposit" });

  return {
    unit: q.unit,
    nights: n,
    units,
    tierLabel: base.label,
    baseNightlyPerUnit: base.perNight,
    nightly,
    roomCharge,
    acCharge,
    extraGuestCharge,
    foodCharge,
    laundryCharge,
    cleaningFee,
    promoDiscount: promo,
    couponDiscount,
    couponFundedBy: q.coupon && couponDiscount ? q.coupon.fundedBy : null,
    taxableAmount,
    taxRateBps,
    taxCode: tax?.code ?? null,
    taxAmount,
    convenienceFee,
    convenienceTax,
    securityDeposit,
    totalAmount,
    payableExDeposit,
    nonRefundable: Boolean(q.coupon?.nonRefundable && couponDiscount),
    appliedRules: [...applied],
    lines,
  };
}

// ───────────────────────── cancellation & settlement maths ─────────────────────────

export type PolicyTier = { hoursBeforeCheckIn: number; refundBps: number };

/** Refund % for a cancellation `hoursBefore` hours before check-in. Tiers: highest hours first. */
export function refundBpsFor(tiers: PolicyTier[], hoursBefore: number): number {
  const sorted = [...tiers].sort((a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn);
  for (const t of sorted) if (hoursBefore >= t.hoursBeforeCheckIn) return t.refundBps;
  return 0;
}

export type CancellationCalc = {
  refundBps: number;
  refundableBase: number; // stay charges + tax portion that may be refunded
  stayRefund: number;
  depositRefund: number;
  convenienceRefund: number;
  totalRefund: number;
  retained: number;
};

export function computeCancellationRefund(args: {
  paidAmount: number;
  securityDeposit: number;
  convenienceFee: number;
  convenienceTax: number;
  tiers: PolicyTier[];
  hoursBefore: number;
  nonRefundable: boolean;
  refundConvenienceFee: boolean;
  checkedIn: boolean;
  overrideRefundBps?: number | null;
}): CancellationCalc {
  const depositPaid = Math.min(args.securityDeposit, args.paidAmount);
  const convPaid = Math.min(args.convenienceFee + args.convenienceTax, Math.max(0, args.paidAmount - depositPaid));
  const refundableBase = Math.max(0, args.paidAmount - depositPaid - convPaid);
  let refundBps: number;
  if (args.overrideRefundBps !== undefined && args.overrideRefundBps !== null) refundBps = args.overrideRefundBps;
  else if (args.checkedIn || args.nonRefundable) refundBps = 0;
  else refundBps = refundBpsFor(args.tiers, args.hoursBefore);
  const stayRefund = bps(refundableBase, refundBps);
  const convenienceRefund = args.refundConvenienceFee && refundBps === 10000 ? convPaid : 0;
  const depositRefund = args.checkedIn ? 0 : depositPaid;
  const totalRefund = stayRefund + convenienceRefund + depositRefund;
  return {
    refundBps,
    refundableBase,
    stayRefund,
    depositRefund,
    convenienceRefund,
    totalRefund,
    retained: args.paidAmount - totalRefund,
  };
}

export type EarningCalc = {
  grossBookingValue: number;
  taxes: number;
  roomRevenue: number;
  commission: number;
  gatewayFee: number;
  platformDiscount: number;
  propertyDiscount: number;
  penalties: number;
  refundDeduction: number;
  adjustments: number;
  netPayable: number;
};

/**
 * Owner settlement for a booking.
 * roomRevenue = stay charges before discounts (room, AC, extra guest, food, laundry, cleaning).
 * Platform-funded discounts do NOT reduce owner revenue; property-funded ones do.
 * Commission is charged on (roomRevenue − propertyDiscount). Taxes are remitted by the platform.
 * `retainedShareBps` < 10000 when the booking was cancelled/refunded partially.
 */
export function computeOwnerEarning(args: {
  roomRevenue: number;
  taxes: number;
  grossBookingValue: number;
  couponDiscount: number;
  promoDiscount: number;
  couponFundedBy: "PLATFORM" | "PROPERTY" | null;
  commissionBps: number;
  gatewayFee: number;
  gatewayFeeBorneBy: "OWNER" | "PLATFORM";
  retainedShareBps?: number;
  penalties?: number;
  adjustments?: number;
}): EarningCalc {
  const propertyDiscount = args.couponFundedBy === "PROPERTY" ? args.couponDiscount : 0;
  const platformDiscount = (args.couponFundedBy === "PROPERTY" ? 0 : args.couponDiscount) + args.promoDiscount;
  const share = args.retainedShareBps ?? 10000;
  const base = args.roomRevenue - propertyDiscount;
  const retainedBase = bps(base, share);
  const refundDeduction = base - retainedBase;
  const commission = bps(retainedBase, args.commissionBps);
  const gatewayFee = args.gatewayFeeBorneBy === "OWNER" ? args.gatewayFee : 0;
  const penalties = args.penalties ?? 0;
  const adjustments = args.adjustments ?? 0;
  const netPayable = Math.max(0, retainedBase - commission - gatewayFee - penalties + adjustments);
  return {
    grossBookingValue: args.grossBookingValue,
    taxes: args.taxes,
    roomRevenue: args.roomRevenue,
    commission,
    gatewayFee,
    platformDiscount,
    propertyDiscount,
    penalties,
    refundDeduction,
    adjustments,
    netPayable,
  };
}
