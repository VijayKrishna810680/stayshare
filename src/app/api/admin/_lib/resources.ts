import "server-only";
import { asc, desc, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  banners,
  cancellationPolicies,
  cities,
  commissionRules,
  contentPages,
  coupons,
  facilities,
  faqs,
  localities,
  notificationTemplates,
  pricingRules,
  propertyTypes,
  subscriptionPlans,
  taxRules,
} from "@/db/schema";
import { badRequest } from "@/lib/errors";
import type { PermissionKey } from "@/lib/rbac";

/**
 * Generic admin CRUD registry used by /api/admin/resources/[resource] and the admin pages.
 * Every resource declares its permission, zod schema and (optionally) which fields are
 * price-bearing and must be written to price_history.
 */
export type ResourceDef = {
  table: PgTable;
  perm: PermissionKey;
  entity: string;
  schema: z.AnyZodObject;
  orderBy: (t: Record<string, unknown>) => SQL[];
  /** Normalise/validate data before insert/update. */
  prepare?: (data: Record<string, unknown>, existing: Record<string, unknown> | null) => Record<string, unknown>;
  history?: { entityType: string; fields: string[]; requireReason?: boolean };
  audited?: boolean; // table has createdBy/updatedBy
  updatedByOnly?: boolean; // table has updatedBy only
  deletable?: boolean;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const str = z.string().trim();
const optStr = z.string().trim().max(5000).nullable().optional();
const int = z.number().int();
const optInt = z.number().int().nullable().optional();
const money = z.number().int().min(0).max(1_000_000_000);
const optMoney = money.nullable().optional();
const bps = z.number().int().min(0).max(10000);
const uuidN = z.string().uuid().nullable().optional();
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const col = (t: Record<string, unknown>, k: string) => t[k] as never;

export const RESOURCES: Record<string, ResourceDef> = {
  cities: {
    table: cities,
    perm: "content.manage",
    entity: "city",
    audited: true,
    deletable: true,
    schema: z.object({
      name: str.min(2).max(80),
      slug: str.max(80).optional().nullable(),
      code: str.min(2).max(5),
      state: str.min(2).max(80),
      imageUrl: optStr,
      isPopular: z.boolean().optional(),
      active: z.boolean().optional(),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
    }),
    prepare: (d, ex) => ({ ...d, ...(d.code ? { code: String(d.code).toUpperCase() } : {}), ...(d.name && !d.slug && !ex ? { slug: slugify(String(d.name)) } : d.slug ? { slug: slugify(String(d.slug)) } : {}) }),
    orderBy: (t) => [asc(col(t, "name"))],
  },
  localities: {
    table: localities,
    perm: "content.manage",
    entity: "locality",
    audited: true,
    deletable: true,
    schema: z.object({ cityId: z.string().uuid(), name: str.min(2).max(80), slug: str.max(80).optional().nullable(), active: z.boolean().optional() }),
    prepare: (d, ex) => ({ ...d, ...(d.name && !d.slug && !ex ? { slug: slugify(String(d.name)) } : d.slug ? { slug: slugify(String(d.slug)) } : {}) }),
    orderBy: (t) => [asc(col(t, "name"))],
  },
  facilities: {
    table: facilities,
    perm: "content.manage",
    entity: "facility",
    deletable: true,
    schema: z.object({ key: str.min(2).max(40), name: str.min(2).max(80), icon: optStr, category: z.enum(["GENERAL", "ROOM", "SAFETY", "FOOD"]).optional(), isCustom: z.boolean().optional(), active: z.boolean().optional() }),
    prepare: (d) => ({ ...d, ...(d.key ? { key: String(d.key).toUpperCase().replace(/[^A-Z0-9]+/g, "_") } : {}) }),
    orderBy: (t) => [asc(col(t, "category")), asc(col(t, "name"))],
  },
  "property-types": {
    table: propertyTypes,
    perm: "content.manage",
    entity: "property_type",
    deletable: true,
    schema: z.object({ key: str.min(2).max(40), name: str.min(2).max(80), active: z.boolean().optional(), sortOrder: int.optional() }),
    prepare: (d) => ({ ...d, ...(d.key ? { key: String(d.key).toUpperCase().replace(/[^A-Z0-9]+/g, "_") } : {}) }),
    orderBy: (t) => [asc(col(t, "sortOrder"))],
  },
  banners: {
    table: banners,
    perm: "content.manage",
    entity: "banner",
    deletable: true,
    schema: z.object({ title: str.min(2).max(120), subtitle: optStr, imageUrl: optStr, linkUrl: optStr, placement: str.min(2).max(40).optional(), sortOrder: int.optional(), active: z.boolean().optional() }),
    orderBy: (t) => [asc(col(t, "placement")), asc(col(t, "sortOrder"))],
  },
  faqs: {
    table: faqs,
    perm: "content.manage",
    entity: "faq",
    deletable: true,
    schema: z.object({ question: str.min(5).max(300), answer: str.min(2).max(5000), category: str.max(40).optional(), sortOrder: int.optional(), active: z.boolean().optional() }),
    orderBy: (t) => [asc(col(t, "category")), asc(col(t, "sortOrder"))],
  },
  "content-pages": {
    table: contentPages,
    perm: "content.manage",
    entity: "content_page",
    updatedByOnly: true,
    deletable: true,
    schema: z.object({ slug: str.min(2).max(80), title: str.min(2).max(160), body: z.string().max(100_000) }),
    prepare: (d) => ({ ...d, ...(d.slug ? { slug: slugify(String(d.slug)) } : {}) }),
    orderBy: (t) => [asc(col(t, "slug"))],
  },
  "notification-templates": {
    table: notificationTemplates,
    perm: "content.manage",
    entity: "notification_template",
    updatedByOnly: true,
    deletable: true,
    schema: z.object({ key: str.min(2).max(60), channel: z.enum(["EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP"]), subject: optStr, body: z.string().min(1).max(5000), active: z.boolean().optional() }),
    orderBy: (t) => [asc(col(t, "key")), asc(col(t, "channel"))],
  },
  "tax-rules": {
    table: taxRules,
    perm: "taxes.manage",
    entity: "tax_rule",
    audited: true,
    deletable: true,
    history: { entityType: "TAX_RULE", fields: ["rateBps", "minNightly", "maxNightly", "isExemptionRule", "minNightsExempt", "maxMonthlyExempt", "active"] },
    schema: z.object({
      name: str.min(2).max(120),
      code: str.min(2).max(40),
      rateBps: bps,
      minNightly: money.optional(),
      maxNightly: optMoney,
      isExemptionRule: z.boolean().optional(),
      minNightsExempt: optInt,
      maxMonthlyExempt: optMoney,
      sacCode: optStr,
      active: z.boolean().optional(),
      priority: int.optional(),
    }),
    prepare: (d) => {
      if (d.minNightly != null && d.maxNightly != null && Number(d.maxNightly) < Number(d.minNightly)) throw badRequest("Max nightly must be ≥ min nightly");
      return { ...d, ...(d.code ? { code: String(d.code).toUpperCase().replace(/[^A-Z0-9]+/g, "_") } : {}) };
    },
    orderBy: (t) => [desc(col(t, "priority")), asc(col(t, "minNightly"))],
  },
  commissions: {
    table: commissionRules,
    perm: "commissions.manage",
    entity: "commission",
    audited: true,
    deletable: true,
    history: { entityType: "COMMISSION", fields: ["rateBps", "scope", "scopeId", "active"] },
    schema: z.object({ name: str.min(2).max(120), scope: z.enum(["GLOBAL", "CITY", "PROPERTY"]), scopeId: uuidN, rateBps: bps, active: z.boolean().optional() }),
    prepare: (d, ex) => {
      const scope = (d.scope ?? ex?.scope) as string;
      const scopeId = d.scopeId !== undefined ? d.scopeId : ex?.scopeId;
      if (scope !== "GLOBAL" && !scopeId) throw badRequest(`Choose the ${scope.toLowerCase()} this commission applies to`);
      return { ...d, ...(scope === "GLOBAL" ? { scopeId: null } : {}) };
    },
    orderBy: (t) => [asc(col(t, "scope")), asc(col(t, "name"))],
  },
  coupons: {
    table: coupons,
    perm: "coupons.manage",
    entity: "coupon",
    audited: true,
    deletable: true,
    history: { entityType: "COUPON", fields: ["discountType", "value", "maxDiscount", "minBookingAmount", "validFrom", "validTo", "active"] },
    schema: z.object({
      code: str.min(3).max(30),
      title: str.min(2).max(120),
      description: optStr,
      discountType: z.enum(["PERCENT", "FLAT"]),
      value: int.min(1),
      maxDiscount: optMoney,
      minBookingAmount: money.optional(),
      minNights: int.min(1).optional(),
      validFrom: z.coerce.date(),
      validTo: z.coerce.date(),
      usageLimit: optInt,
      perUserLimit: int.min(1).optional(),
      cityId: uuidN,
      propertyId: uuidN,
      unit: z.enum(["BED", "ROOM"]).nullable().optional(),
      fundedBy: z.enum(["PLATFORM", "PROPERTY"]).optional(),
      firstBookingOnly: z.boolean().optional(),
      nonRefundable: z.boolean().optional(),
      isPublic: z.boolean().optional(),
      active: z.boolean().optional(),
    }),
    prepare: (d, ex) => {
      const type = (d.discountType ?? ex?.discountType) as string;
      const value = Number(d.value ?? ex?.value);
      if (type === "PERCENT" && value > 10000) throw badRequest("Percentage discount cannot exceed 100%");
      const from = (d.validFrom ?? ex?.validFrom) as Date;
      const to = (d.validTo ?? ex?.validTo) as Date;
      if (from && to && new Date(to) <= new Date(from)) throw badRequest("Valid-to must be after valid-from");
      return { ...d, ...(d.code ? { code: String(d.code).toUpperCase().replace(/\s+/g, "") } : {}) };
    },
    orderBy: (t) => [desc(col(t, "createdAt"))],
  },
  "cancellation-policies": {
    table: cancellationPolicies,
    perm: "policies.manage",
    entity: "cancellation_policy",
    audited: true,
    deletable: true,
    schema: z.object({
      key: str.min(2).max(40),
      name: str.min(2).max(80),
      description: str.min(5).max(2000),
      tiers: z.array(z.object({ hoursBeforeCheckIn: int.min(0).max(24 * 365), refundBps: bps })).min(1).max(10),
      refundConvenienceFee: z.boolean().optional(),
      noShowChargeBps: bps.optional(),
      earlyCheckoutRefundBps: bps.optional(),
      active: z.boolean().optional(),
    }),
    prepare: (d) => ({
      ...d,
      ...(d.key ? { key: String(d.key).toUpperCase().replace(/[^A-Z0-9]+/g, "_") } : {}),
      ...(Array.isArray(d.tiers) ? { tiers: [...(d.tiers as { hoursBeforeCheckIn: number }[])].sort((a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn) } : {}),
    }),
    orderBy: (t) => [asc(col(t, "name"))],
  },
  "pricing-rules": {
    table: pricingRules,
    perm: "pricing.manage",
    entity: "pricing_rule",
    audited: true,
    deletable: true,
    history: { entityType: "PRICING_RULE", fields: ["ruleType", "scope", "scopeId", "adjustmentType", "value", "unit", "daysOfWeek", "startDate", "endDate", "minNights", "priority", "active"], requireReason: true },
    schema: z.object({
      name: str.min(2).max(120),
      ruleType: z.enum(["SEASONAL", "WEEKEND", "SURGE", "FESTIVAL", "PROMOTION", "OVERRIDE"]),
      scope: z.enum(["GLOBAL", "CITY", "LOCALITY", "PROPERTY", "ROOM", "BED", "CUSTOMER"]),
      scopeId: uuidN,
      adjustmentType: z.enum(["PERCENT", "FIXED_PER_NIGHT", "SET_NIGHTLY_PRICE"]),
      value: int.min(-10_000_000).max(10_000_000),
      unit: z.enum(["BED", "ROOM"]).nullable().optional(),
      daysOfWeek: z.array(int.min(0).max(6)).max(7).optional(),
      startDate: dateStr,
      endDate: dateStr,
      minNights: optInt,
      priority: int.optional(),
      active: z.boolean().optional(),
      reason: str.min(3, "A reason is required for every price change").max(500),
    }),
    prepare: (d, ex) => {
      const scope = (d.scope ?? ex?.scope) as string;
      const scopeId = d.scopeId !== undefined ? d.scopeId : ex?.scopeId;
      if (scope !== "GLOBAL" && !scopeId) throw badRequest(`Choose the ${scope.toLowerCase()} this rule applies to`);
      const at = (d.adjustmentType ?? ex?.adjustmentType) as string;
      const v = Number(d.value ?? ex?.value);
      if (at === "PERCENT" && (v < -10000 || v > 50000)) throw badRequest("Percent adjustment must be between -100% and +500%");
      if (at === "SET_NIGHTLY_PRICE" && v <= 0) throw badRequest("Nightly price must be positive");
      const s = (d.startDate !== undefined ? d.startDate : ex?.startDate) as string | null;
      const e = (d.endDate !== undefined ? d.endDate : ex?.endDate) as string | null;
      if (s && e && e < s) throw badRequest("End date must be on or after start date");
      return { ...d, ...(scope === "GLOBAL" ? { scopeId: null } : {}) };
    },
    orderBy: (t) => [desc(col(t, "active")), desc(col(t, "priority")), desc(col(t, "createdAt"))],
  },
  "subscription-plans": {
    table: subscriptionPlans,
    perm: "pricing.manage",
    entity: "subscription_plan",
    audited: true,
    deletable: false,
    history: { entityType: "SUBSCRIPTION_PLAN", fields: ["price", "durationDays", "benefits", "active"] },
    schema: z.object({
      audience: z.enum(["CUSTOMER", "OWNER"]),
      code: str.min(2).max(40),
      name: str.min(2).max(80),
      description: optStr,
      price: money,
      durationDays: int.min(1).max(3650),
      benefits: z
        .object({
          bookingDiscountBps: bps.optional(),
          maxDiscountPerBooking: money.optional(),
          waiveConvenienceFee: z.boolean().optional(),
          commissionBps: bps.optional(),
          featuredListing: z.boolean().optional(),
          maxProperties: int.min(1).max(10000).optional(),
          prioritySupport: z.boolean().optional(),
        })
        .optional(),
      features: z.array(str.min(1).max(200)).max(20).optional(),
      isPopular: z.boolean().optional(),
      active: z.boolean().optional(),
      sortOrder: int.optional(),
    }),
    prepare: (d) => ({ ...d, ...(d.code ? { code: String(d.code).toUpperCase().replace(/[^A-Z0-9]+/g, "_") } : {}) }),
    orderBy: (t) => [asc(col(t, "audience")), asc(col(t, "sortOrder")), asc(col(t, "price"))],
  },
};

export function getResource(name: string): ResourceDef {
  const r = RESOURCES[name];
  if (!r) throw badRequest(`Unknown resource ${name}`);
  return r;
}
