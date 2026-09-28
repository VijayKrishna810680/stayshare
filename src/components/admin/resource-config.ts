/** Client-side field/column definitions for the generic admin ResourceManager. */
export type Opt = { value: string; label: string };
export type FieldType =
  | "text"
  | "textarea"
  | "markdown"
  | "int"
  | "number"
  | "money"
  | "percent"
  | "bool"
  | "select"
  | "ref"
  | "date"
  | "datetime"
  | "tiers"
  | "days"
  | "list"
  | "benefits"
  | "scopeRef"
  | "couponValue"
  | "ruleValue";
export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: Opt[];
  ref?: string;
  showIf?: { field: string; in: string[] };
  wide?: boolean;
  default?: unknown;
  createOnly?: boolean;
};
export type ColType = "text" | "money" | "percent" | "bool" | "status" | "date" | "datetime" | "ref" | "list" | "ruleValue" | "couponValue" | "scope" | "tiers" | "code" | "days";
export type ColDef = { key: string; label: string; type?: ColType; ref?: string };
export type ResourceConfig = { singular: string; fields: FieldDef[]; columns: ColDef[]; search?: string[]; deletable?: boolean; reasonOnEdit?: boolean };

const o = (...vals: string[]): Opt[] => vals.map((v) => ({ value: v, label: v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }));
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export { DOW };

export const SCOPE_REF: Record<string, string> = { CITY: "cities", LOCALITY: "localities", PROPERTY: "properties", ROOM: "rooms", BED: "beds", CUSTOMER: "customers" };

