import { z } from "zod";

/** Shared zod schemas for owner forms & APIs (usable on client and server). No price fields here by design. */
const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const GENDER = z.enum(["MALE_ONLY", "FEMALE_ONLY", "MIXED", "FAMILY", "ANY"]);

export const propertyBasicSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(120),
  propertyTypeId: uuid,
  description: z.string().trim().min(30, "Describe your property in at least 30 characters").max(5000),
  genderEligibility: GENDER,
  targetAudience: z.array(z.string().max(40)).max(10).default([]),
});

export const propertyLocationSchema = z.object({
  addressLine: z.string().trim().min(5, "Enter the full address").max(300),
  landmark: optText(120),
  cityId: uuid,
  localityId: uuid.optional().nullable(),
  state: z.string().trim().min(2, "State is required").max(80),
  postalCode: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit PIN code"),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

export const propertyPolicySchema = z
  .object({
    checkInTime: time.default("12:00"),
    checkOutTime: time.default("11:00"),
    minStayNights: z.number().int().min(1).max(365).default(1),
    maxStayNights: z.number().int().min(1).max(1095).default(365),
    idProofRequired: z.boolean().default(true),
    instantBooking: z.boolean().default(true),
    allowCashAtProperty: z.boolean().default(false),
    foodIncluded: z.boolean().default(false),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+?\d{10,13}$/, "Enter a valid phone number")
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null)),
    showOwnerPhone: z.boolean().default(false),
  });

export const propertyCreateSchema = propertyBasicSchema.merge(propertyLocationSchema).merge(propertyPolicySchema).refine((v) => v.maxStayNights >= v.minStayNights, { message: "Maximum stay must be at least the minimum stay", path: ["maxStayNights"] });
export const propertyUpdateSchema = propertyBasicSchema.merge(propertyLocationSchema).merge(propertyPolicySchema).partial();

export const roomSchema = z
  .object({
    roomNumber: z.string().trim().min(1, "Room number is required").max(20).regex(/^[A-Za-z0-9\-]+$/, "Use letters, numbers and dashes only"),
    floorId: uuid.optional().nullable(),
    name: optText(80),
    category: z.enum(["PRIVATE", "SHARED", "FAMILY", "DORMITORY"]),
    sharingCapacity: z.number().int().min(1).max(12),
    maxOccupancy: z.number().int().min(1).max(20),
    isAC: z.boolean(),
    bathroom: z.enum(["ATTACHED", "COMMON"]),
    furnishing: z.enum(["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]),
    genderEligibility: GENDER,
    sizeSqft: z.number().int().min(20).max(10000).optional().nullable(),
    description: optText(2000),
    allowBedBooking: z.boolean(),
    allowEntireRoomBooking: z.boolean(),
    facilityIds: z.array(uuid).max(50).default([]),
    bedType: z.enum(["SINGLE", "BUNK_UPPER", "BUNK_LOWER", "DOUBLE", "QUEEN"]).optional(),
  })
  .refine((r) => r.allowBedBooking || r.allowEntireRoomBooking, { message: "Allow bed booking, entire-room booking, or both", path: ["allowBedBooking"] })
  .refine((r) => r.maxOccupancy >= r.sharingCapacity || r.category === "FAMILY", { message: "Max occupancy must be at least the number of beds", path: ["maxOccupancy"] });

export const suggestedPriceSchema = z.object({
  suggestedNightlyBed: z.number().int().min(0).max(100_000_00).nullable(),
  suggestedNightlyRoom: z.number().int().min(0).max(100_000_00).nullable(),
  suggestedMonthlyBed: z.number().int().min(0).max(10_000_000_00).nullable(),
  suggestedMonthlyRoom: z.number().int().min(0).max(10_000_000_00).nullable(),
  suggestedDeposit: z.number().int().min(0).max(10_000_000_00).nullable(),
  suggestedNote: z.string().trim().max(500).nullable(),
});

export const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email("Enter a valid email").optional().nullable().or(z.literal("").transform(() => null)),
  phone: z.string().trim().regex(/^\+?\d{10,13}$/, "Enter a valid mobile number").optional().nullable().or(z.literal("").transform(() => null)),
  password: z.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/, "At least 8 characters with upper & lower case letters, a number and a symbol."),
  designation: optText(60),
  propertyIds: z.array(uuid).max(100).default([]),
}).refine((v) => v.email || v.phone, { message: "Enter an email or mobile number", path: ["email"] });

export const floorSchema = z.object({ number: z.number().int().min(-5).max(200), name: z.string().trim().max(60).optional().nullable() });
