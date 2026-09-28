/**
 * StayShare database schema (PostgreSQL, Drizzle ORM)
 *
 * Conventions
 *  - UUID primary keys (gen_random_uuid()).
 *  - Money is ALWAYS integer paise (₹1 = 100 paise). Never floating point.
 *  - Percentages are basis points (1% = 100 bps).
 *  - created_at / updated_at on every business table, created_by / updated_by where
 *    a human edits the row, deleted_at for soft deletes.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ───────────────────────────── helpers ─────────────────────────────
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const audit = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
});
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ───────────────────────────── enums ─────────────────────────────
export const userStatus = pgEnum("user_status", ["ACTIVE", "SUSPENDED", "PENDING_VERIFICATION"]);
export const gender = pgEnum("gender", ["MALE", "FEMALE", "OTHER"]);
export const genderEligibility = pgEnum("gender_eligibility", ["MALE_ONLY", "FEMALE_ONLY", "MIXED", "FAMILY", "ANY"]);
export const approvalStatus = pgEnum("approval_status", ["DRAFT", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"]);
export const kycStatus = pgEnum("kyc_status", ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"]);
export const roomCategory = pgEnum("room_category", ["PRIVATE", "SHARED", "FAMILY", "DORMITORY"]);
export const bathroomType = pgEnum("bathroom_type", ["ATTACHED", "COMMON"]);
export const furnishing = pgEnum("furnishing", ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]);
export const cleaningStatus = pgEnum("cleaning_status", ["CLEAN", "NEEDS_CLEANING", "IN_PROGRESS"]);
export const maintenanceStatus = pgEnum("maintenance_status", ["OK", "UNDER_MAINTENANCE"]);
export const bedStatus = pgEnum("bed_status", ["AVAILABLE", "OCCUPIED", "RESERVED", "BLOCKED", "CLEANING"]);
export const bookingUnit = pgEnum("booking_unit", ["BED", "ROOM"]);
export const bookingStatus = pgEnum("booking_status", [
  "DRAFT",
  "PAYMENT_PENDING",
  "INVENTORY_LOCKED",
  "CONFIRMED",
  "CHECK_IN_PENDING",
  "CHECKED_IN",
  "CHECKED_OUT",
  "COMPLETED",
  "CANCELLATION_REQUESTED",
  "CANCELLED",
  "REFUND_PENDING",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "NO_SHOW",
  "REJECTED",
]);
export const calendarStatus = pgEnum("calendar_status", ["HELD", "BOOKED", "BLOCKED"]);
export const paymentStatus = pgEnum("payment_status", [
  "CREATED",
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
export const paymentPurpose = pgEnum("payment_purpose", [
  "BOOKING",
  "SECURITY_DEPOSIT",
  "EXTENSION",
  "MODIFICATION",
  "SERVICE",
  "CHECKOUT_DUES",
  "SUBSCRIPTION",
]);
export const paymentMethod = pgEnum("payment_method", ["UPI", "CARD", "NETBANKING", "WALLET", "CASH_AT_PROPERTY", "UNKNOWN"]);
export const refundStatus = pgEnum("refund_status", ["REQUESTED", "APPROVED", "PROCESSING", "COMPLETED", "REJECTED", "FAILED"]);
export const payoutStatus = pgEnum("payout_status", ["PENDING", "ON_HOLD", "APPROVED", "PROCESSING", "PAID", "FAILED", "REVERSED"]);
export const earningStatus = pgEnum("earning_status", ["PENDING", "ELIGIBLE", "ON_HOLD", "IN_PAYOUT", "PAID", "REVERSED"]);
export const pricingScope = pgEnum("pricing_scope", ["GLOBAL", "CITY", "LOCALITY", "PROPERTY", "ROOM", "BED", "CUSTOMER"]);
export const pricingRuleType = pgEnum("pricing_rule_type", ["SEASONAL", "WEEKEND", "SURGE", "FESTIVAL", "PROMOTION", "OVERRIDE"]);
export const adjustmentType = pgEnum("adjustment_type", ["PERCENT", "FIXED_PER_NIGHT", "SET_NIGHTLY_PRICE"]);
export const discountType = pgEnum("discount_type", ["PERCENT", "FLAT"]);
export const fundedBy = pgEnum("funded_by", ["PLATFORM", "PROPERTY"]);
export const ticketCategory = pgEnum("ticket_category", [
  "BOOKING",
  "PAYMENT",
  "REFUND",
  "CHECK_IN",
  "PROPERTY_ISSUE",
  "SAFETY",
  "ROOM_ISSUE",
  "OWNER_PAYOUT",
  "TECHNICAL",
  "OTHER",
]);
export const ticketStatus = pgEnum("ticket_status", [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_CUSTOMER",
  "WAITING_FOR_PROPERTY",
  "RESOLVED",
  "CLOSED",
]);
export const ticketPriority = pgEnum("ticket_priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const notificationChannel = pgEnum("notification_channel", ["EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP"]);
export const reviewStatus = pgEnum("review_status", ["PUBLISHED", "PENDING", "HIDDEN"]);
export const modificationType = pgEnum("modification_type", [
  "EXTEND_STAY",
  "EARLY_CHECK_IN",
  "LATE_CHECK_OUT",
  "ROOM_CHANGE",
  "BED_CHANGE",
  "UPGRADE_AC",
  "UPGRADE_PRIVATE",
  "ADD_GUEST",
  "REMOVE_GUEST",
]);
export const modificationStatus = pgEnum("modification_status", ["REQUESTED", "AWAITING_PAYMENT", "APPROVED", "REJECTED", "APPLIED"]);
export const fileVisibility = pgEnum("file_visibility", ["PUBLIC", "PRIVATE"]);

// ───────────────────────── identity & access ─────────────────────────
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").unique(),
    phone: text("phone").unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    googleId: text("google_id").unique(),
    avatarUrl: text("avatar_url"),
    status: userStatus("status").notNull().default("ACTIVE"),
    emailVerifiedAt: ts("email_verified_at"),
    phoneVerifiedAt: ts("phone_verified_at"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    isDevAccount: boolean("is_dev_account").notNull().default(false),
    ...audit(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("users_status_idx").on(t.status)],
);

export const roles = pgTable("roles", {
  id: id(),
  key: text("key").notNull().unique(), // SUPER_ADMIN, ADMIN, OWNER, STAFF, CUSTOMER or custom
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const permissions = pgTable("permissions", {
  id: id(),
  key: text("key").notNull().unique(),
  module: text("module").notNull(),
  description: text("description"),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

/** Refresh-token sessions, rotated on every use; reuse of a rotated token revokes the whole family. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    familyId: uuid("family_id").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    rotatedAt: ts("rotated_at"),
    lastUsedAt: ts("last_used_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_family_idx").on(t.familyId)],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    target: text("target").notNull(),
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_target_idx").on(t.target, t.purpose)],
);

export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const pushTokens = pgTable("push_tokens", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(),
  createdAt: createdAt(),
});

export const customerProfiles = pgTable("customer_profiles", {
  id: id(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  gender: gender("gender"),
  dateOfBirth: date("date_of_birth"),
  occupation: text("occupation"),
  address: text("address"),
  city: text("city"),
  emergencyName: text("emergency_name"),
  emergencyPhone: text("emergency_phone"),
  walletBalance: integer("wallet_balance").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ownerProfiles = pgTable("owner_profiles", {
  id: id(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  businessType: text("business_type"),
  gstin: text("gstin"),
  panEnc: text("pan_enc"),
  panLast4: text("pan_last4"),
  address: text("address"),
  kycStatus: kycStatus("kyc_status").notNull().default("NOT_SUBMITTED"),
  kycNotes: text("kyc_notes"),
  kycReviewedBy: uuid("kyc_reviewed_by"),
  kycReviewedAt: ts("kyc_reviewed_at"),
  bankAccountName: text("bank_account_name"),
  bankAccountEnc: text("bank_account_enc"),
  bankAccountLast4: text("bank_account_last4"),
  bankIfsc: text("bank_ifsc"),
  bankName: text("bank_name"),
  upiId: text("upi_id"),
  bankVerified: boolean("bank_verified").notNull().default(false),
  bankVerifiedBy: uuid("bank_verified_by"),
  /** Admin may grant an owner permission to set the final customer-facing price (off by default). */
  canSetFinalPrice: boolean("can_set_final_price").notNull().default(false),
  settlementCycleDays: integer("settlement_cycle_days").notNull().default(7),
  payoutHold: boolean("payout_hold").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const staffProfiles = pgTable("staff_profiles", {
  id: id(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  employerId: uuid("employer_id").notNull().references(() => users.id),
  designation: text("designation"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const fileUploads = pgTable(
  "file_uploads",
  {
    id: id(),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    purpose: text("purpose").notNull(), // PROPERTY_IMAGE, ROOM_IMAGE, ID_PROOF, KYC, PROPERTY_DOC, TICKET_ATTACHMENT, REVIEW_IMAGE
    visibility: fileVisibility("visibility").notNull().default("PRIVATE"),
    uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("files_uploader_idx").on(t.uploadedBy)],
);

export const identityDocuments = pgTable(
  "identity_documents",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(), // AADHAAR, PASSPORT, DRIVING_LICENSE, VOTER_ID, PAN
    numberEnc: text("number_enc").notNull(),
    numberLast4: text("number_last4").notNull(),
    fileId: uuid("file_id").references(() => fileUploads.id),
    status: approvalStatus("status").notNull().default("PENDING"),
    verifiedBy: uuid("verified_by"),
    verifiedAt: ts("verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("iddocs_user_idx").on(t.userId)],
);

export const savedGuests = pgTable("saved_guests", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  gender: gender("gender"),
  age: integer("age"),
  relation: text("relation"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────── geography & catalogue ─────────────────────────
export const cities = pgTable("cities", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  code: text("code").notNull().unique(), // HYD, BLR... used in booking numbers
  state: text("state").notNull(),
  imageUrl: text("image_url"),
  isPopular: boolean("is_popular").notNull().default(false),
  active: boolean("active").notNull().default(true),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  ...audit(),
});

export const localities = pgTable(
  "localities",
  {
    id: id(),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    active: boolean("active").notNull().default(true),
    ...audit(),
  },
  (t) => [uniqueIndex("localities_city_slug_uq").on(t.cityId, t.slug)],
);

export const propertyTypes = pgTable("property_types", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const facilities = pgTable("facilities", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon"),
  category: text("category").notNull().default("GENERAL"), // GENERAL, ROOM, SAFETY, FOOD
  isCustom: boolean("is_custom").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const cancellationPolicies = pgTable("cancellation_policies", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  /** [{hoursBeforeCheckIn: 48, refundBps: 10000}, ...] sorted desc by hours */
  tiers: jsonb("tiers").$type<{ hoursBeforeCheckIn: number; refundBps: number }[]>().notNull(),
  refundConvenienceFee: boolean("refund_convenience_fee").notNull().default(false),
  noShowChargeBps: integer("no_show_charge_bps").notNull().default(10000),
  earlyCheckoutRefundBps: integer("early_checkout_refund_bps").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...audit(),
});

// ───────────────────────── properties / rooms / beds ─────────────────────────
export const properties = pgTable(
  "properties",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    propertyTypeId: uuid("property_type_id").notNull().references(() => propertyTypes.id),
    description: text("description").notNull(),
    addressLine: text("address_line").notNull(),
    landmark: text("landmark"),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    localityId: uuid("locality_id").references(() => localities.id),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    mapUrl: text("map_url"),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    managerId: uuid("manager_id").references(() => users.id),
    genderEligibility: genderEligibility("gender_eligibility").notNull().default("ANY"),
    minStayNights: integer("min_stay_nights").notNull().default(1),
    maxStayNights: integer("max_stay_nights").notNull().default(365),
    checkInTime: text("check_in_time").notNull().default("12:00"),
    checkOutTime: text("check_out_time").notNull().default("11:00"),
    cancellationPolicyId: uuid("cancellation_policy_id").references(() => cancellationPolicies.id),
    refundPolicyText: text("refund_policy_text"),
    idProofRequired: boolean("id_proof_required").notNull().default(true),
    instantBooking: boolean("instant_booking").notNull().default(true),
    allowCashAtProperty: boolean("allow_cash_at_property").notNull().default(false),
    showOwnerPhone: boolean("show_owner_phone").notNull().default(false),
    contactPhone: text("contact_phone"),
    foodIncluded: boolean("food_included").notNull().default(false),
    videoUrls: jsonb("video_urls").$type<string[]>().notNull().default([]),
    nearbyPlaces: jsonb("nearby_places").$type<{ name: string; distanceKm: number; type: string }[]>().notNull().default([]),
    targetAudience: jsonb("target_audience").$type<string[]>().notNull().default([]),
    kycStatus: kycStatus("kyc_status").notNull().default("PENDING"),
    approvalStatus: approvalStatus("approval_status").notNull().default("DRAFT"),
    approvalNotes: text("approval_notes"),
    approvedBy: uuid("approved_by"),
    approvedAt: ts("approved_at"),
    submittedAt: ts("submitted_at"),
    active: boolean("active").notNull().default(true),
    blocked: boolean("blocked").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    ratingAvg: doublePrecision("rating_avg").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    bookingCount: integer("booking_count").notNull().default(0),
    /** Denormalised lowest approved nightly price (paise) — refreshed whenever pricing changes. */
    startingPrice: integer("starting_price"),
    ...audit(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("properties_city_status_idx").on(t.cityId, t.approvalStatus, t.active),
    index("properties_owner_idx").on(t.ownerId),
    index("properties_locality_idx").on(t.localityId),
  ],
);

export const propertyDocuments = pgTable("property_documents", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  fileId: uuid("file_id").notNull().references(() => fileUploads.id),
  status: approvalStatus("status").notNull().default("PENDING"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const propertyImages = pgTable(
  "property_images",
  {
    id: id(),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    status: approvalStatus("status").notNull().default("PENDING"),
    createdAt: createdAt(),
  },
  (t) => [index("property_images_prop_idx").on(t.propertyId)],
);

export const propertyFacilities = pgTable(
  "property_facilities",
  {
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    status: approvalStatus("status").notNull().default("PENDING"),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.facilityId] })],
);

export const propertyRules = pgTable("property_rules", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_assign_uq").on(t.userId, t.propertyId)],
);

export const floors = pgTable(
  "floors",
  {
    id: id(),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("floors_prop_num_uq").on(t.propertyId, t.number)],
);

export const rooms = pgTable(
  "rooms",
  {
    id: id(),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    floorId: uuid("floor_id").references(() => floors.id),
    roomNumber: text("room_number").notNull(),
    name: text("name"),
    category: roomCategory("category").notNull(),
    sharingCapacity: integer("sharing_capacity").notNull(),
    totalBeds: integer("total_beds").notNull(),
    maxOccupancy: integer("max_occupancy").notNull(),
    isAC: boolean("is_ac").notNull().default(false),
    bathroom: bathroomType("bathroom").notNull().default("ATTACHED"),
    furnishing: furnishing("furnishing").notNull().default("FURNISHED"),
    genderEligibility: genderEligibility("gender_eligibility").notNull().default("ANY"),
    sizeSqft: integer("size_sqft"),
    description: text("description"),
    allowBedBooking: boolean("allow_bed_booking").notNull().default(true),
    allowEntireRoomBooking: boolean("allow_entire_room_booking").notNull().default(true),
    /** Owner-SUGGESTED prices (paise). Never customer-facing until an admin approves a price plan. */
    suggestedNightlyBed: integer("suggested_nightly_bed"),
    suggestedNightlyRoom: integer("suggested_nightly_room"),
    suggestedMonthlyBed: integer("suggested_monthly_bed"),
    suggestedMonthlyRoom: integer("suggested_monthly_room"),
    suggestedDeposit: integer("suggested_deposit"),
    suggestedNote: text("suggested_note"),
    priceSubmittedAt: ts("price_submitted_at"),
    approvalStatus: approvalStatus("approval_status").notNull().default("DRAFT"),
    approvalNotes: text("approval_notes"),
    maintenanceStatus: maintenanceStatus("maintenance_status").notNull().default("OK"),
    cleaningStatus: cleaningStatus("cleaning_status").notNull().default("CLEAN"),
    active: boolean("active").notNull().default(true),
    ...audit(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("rooms_prop_num_uq").on(t.propertyId, t.roomNumber),
    index("rooms_prop_status_idx").on(t.propertyId, t.approvalStatus, t.active),
  ],
);

export const roomImages = pgTable("room_images", {
  id: id(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: approvalStatus("status").notNull().default("PENDING"),
  createdAt: createdAt(),
});

export const roomFacilities = pgTable(
  "room_facilities",
  {
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.facilityId] })],
);

export const beds = pgTable(
  "beds",
  {
    id: id(),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    bedNumber: text("bed_number").notNull(),
    code: text("code").notNull().unique(),
    bedType: text("bed_type").notNull().default("SINGLE"),
    status: bedStatus("status").notNull().default("AVAILABLE"),
    currentBookingId: uuid("current_booking_id"),
    currentCustomerId: uuid("current_customer_id"),
    availableFrom: date("available_from"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex("beds_room_num_uq").on(t.roomId, t.bedNumber)],
);

export const inventoryBlocks = pgTable(
  "inventory_blocks",
  {
    id: id(),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    bedId: uuid("bed_id").references(() => beds.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(), // exclusive
    reason: text("reason").notNull(), // MAINTENANCE, OWNER_BLOCK, ADMIN_BLOCK, OFFLINE_BOOKING
    note: text("note"),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
    releasedAt: ts("released_at"),
  },
  (t) => [index("blocks_prop_idx").on(t.propertyId)],
);

export const maintenanceIssues = pgTable("maintenance_issues", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => rooms.id),
  reportedBy: uuid("reported_by").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  priority: ticketPriority("priority").notNull().default("MEDIUM"),
  status: text("status").notNull().default("OPEN"), // OPEN, IN_PROGRESS, RESOLVED
  resolvedAt: ts("resolved_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────── pricing (admin-controlled) ─────────────────────────
/** Admin-approved, customer-facing price plan for a room. Only the active plan is used. */
export const pricePlans = pgTable(
  "price_plans",
  {
    id: id(),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Standard"),
    active: boolean("active").notNull().default(true),
    nightlyBed: integer("nightly_bed"),
    nightlyRoom: integer("nightly_room"),
    weeklyBed: integer("weekly_bed"),
    weeklyRoom: integer("weekly_room"),
    monthlyBed: integer("monthly_bed"),
    monthlyRoom: integer("monthly_room"),
    extraAdultPerNight: integer("extra_adult_per_night").notNull().default(0),
    childPerNight: integer("child_per_night").notNull().default(0),
    acChargePerNight: integer("ac_charge_per_night").notNull().default(0),
    foodPerPersonPerDay: integer("food_per_person_per_day").notNull().default(0),
    laundryPerMonth: integer("laundry_per_month").notNull().default(0),
    cleaningFee: integer("cleaning_fee").notNull().default(0),
    securityDepositBed: integer("security_deposit_bed").notNull().default(0),
    securityDepositRoom: integer("security_deposit_room").notNull().default(0),
    effectiveFrom: ts("effective_from").notNull().defaultNow(),
    effectiveTo: ts("effective_to"),
    approvedBy: uuid("approved_by"),
    ...audit(),
  },
  (t) => [index("price_plans_room_idx").on(t.roomId, t.active)],
);

/** Package prices for specific durations (1,2,5,10,15,20,30 nights ...). */
export const durationPrices = pgTable(
  "duration_prices",
  {
    id: id(),
    pricePlanId: uuid("price_plan_id").notNull().references(() => pricePlans.id, { onDelete: "cascade" }),
    unit: bookingUnit("unit").notNull(),
    nights: integer("nights").notNull(),
    totalPrice: integer("total_price").notNull(),
  },
  (t) => [uniqueIndex("duration_prices_uq").on(t.pricePlanId, t.unit, t.nights)],
);

/** Seasonal / weekend / surge / festival / promotion / override adjustments. */
export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: id(),
    name: text("name").notNull(),
    ruleType: pricingRuleType("rule_type").notNull(),
    scope: pricingScope("scope").notNull(),
    scopeId: uuid("scope_id"),
    adjustmentType: adjustmentType("adjustment_type").notNull(),
    value: integer("value").notNull(), // bps for PERCENT (may be negative), paise otherwise
    unit: bookingUnit("unit"),
    daysOfWeek: integer("days_of_week").array().notNull().default(sql`'{}'::integer[]`),
    startDate: date("start_date"),
    endDate: date("end_date"), // inclusive
    minNights: integer("min_nights"),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    reason: text("reason"),
    ...audit(),
  },
  (t) => [index("pricing_rules_scope_idx").on(t.scope, t.scopeId, t.active)],
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedBy: uuid("changed_by"),
    reason: text("reason"),
    effectiveFrom: ts("effective_from"),
    effectiveTo: ts("effective_to"),
    createdAt: createdAt(),
  },
  (t) => [index("price_history_entity_idx").on(t.entityType, t.entityId)],
);

export const taxRules = pgTable("tax_rules", {
  id: id(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  rateBps: integer("rate_bps").notNull(),
  minNightly: integer("min_nightly").notNull().default(0),
  maxNightly: integer("max_nightly"),
  isExemptionRule: boolean("is_exemption_rule").notNull().default(false),
  minNightsExempt: integer("min_nights_exempt"),
  maxMonthlyExempt: integer("max_monthly_exempt"),
  sacCode: text("sac_code"),
  active: boolean("active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  ...audit(),
});

export const commissionRules = pgTable("commissions", {
  id: id(),
  name: text("name").notNull(),
  scope: pricingScope("scope").notNull(),
  scopeId: uuid("scope_id"),
  rateBps: integer("rate_bps").notNull(),
  active: boolean("active").notNull().default(true),
  ...audit(),
});

export const coupons = pgTable("coupons", {
  id: id(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  discountType: discountType("discount_type").notNull(),
  value: integer("value").notNull(),
  maxDiscount: integer("max_discount"),
  minBookingAmount: integer("min_booking_amount").notNull().default(0),
  minNights: integer("min_nights").notNull().default(1),
  validFrom: ts("valid_from").notNull(),
  validTo: ts("valid_to").notNull(),
  usageLimit: integer("usage_limit"),
  perUserLimit: integer("per_user_limit").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  cityId: uuid("city_id").references(() => cities.id),
  propertyId: uuid("property_id").references(() => properties.id),
  unit: bookingUnit("unit"),
  fundedBy: fundedBy("funded_by").notNull().default("PLATFORM"),
  firstBookingOnly: boolean("first_booking_only").notNull().default(false),
  nonRefundable: boolean("non_refundable").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(true),
  active: boolean("active").notNull().default(true),
  ...audit(),
});

export const couponUsage = pgTable(
  "coupon_usage",
  {
    id: id(),
    couponId: uuid("coupon_id").notNull().references(() => coupons.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    bookingId: uuid("booking_id").notNull().unique(),
    discount: integer("discount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("coupon_usage_user_idx").on(t.couponId, t.userId)],
);

// ───────────────────────── bookings ─────────────────────────
export type PriceBreakdownJson = {
  lines: { key: string; label: string; amount: number; kind: "charge" | "discount" | "tax" | "deposit" | "info" }[];
  nightly?: { night: string; amount: number }[];
  tierApplied?: string;
  taxRateBps?: number;
  commissionBps?: number;
};

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    bookingNumber: text("booking_number").notNull().unique(),
    customerId: uuid("customer_id").notNull().references(() => users.id),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    roomId: uuid("room_id").notNull().references(() => rooms.id),
    unit: bookingUnit("unit").notNull(),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    bedsCount: integer("beds_count").notNull().default(1),
    status: bookingStatus("status").notNull().default("DRAFT"),
    roomCharge: integer("room_charge").notNull().default(0),
    extraGuestCharge: integer("extra_guest_charge").notNull().default(0),
    servicesCharge: integer("services_charge").notNull().default(0),
    cleaningFee: integer("cleaning_fee").notNull().default(0),
    convenienceFee: integer("convenience_fee").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    couponDiscount: integer("coupon_discount").notNull().default(0),
    promoDiscount: integer("promo_discount").notNull().default(0),
    securityDeposit: integer("security_deposit").notNull().default(0),
    totalAmount: integer("total_amount").notNull().default(0),
    paidAmount: integer("paid_amount").notNull().default(0),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    depositRefunded: integer("deposit_refunded").notNull().default(0),
    priceBreakdown: jsonb("price_breakdown").$type<PriceBreakdownJson>().notNull().default({ lines: [] }),
    selectedServices: jsonb("selected_services").$type<string[]>().notNull().default([]),
    couponCode: text("coupon_code"),
    couponFundedBy: fundedBy("coupon_funded_by"),
    payAtProperty: boolean("pay_at_property").notNull().default(false),
    nonRefundable: boolean("non_refundable").notNull().default(false),
    lockExpiresAt: ts("lock_expires_at"),
    cancellationPolicy: jsonb("cancellation_policy").notNull().default({}),
    specialRequests: text("special_requests"),
    termsAcceptedAt: ts("terms_accepted_at"),
    idProofFileId: uuid("id_proof_file_id"),
    qrToken: uuid("qr_token").notNull().unique().defaultRandom(),
    source: text("source").notNull().default("WEB"),
    confirmedAt: ts("confirmed_at"),
    cancelledAt: ts("cancelled_at"),
    completedAt: ts("completed_at"),
    ...audit(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("bookings_customer_idx").on(t.customerId, t.status),
    index("bookings_property_idx").on(t.propertyId, t.status),
    index("bookings_checkin_idx").on(t.checkIn),
    index("bookings_status_idx").on(t.status),
  ],
);

/**
 * One row per bed per night that is HELD / BOOKED / BLOCKED.
 * UNIQUE(bed_id, night) is the database-level guarantee that no bed is ever sold twice
 * for the same night — even with simultaneous requests. Entire-room bookings claim every
 * bed in the room, so they automatically conflict with any individual bed booking.
 */
export const availabilityCalendars = pgTable(
  "availability_calendars",
  {
    id: id(),
    bedId: uuid("bed_id").notNull().references(() => beds.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    night: date("night").notNull(),
    status: calendarStatus("status").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    blockId: uuid("block_id").references(() => inventoryBlocks.id, { onDelete: "cascade" }),
    holdExpiresAt: ts("hold_expires_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("availability_bed_night_uq").on(t.bedId, t.night),
    index("availability_booking_idx").on(t.bookingId),
    index("availability_room_night_idx").on(t.roomId, t.night),
    index("availability_hold_idx").on(t.status, t.holdExpiresAt),
  ],
);

export const bookingGuests = pgTable("booking_guests", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  gender: gender("gender"),
  age: integer("age"),
  isPrimary: boolean("is_primary").notNull().default(false),
  idType: text("id_type"),
  idLast4: text("id_last4"),
  createdAt: createdAt(),
});

export const bookingRooms = pgTable("booking_rooms", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").notNull().references(() => rooms.id),
  unit: bookingUnit("unit").notNull(),
});

export const bookingBeds = pgTable(
  "booking_beds",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    bedId: uuid("bed_id").notNull().references(() => beds.id),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("booking_beds_bed_idx").on(t.bedId)],
);

export const bookingServices = pgTable("booking_services", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  serviceKey: text("service_key").notNull(), // FOOD, LAUNDRY, DAMAGE, EXTRA, ...
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  amount: integer("amount").notNull(),
  addedBy: uuid("added_by"),
  atCheckout: boolean("at_checkout").notNull().default(false),
  settled: boolean("settled").notNull().default(false),
  createdAt: createdAt(),
});

export const bookingStatusHistory = pgTable(
  "booking_status_history",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    fromStatus: bookingStatus("from_status"),
    toStatus: bookingStatus("to_status").notNull(),
    changedBy: uuid("changed_by"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("bsh_booking_idx").on(t.bookingId)],
);

export const bookingModifications = pgTable("booking_modifications", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  type: modificationType("type").notNull(),
  status: modificationStatus("status").notNull().default("REQUESTED"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  priceDiff: integer("price_diff").notNull().default(0),
  requestedBy: uuid("requested_by").notNull(),
  decidedBy: uuid("decided_by"),
  decidedAt: ts("decided_at"),
  note: text("note"),
  paymentId: uuid("payment_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────── payments ─────────────────────────
export const payments = pgTable(
  "payments",
  {
    id: id(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    subscriptionId: uuid("subscription_id"),
    userId: uuid("user_id").references(() => users.id),
    purpose: paymentPurpose("purpose").notNull().default("BOOKING"),
    provider: text("provider").notNull(),
    providerOrderId: text("provider_order_id").unique(),
    providerPaymentId: text("provider_payment_id"),
    method: paymentMethod("method").notNull().default("UNKNOWN"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: paymentStatus("status").notNull().default("CREATED"),
    gatewayFee: integer("gateway_fee").notNull().default(0),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    failureReason: text("failure_reason"),
    modificationId: uuid("modification_id"),
    capturedAt: ts("captured_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payments_booking_idx").on(t.bookingId), index("payments_status_idx").on(t.status)],
);

export const paymentTransactions = pgTable("payment_transactions", {
  id: id(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  status: paymentStatus("status").notNull(),
  amount: integer("amount").notNull(),
  raw: jsonb("raw").notNull().default({}),
  createdAt: createdAt(),
});

export const paymentWebhooks = pgTable(
  "payment_webhooks",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    signatureOk: boolean("signature_ok").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: ts("processed_at"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_webhooks_event_uq").on(t.provider, t.eventId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    kind: text("kind").notNull().default("BOOKING"), // BOOKING, FINAL, CREDIT_NOTE
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    subtotal: integer("subtotal").notNull(),
    taxAmount: integer("tax_amount").notNull(),
    total: integer("total").notNull(),
    issuedAt: ts("issued_at").notNull().defaultNow(),
  },
  (t) => [index("invoices_booking_idx").on(t.bookingId)],
);

export const cancellations = pgTable("cancellations", {
  id: id(),
  bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  requestedBy: uuid("requested_by").notNull(),
  requestedRole: text("requested_role").notNull().default("CUSTOMER"),
  approvedBy: uuid("approved_by"),
  refundAmount: integer("refund_amount").notNull().default(0),
  penalty: integer("penalty").notNull().default(0),
  status: text("status").notNull().default("REQUESTED"), // REQUESTED, APPROVED, REJECTED
  adminNotes: text("admin_notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    kind: text("kind").notNull().default("CANCELLATION"), // CANCELLATION, DEPOSIT, EARLY_CHECKOUT, MODIFICATION, GOODWILL
    status: refundStatus("status").notNull().default("REQUESTED"),
    providerRefundId: text("provider_refund_id"),
    requestedBy: uuid("requested_by"),
    approvedBy: uuid("approved_by"),
    adminNotes: text("admin_notes"),
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("refunds_status_idx").on(t.status)],
);

// ───────────────────────── check-in / out ─────────────────────────
export const checkIns = pgTable("check_ins", {
  id: id(),
  bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull(),
  actualTime: ts("actual_time").notNull().defaultNow(),
  idVerified: boolean("id_verified").notNull().default(false),
  idDocType: text("id_doc_type"),
  idLast4: text("id_last4"),
  idFileId: uuid("id_file_id"),
  depositCollected: integer("deposit_collected").notNull().default(0),
  assignedBeds: jsonb("assigned_beds").$type<string[]>().notNull().default([]),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const checkOuts = pgTable("check_outs", {
  id: id(),
  bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull(),
  actualTime: ts("actual_time").notNull().defaultNow(),
  inspection: jsonb("inspection").$type<Record<string, unknown>>().notNull().default({}),
  damageCharges: integer("damage_charges").notNull().default(0),
  extraCharges: integer("extra_charges").notNull().default(0),
  depositRefund: integer("deposit_refund").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  notes: text("notes"),
  createdAt: createdAt(),
});

// ───────────────────────── settlements ─────────────────────────
export const payouts = pgTable(
  "payouts",
  {
    id: id(),
    payoutNumber: text("payout_number").notNull().unique(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    amount: integer("amount").notNull(),
    deductions: integer("deductions").notNull().default(0),
    netAmount: integer("net_amount").notNull(),
    status: payoutStatus("status").notNull().default("PENDING"),
    method: text("method").notNull().default("BANK"),
    periodStart: ts("period_start"),
    periodEnd: ts("period_end"),
    requestedByOwner: boolean("requested_by_owner").notNull().default(false),
    reference: text("reference"),
    notes: text("notes"),
    disputeNote: text("dispute_note"),
    approvedBy: uuid("approved_by"),
    approvedAt: ts("approved_at"),
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payouts_owner_idx").on(t.ownerId, t.status)],
);

export const ownerEarnings = pgTable(
  "owner_earnings",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    grossBookingValue: integer("gross_booking_value").notNull(),
    taxes: integer("taxes").notNull(),
    roomRevenue: integer("room_revenue").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    commission: integer("commission").notNull(),
    gatewayFee: integer("gateway_fee").notNull(),
    platformDiscount: integer("platform_discount").notNull(),
    propertyDiscount: integer("property_discount").notNull(),
    penalties: integer("penalties").notNull().default(0),
    refundDeduction: integer("refund_deduction").notNull().default(0),
    adjustments: integer("adjustments").notNull().default(0),
    netPayable: integer("net_payable").notNull(),
    status: earningStatus("status").notNull().default("PENDING"),
    eligibleAt: ts("eligible_at"),
    payoutId: uuid("payout_id").references(() => payouts.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("earnings_owner_idx").on(t.ownerId, t.status)],
);

export const payoutTransactions = pgTable("payout_transactions", {
  id: id(),
  payoutId: uuid("payout_id").notNull().references(() => payouts.id, { onDelete: "cascade" }),
  status: payoutStatus("status").notNull(),
  note: text("note"),
  reference: text("reference"),
  actorId: uuid("actor_id"),
  createdAt: createdAt(),
});

// ───────────────────────── reviews / favourites ─────────────────────────
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id),
    customerId: uuid("customer_id").notNull().references(() => users.id),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    cleanliness: integer("cleanliness").notNull(),
    location: integer("location").notNull(),
    staff: integer("staff").notNull(),
    facilities: integer("facilities").notNull(),
    valueForMoney: integer("value_for_money").notNull(),
    foodQuality: integer("food_quality"),
    safety: integer("safety").notNull(),
    overall: integer("overall").notNull(),
    title: text("title"),
    text: text("text"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    status: reviewStatus("status").notNull().default("PUBLISHED"),
    reportCount: integer("report_count").notNull().default(0),
    reportReasons: jsonb("report_reasons").$type<{ userId: string; reason: string }[]>().notNull().default([]),
    moderatedBy: uuid("moderated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("reviews_prop_idx").on(t.propertyId, t.status)],
);

export const reviewReplies = pgTable("review_replies", {
  id: id(),
  reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

export const favourites = pgTable(
  "favourites",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.propertyId] })],
);

// ───────────────────────── notifications / support ─────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannel("channel").notNull(),
    template: text("template").notNull(),
    recipient: text("recipient"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("SENT"), // QUEUED, SENT, FAILED
    provider: text("provider"),
    error: text("error"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.channel, t.readAt)],
);

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: id(),
    key: text("key").notNull(),
    channel: notificationChannel("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    active: boolean("active").notNull().default(true),
    updatedBy: uuid("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("notification_templates_uq").on(t.key, t.channel)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    ticketNumber: text("ticket_number").notNull().unique(),
    raisedById: uuid("raised_by_id").notNull().references(() => users.id),
    raisedByRole: text("raised_by_role").notNull().default("CUSTOMER"),
    bookingId: uuid("booking_id").references(() => bookings.id),
    propertyId: uuid("property_id").references(() => properties.id),
    category: ticketCategory("category").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
    priority: ticketPriority("priority").notNull().default("MEDIUM"),
    status: ticketStatus("status").notNull().default("OPEN"),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    resolution: text("resolution"),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tickets_status_idx").on(t.status), index("tickets_raiser_idx").on(t.raisedById)],
);

export const supportMessages = pgTable("support_messages", {
  id: id(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});

// ───────────────────────── platform / CMS / audit ─────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_actor_idx").on(t.actorId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

export const applicationSettings = pgTable("application_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  group: text("group").notNull().default("general"),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedBy: uuid("updated_by"),
  updatedAt: updatedAt(),
});

export const banners = pgTable("banners", {
  id: id(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  placement: text("placement").notNull().default("HOME_HERO"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const faqs = pgTable("faqs", {
  id: id(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").notNull().default("GENERAL"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contentPages = pgTable("content_pages", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  updatedBy: uuid("updated_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────── subscriptions (priced by the app owner) ─────────────────────────
export type PlanBenefits = {
  /** CUSTOMER plans */
  bookingDiscountBps?: number;
  maxDiscountPerBooking?: number; // paise
  waiveConvenienceFee?: boolean;
  /** OWNER plans */
  commissionBps?: number; // overrides platform commission if lower
  featuredListing?: boolean;
  maxProperties?: number;
  prioritySupport?: boolean;
};

export const subscriptionPlans = pgTable("subscription_plans", {
  id: id(),
  audience: text("audience").notNull(), // CUSTOMER | OWNER
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(), // paise, set by admin
  durationDays: integer("duration_days").notNull().default(30),
  benefits: jsonb("benefits").$type<PlanBenefits>().notNull().default({}),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  isPopular: boolean("is_popular").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...audit(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id),
    audience: text("audience").notNull(),
    status: text("status").notNull().default("PENDING_PAYMENT"), // PENDING_PAYMENT, ACTIVE, EXPIRED, CANCELLED
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    pricePaid: integer("price_paid").notNull().default(0),
    planSnapshot: jsonb("plan_snapshot").$type<{ name: string; benefits: PlanBenefits; durationDays: number }>().notNull(),
    paymentId: uuid("payment_id"),
    grantedBy: uuid("granted_by"), // admin-granted complimentary plans
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId, t.status)],
);

/** Live chat between customers/owners/visitors and the StayShare support team. */
export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    visitorName: text("visitor_name"),
    visitorContact: text("visitor_contact"),
    visitorToken: text("visitor_token").unique(), // lets anonymous visitors resume their chat
    status: text("status").notNull().default("OPEN"), // OPEN, CLOSED
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    unreadForAgent: integer("unread_for_agent").notNull().default(0),
    unreadForUser: integer("unread_for_user").notNull().default(0),
    ticketId: uuid("ticket_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("chat_status_idx").on(t.status, t.lastMessageAt)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id),
    fromAgent: boolean("from_agent").notNull().default(false),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_conv_idx").on(t.conversationId, t.createdAt)],
);

/** Atomic counters for human-readable numbers (bookings, invoices, tickets, payouts). */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

// ───────────────────────── relations (for db.query.*) ─────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  roles: many(userRoles),
  customerProfile: one(customerProfiles, { fields: [users.id], references: [customerProfiles.userId] }),
  ownerProfile: one(ownerProfiles, { fields: [users.id], references: [ownerProfiles.userId] }),
  staffProfile: one(staffProfiles, { fields: [users.id], references: [staffProfiles.userId] }),
}));
export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(userRoles),
  permissions: many(rolePermissions),
}));
export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));
export const citiesRelations = relations(cities, ({ many }) => ({
  localities: many(localities),
  properties: many(properties),
}));
export const localitiesRelations = relations(localities, ({ one }) => ({
  city: one(cities, { fields: [localities.cityId], references: [cities.id] }),
}));
export const propertiesRelations = relations(properties, ({ one, many }) => ({
  city: one(cities, { fields: [properties.cityId], references: [cities.id] }),
  locality: one(localities, { fields: [properties.localityId], references: [localities.id] }),
  propertyType: one(propertyTypes, { fields: [properties.propertyTypeId], references: [propertyTypes.id] }),
  owner: one(users, { fields: [properties.ownerId], references: [users.id] }),
  cancellationPolicy: one(cancellationPolicies, {
    fields: [properties.cancellationPolicyId],
    references: [cancellationPolicies.id],
  }),
  images: many(propertyImages),
  facilities: many(propertyFacilities),
  rules: many(propertyRules),
  floors: many(floors),
  rooms: many(rooms),
  documents: many(propertyDocuments),
}));
export const propertyImagesRelations = relations(propertyImages, ({ one }) => ({
  property: one(properties, { fields: [propertyImages.propertyId], references: [properties.id] }),
}));
export const propertyFacilitiesRelations = relations(propertyFacilities, ({ one }) => ({
  property: one(properties, { fields: [propertyFacilities.propertyId], references: [properties.id] }),
  facility: one(facilities, { fields: [propertyFacilities.facilityId], references: [facilities.id] }),
}));
export const propertyRulesRelations = relations(propertyRules, ({ one }) => ({
  property: one(properties, { fields: [propertyRules.propertyId], references: [properties.id] }),
}));
export const propertyDocumentsRelations = relations(propertyDocuments, ({ one }) => ({
  property: one(properties, { fields: [propertyDocuments.propertyId], references: [properties.id] }),
  file: one(fileUploads, { fields: [propertyDocuments.fileId], references: [fileUploads.id] }),
}));
export const floorsRelations = relations(floors, ({ one, many }) => ({
  property: one(properties, { fields: [floors.propertyId], references: [properties.id] }),
  rooms: many(rooms),
}));
export const roomsRelations = relations(rooms, ({ one, many }) => ({
  property: one(properties, { fields: [rooms.propertyId], references: [properties.id] }),
  floor: one(floors, { fields: [rooms.floorId], references: [floors.id] }),
  beds: many(beds),
  images: many(roomImages),
  facilities: many(roomFacilities),
  pricePlans: many(pricePlans),
}));
export const roomImagesRelations = relations(roomImages, ({ one }) => ({
  room: one(rooms, { fields: [roomImages.roomId], references: [rooms.id] }),
}));
export const roomFacilitiesRelations = relations(roomFacilities, ({ one }) => ({
  room: one(rooms, { fields: [roomFacilities.roomId], references: [rooms.id] }),
  facility: one(facilities, { fields: [roomFacilities.facilityId], references: [facilities.id] }),
}));
export const bedsRelations = relations(beds, ({ one }) => ({
  room: one(rooms, { fields: [beds.roomId], references: [rooms.id] }),
}));
export const pricePlansRelations = relations(pricePlans, ({ one, many }) => ({
  room: one(rooms, { fields: [pricePlans.roomId], references: [rooms.id] }),
  durationPrices: many(durationPrices),
}));
export const durationPricesRelations = relations(durationPrices, ({ one }) => ({
  pricePlan: one(pricePlans, { fields: [durationPrices.pricePlanId], references: [pricePlans.id] }),
}));
export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  customer: one(users, { fields: [bookings.customerId], references: [users.id] }),
  property: one(properties, { fields: [bookings.propertyId], references: [properties.id] }),
  room: one(rooms, { fields: [bookings.roomId], references: [rooms.id] }),
  guests: many(bookingGuests),
  beds: many(bookingBeds),
  services: many(bookingServices),
  statusHistory: many(bookingStatusHistory),
  modifications: many(bookingModifications),
  payments: many(payments),
  invoices: many(invoices),
  refunds: many(refunds),
  cancellation: one(cancellations, { fields: [bookings.id], references: [cancellations.bookingId] }),
  checkInRecord: one(checkIns, { fields: [bookings.id], references: [checkIns.bookingId] }),
  checkOutRecord: one(checkOuts, { fields: [bookings.id], references: [checkOuts.bookingId] }),
  review: one(reviews, { fields: [bookings.id], references: [reviews.bookingId] }),
  earning: one(ownerEarnings, { fields: [bookings.id], references: [ownerEarnings.bookingId] }),
}));
export const bookingGuestsRelations = relations(bookingGuests, ({ one }) => ({
  booking: one(bookings, { fields: [bookingGuests.bookingId], references: [bookings.id] }),
}));
export const bookingBedsRelations = relations(bookingBeds, ({ one }) => ({
  booking: one(bookings, { fields: [bookingBeds.bookingId], references: [bookings.id] }),
  bed: one(beds, { fields: [bookingBeds.bedId], references: [beds.id] }),
}));
export const bookingServicesRelations = relations(bookingServices, ({ one }) => ({
  booking: one(bookings, { fields: [bookingServices.bookingId], references: [bookings.id] }),
}));
export const bookingStatusHistoryRelations = relations(bookingStatusHistory, ({ one }) => ({
  booking: one(bookings, { fields: [bookingStatusHistory.bookingId], references: [bookings.id] }),
}));
export const bookingModificationsRelations = relations(bookingModifications, ({ one }) => ({
  booking: one(bookings, { fields: [bookingModifications.bookingId], references: [bookings.id] }),
}));
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(subscriptionPlans, { fields: [subscriptions.planId], references: [subscriptionPlans.id] }),
}));
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
  transactions: many(paymentTransactions),
  refunds: many(refunds),
}));
export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  payment: one(payments, { fields: [paymentTransactions.paymentId], references: [payments.id] }),
}));
export const invoicesRelations = relations(invoices, ({ one }) => ({
  booking: one(bookings, { fields: [invoices.bookingId], references: [bookings.id] }),
}));
export const cancellationsRelations = relations(cancellations, ({ one }) => ({
  booking: one(bookings, { fields: [cancellations.bookingId], references: [bookings.id] }),
}));
export const refundsRelations = relations(refunds, ({ one }) => ({
  booking: one(bookings, { fields: [refunds.bookingId], references: [bookings.id] }),
  payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
}));
export const checkInsRelations = relations(checkIns, ({ one }) => ({
  booking: one(bookings, { fields: [checkIns.bookingId], references: [bookings.id] }),
}));
export const checkOutsRelations = relations(checkOuts, ({ one }) => ({
  booking: one(bookings, { fields: [checkOuts.bookingId], references: [bookings.id] }),
}));
export const ownerEarningsRelations = relations(ownerEarnings, ({ one }) => ({
  booking: one(bookings, { fields: [ownerEarnings.bookingId], references: [bookings.id] }),
  owner: one(users, { fields: [ownerEarnings.ownerId], references: [users.id] }),
  property: one(properties, { fields: [ownerEarnings.propertyId], references: [properties.id] }),
  payout: one(payouts, { fields: [ownerEarnings.payoutId], references: [payouts.id] }),
}));
export const payoutsRelations = relations(payouts, ({ one, many }) => ({
  owner: one(users, { fields: [payouts.ownerId], references: [users.id] }),
  earnings: many(ownerEarnings),
  transactions: many(payoutTransactions),
}));
export const payoutTransactionsRelations = relations(payoutTransactions, ({ one }) => ({
  payout: one(payouts, { fields: [payoutTransactions.payoutId], references: [payouts.id] }),
}));
export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  customer: one(users, { fields: [reviews.customerId], references: [users.id] }),
  property: one(properties, { fields: [reviews.propertyId], references: [properties.id] }),
  replies: many(reviewReplies),
}));
export const reviewRepliesRelations = relations(reviewReplies, ({ one }) => ({
  review: one(reviews, { fields: [reviewReplies.reviewId], references: [reviews.id] }),
  author: one(users, { fields: [reviewReplies.authorId], references: [users.id] }),
}));
export const favouritesRelations = relations(favourites, ({ one }) => ({
  user: one(users, { fields: [favourites.userId], references: [users.id] }),
  property: one(properties, { fields: [favourites.propertyId], references: [properties.id] }),
}));
export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  raisedBy: one(users, { fields: [supportTickets.raisedById], references: [users.id], relationName: "raiser" }),
  assignedTo: one(users, { fields: [supportTickets.assignedToId], references: [users.id], relationName: "assignee" }),
  booking: one(bookings, { fields: [supportTickets.bookingId], references: [bookings.id] }),
  messages: many(supportMessages),
}));
export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  ticket: one(supportTickets, { fields: [supportMessages.ticketId], references: [supportTickets.id] }),
  author: one(users, { fields: [supportMessages.authorId], references: [users.id] }),
}));
export const identityDocumentsRelations = relations(identityDocuments, ({ one }) => ({
  user: one(users, { fields: [identityDocuments.userId], references: [users.id] }),
  file: one(fileUploads, { fields: [identityDocuments.fileId], references: [fileUploads.id] }),
}));
export const staffProfilesRelations = relations(staffProfiles, ({ one }) => ({
  user: one(users, { fields: [staffProfiles.userId], references: [users.id] }),
}));
export const staffAssignmentsRelations = relations(staffAssignments, ({ one }) => ({
  user: one(users, { fields: [staffAssignments.userId], references: [users.id] }),
  property: one(properties, { fields: [staffAssignments.propertyId], references: [properties.id] }),
}));
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));
export const inventoryBlocksRelations = relations(inventoryBlocks, ({ one }) => ({
  property: one(properties, { fields: [inventoryBlocks.propertyId], references: [properties.id] }),
  room: one(rooms, { fields: [inventoryBlocks.roomId], references: [rooms.id] }),
  bed: one(beds, { fields: [inventoryBlocks.bedId], references: [beds.id] }),
}));
export const maintenanceIssuesRelations = relations(maintenanceIssues, ({ one }) => ({
  property: one(properties, { fields: [maintenanceIssues.propertyId], references: [properties.id] }),
  room: one(rooms, { fields: [maintenanceIssues.roomId], references: [rooms.id] }),
}));
export const couponsRelations = relations(coupons, ({ one }) => ({
  city: one(cities, { fields: [coupons.cityId], references: [cities.id] }),
  property: one(properties, { fields: [coupons.propertyId], references: [properties.id] }),
}));