export const RESOURCE_CONFIG: Record<string, ResourceConfig> = {
  cities: {
    singular: "city",
    search: ["name", "code", "state"],
    deletable: true,
    fields: [
      { name: "name", label: "City name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true, hint: "2–5 letters, used in booking numbers (e.g. HYD)" },
      { name: "state", label: "State", type: "text", required: true },
      { name: "slug", label: "URL slug", type: "text", hint: "Auto-generated from name when blank" },
      { name: "imageUrl", label: "Image URL", type: "text", wide: true },
      { name: "latitude", label: "Latitude", type: "number" },
      { name: "longitude", label: "Longitude", type: "number" },
      { name: "isPopular", label: "Show as popular city", type: "bool" },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "name", label: "City" },
      { key: "code", label: "Code", type: "code" },
      { key: "state", label: "State" },
      { key: "slug", label: "Slug" },
      { key: "isPopular", label: "Popular", type: "bool" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  localities: {
    singular: "locality",
    search: ["name", "slug"],
    deletable: true,
    fields: [
      { name: "cityId", label: "City", type: "ref", ref: "cities", required: true },
      { name: "name", label: "Locality name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", hint: "Auto-generated when blank" },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "name", label: "Locality" },
      { key: "cityId", label: "City", type: "ref", ref: "cities" },
      { key: "slug", label: "Slug" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  facilities: {
    singular: "facility",
    search: ["name", "key", "category"],
    deletable: true,
    fields: [
      { name: "key", label: "Key", type: "text", required: true, hint: "e.g. WIFI" },
      { name: "name", label: "Display name", type: "text", required: true },
      { name: "icon", label: "Icon (lucide name)", type: "text", placeholder: "Wifi" },
      { name: "category", label: "Category", type: "select", options: o("GENERAL", "ROOM", "SAFETY", "FOOD"), default: "GENERAL" },
      { name: "isCustom", label: "Custom (owner-submitted)", type: "bool" },
      { name: "active", label: "Active / approved", type: "bool", default: true },
    ],
    columns: [
      { key: "name", label: "Facility" },
      { key: "key", label: "Key", type: "code" },
      { key: "category", label: "Category", type: "status" },
      { key: "icon", label: "Icon" },
      { key: "isCustom", label: "Custom", type: "bool" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  "property-types": {
    singular: "property type",
    search: ["name", "key"],
    deletable: true,
    fields: [
      { name: "key", label: "Key", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "sortOrder", label: "Sort order", type: "int", default: 0 },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "name", label: "Type" },
      { key: "key", label: "Key", type: "code" },
      { key: "sortOrder", label: "Order" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  banners: {
    singular: "banner",
    search: ["title", "placement"],
    deletable: true,
    fields: [
      { name: "title", label: "Title", type: "text", required: true, wide: true },
      { name: "subtitle", label: "Subtitle", type: "text", wide: true },
      { name: "imageUrl", label: "Image URL", type: "text", wide: true },
      { name: "linkUrl", label: "Link URL", type: "text", placeholder: "/search?city=hyderabad" },
      { name: "placement", label: "Placement", type: "select", options: o("HOME_HERO", "HOME_STRIP", "SEARCH_TOP", "ACCOUNT"), default: "HOME_HERO" },
      { name: "sortOrder", label: "Sort order", type: "int", default: 0 },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "title", label: "Title" },
      { key: "placement", label: "Placement", type: "status" },
      { key: "linkUrl", label: "Link" },
      { key: "sortOrder", label: "Order" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  faqs: {
    singular: "FAQ",
    search: ["question", "answer", "category"],
    deletable: true,
    fields: [
      { name: "question", label: "Question", type: "text", required: true, wide: true },
      { name: "answer", label: "Answer", type: "textarea", required: true, wide: true },
      { name: "category", label: "Category", type: "select", options: o("GENERAL", "BOOKING", "PAYMENT", "PARTNER", "SAFETY"), default: "GENERAL" },
      { name: "sortOrder", label: "Sort order", type: "int", default: 0 },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "question", label: "Question" },
      { key: "category", label: "Category", type: "status" },
      { key: "sortOrder", label: "Order" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  "content-pages": {
    singular: "page",
    search: ["slug", "title"],
    deletable: true,
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, hint: "terms, privacy, cancellation-policy, refund-policy, about, contact" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "body", label: "Body (Markdown)", type: "markdown", required: true, wide: true },
    ],
    columns: [
      { key: "title", label: "Title" },
      { key: "slug", label: "Slug", type: "code" },
      { key: "updatedAt", label: "Updated", type: "datetime" },
    ],
  },
  "notification-templates": {
    singular: "template",
    search: ["key", "channel", "subject", "body"],
    deletable: true,
    fields: [
      {
        name: "key",
        label: "Event key",
        type: "select",
        required: true,
        options: o("otp", "password.reset", "user.registered", "owner.approved", "owner.rejected", "property.approved", "property.rejected", "booking.confirmed", "payment.success", "payment.failed", "checkin.upcoming", "checkin.completed", "checkout.upcoming", "checkout.completed", "booking.cancelled", "refund.initiated", "refund.completed", "extension.approved", "modification.update", "ticket.updated", "payout.updated", "promo.offer").map((x) => ({ value: x.value, label: x.value })),
      },
      { name: "channel", label: "Channel", type: "select", required: true, options: o("EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP") },
      { name: "subject", label: "Subject / title", type: "text", wide: true },
      { name: "body", label: "Body", type: "textarea", required: true, wide: true, hint: "Use {{variables}} e.g. {{name}}, {{bookingNumber}}, {{propertyName}}, {{amount}}, {{checkIn}}, {{checkOut}}, {{link}}, {{code}}, {{title}}, {{message}}" },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "key", label: "Event", type: "code" },
      { key: "channel", label: "Channel", type: "status" },
      { key: "subject", label: "Subject" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  "tax-rules": {
    singular: "tax rule",
    search: ["name", "code"],
    deletable: true,
    fields: [
      { name: "name", label: "Display name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true, placeholder: "GST_5" },
      { name: "rateBps", label: "Rate", type: "percent", required: true },
      { name: "sacCode", label: "SAC code", type: "text", placeholder: "996311" },
      { name: "isExemptionRule", label: "Exemption rule (long stay)", type: "bool" },
      { name: "minNightly", label: "Slab: min nightly tariff", type: "money", default: 0, showIf: { field: "isExemptionRule", in: ["false"] } },
      { name: "maxNightly", label: "Slab: max nightly tariff (blank = no limit)", type: "money", showIf: { field: "isExemptionRule", in: ["false"] } },
      { name: "minNightsExempt", label: "Exempt when stay ≥ nights", type: "int", showIf: { field: "isExemptionRule", in: ["true"] } },
      { name: "maxMonthlyExempt", label: "…and monthly tariff per person ≤", type: "money", showIf: { field: "isExemptionRule", in: ["true"] } },
      { name: "priority", label: "Priority (higher first)", type: "int", default: 10 },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code", type: "code" },
      { key: "rateBps", label: "Rate", type: "percent" },
      { key: "minNightly", label: "Min nightly", type: "money" },
      { key: "maxNightly", label: "Max nightly", type: "money" },
      { key: "isExemptionRule", label: "Exemption", type: "bool" },
      { key: "minNightsExempt", label: "Min nights" },
      { key: "maxMonthlyExempt", label: "Max monthly", type: "money" },
      { key: "priority", label: "Priority" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  commissions: {
    singular: "commission rule",
    search: ["name", "scope"],
    deletable: true,
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "scope", label: "Applies to", type: "select", required: true, options: o("GLOBAL", "CITY", "PROPERTY"), default: "GLOBAL", hint: "Most specific wins: property > city > global" },
      { name: "scopeId", label: "City / property", type: "scopeRef" },
      { name: "rateBps", label: "Commission rate", type: "percent", required: true },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "scope", label: "Scope", type: "scope" },
      { key: "rateBps", label: "Rate", type: "percent" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  coupons: {
    singular: "coupon",
    search: ["code", "title"],
    deletable: true,
    fields: [
      { name: "code", label: "Code", type: "text", required: true, placeholder: "WELCOME10" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description / terms", type: "textarea", wide: true },
      { name: "discountType", label: "Discount type", type: "select", required: true, options: [{ value: "PERCENT", label: "Percentage" }, { value: "FLAT", label: "Flat amount" }], default: "PERCENT" },
      { name: "value", label: "Discount value", type: "couponValue", required: true },
      { name: "maxDiscount", label: "Max discount (cap)", type: "money" },
      { name: "minBookingAmount", label: "Min booking amount", type: "money", default: 0 },
      { name: "minNights", label: "Min nights", type: "int", default: 1 },
      { name: "validFrom", label: "Valid from", type: "datetime", required: true },
      { name: "validTo", label: "Valid to", type: "datetime", required: true },
      { name: "usageLimit", label: "Total usage limit (blank = unlimited)", type: "int" },
      { name: "perUserLimit", label: "Per-user limit", type: "int", default: 1 },
      { name: "cityId", label: "Only in city", type: "ref", ref: "cities" },
      { name: "propertyId", label: "Only at property", type: "ref", ref: "properties" },
      { name: "unit", label: "Only for", type: "select", options: [{ value: "BED", label: "Bed bookings" }, { value: "ROOM", label: "Entire-room bookings" }] },
      { name: "fundedBy", label: "Discount funded by", type: "select", options: [{ value: "PLATFORM", label: "Platform (StayShare)" }, { value: "PROPERTY", label: "Property (reduces owner payout)" }], default: "PLATFORM" },
      { name: "firstBookingOnly", label: "First booking only", type: "bool" },
      { name: "nonRefundable", label: "Makes booking non-refundable", type: "bool" },
      { name: "isPublic", label: "Show publicly on site", type: "bool", default: true },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "code", label: "Code", type: "code" },
      { key: "title", label: "Title" },
      { key: "value", label: "Discount", type: "couponValue" },
      { key: "maxDiscount", label: "Cap", type: "money" },
      { key: "validTo", label: "Valid to", type: "date" },
      { key: "usedCount", label: "Used" },
      { key: "usageLimit", label: "Limit" },
      { key: "fundedBy", label: "Funded by", type: "status" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  "cancellation-policies": {
    singular: "cancellation policy",
    search: ["name", "key"],
    deletable: true,
    fields: [
      { name: "key", label: "Key", type: "text", required: true, placeholder: "FLEXIBLE" },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Customer-facing description", type: "textarea", required: true, wide: true },
      { name: "tiers", label: "Refund tiers", type: "tiers", required: true, wide: true, hint: "Refund % when cancelled at least N hours before check-in. The first matching tier (highest hours) applies." },
      { name: "noShowChargeBps", label: "No-show charge", type: "percent", default: 10000 },
      { name: "earlyCheckoutRefundBps", label: "Early checkout refund of unused nights", type: "percent", default: 0 },
      { name: "refundConvenienceFee", label: "Refund convenience fee on full refunds", type: "bool" },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
    columns: [
      { key: "name", label: "Policy" },
      { key: "key", label: "Key", type: "code" },
      { key: "tiers", label: "Tiers", type: "tiers" },
      { key: "noShowChargeBps", label: "No-show", type: "percent" },
      { key: "earlyCheckoutRefundBps", label: "Early checkout", type: "percent" },
      { key: "refundConvenienceFee", label: "Refund fee", type: "bool" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  "pricing-rules": {
    singular: "pricing rule",
    search: ["name", "ruleType", "scope", "reason"],
    deletable: true,
    reasonOnEdit: true,
    fields: [
      { name: "name", label: "Rule name", type: "text", required: true, wide: true, placeholder: "Diwali surge Hyderabad" },
      { name: "ruleType", label: "Type", type: "select", required: true, options: o("SEASONAL", "WEEKEND", "SURGE", "FESTIVAL", "PROMOTION", "OVERRIDE"), default: "SEASONAL", hint: "PROMOTION with a negative value shows as a separate discount line" },
      { name: "scope", label: "Scope", type: "select", required: true, options: o("GLOBAL", "CITY", "LOCALITY", "PROPERTY", "ROOM", "BED", "CUSTOMER"), default: "GLOBAL" },
      { name: "scopeId", label: "Applies to", type: "scopeRef" },
      { name: "adjustmentType", label: "Adjustment", type: "select", required: true, options: [{ value: "PERCENT", label: "Percent (+/−)" }, { value: "FIXED_PER_NIGHT", label: "Fixed ₹ per night (+/−)" }, { value: "SET_NIGHTLY_PRICE", label: "Set nightly price" }], default: "PERCENT" },
      { name: "value", label: "Value", type: "ruleValue", required: true },
      { name: "unit", label: "Unit", type: "select", options: [{ value: "BED", label: "Bed bookings only" }, { value: "ROOM", label: "Entire-room bookings only" }], hint: "Blank = both" },
      { name: "daysOfWeek", label: "Days of week (blank = every day)", type: "days", wide: true },
      { name: "startDate", label: "From date", type: "date" },
      { name: "endDate", label: "To date (inclusive)", type: "date" },
      { name: "minNights", label: "Min nights", type: "int" },
      { name: "priority", label: "Priority (higher first)", type: "int", default: 0 },
      { name: "active", label: "Active", type: "bool", default: true },
      { name: "reason", label: "Reason for this change", type: "textarea", required: true, wide: true, hint: "Recorded in price history" },
    ],
    columns: [
      { key: "name", label: "Rule" },
      { key: "ruleType", label: "Type", type: "status" },
      { key: "scope", label: "Scope", type: "scope" },
      { key: "value", label: "Adjustment", type: "ruleValue" },
      { key: "daysOfWeek", label: "Days", type: "days" },
      { key: "startDate", label: "From", type: "date" },
      { key: "endDate", label: "To", type: "date" },
      { key: "priority", label: "Prio" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
  "subscription-plans": {
    singular: "plan",
    search: ["name", "code", "audience"],
    deletable: false,
    fields: [
      { name: "audience", label: "Audience", type: "select", required: true, options: [{ value: "CUSTOMER", label: "Customers (e.g. StayShare Plus)" }, { value: "OWNER", label: "Property partners" }], default: "CUSTOMER", createOnly: true },
      { name: "code", label: "Code", type: "text", required: true, placeholder: "PLUS_MONTHLY" },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea", wide: true },
      { name: "price", label: "Price", type: "money", required: true },
      { name: "durationDays", label: "Duration (days)", type: "int", required: true, default: 30, hint: "Monthly 30 · Quarterly 90 · Yearly 365 · or custom" },
      { name: "benefits", label: "Benefits", type: "benefits", wide: true },
      { name: "features", label: "Feature bullets (one per line)", type: "list", wide: true },
      { name: "isPopular", label: "Show 'Popular' badge", type: "bool" },
      { name: "sortOrder", label: "Sort order", type: "int", default: 0 },
      { name: "active", label: "Active (purchasable)", type: "bool", default: true },
    ],
    columns: [
      { key: "name", label: "Plan" },
      { key: "code", label: "Code", type: "code" },
      { key: "audience", label: "Audience", type: "status" },
      { key: "price", label: "Price", type: "money" },
      { key: "durationDays", label: "Days" },
      { key: "isPopular", label: "Popular", type: "bool" },
      { key: "active", label: "Active", type: "bool" },
    ],
  },
};
