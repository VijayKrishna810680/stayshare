import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { properties } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { refreshStartingPrice } from "@/services/pricing";
import { defined, logAudit } from "../../_lib/util";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const schema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  addressLine: z.string().trim().min(3).max(300).optional(),
  landmark: z.string().trim().max(200).nullable().optional(),
  postalCode: z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits").optional(),
  localityId: z.string().uuid().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  genderEligibility: z.enum(["MALE_ONLY", "FEMALE_ONLY", "MIXED", "FAMILY", "ANY"]).optional(),
  minStayNights: z.number().int().min(1).max(365).optional(),
  maxStayNights: z.number().int().min(1).max(3650).optional(),
  checkInTime: time.optional(),
  checkOutTime: time.optional(),
  contactPhone: z.string().trim().max(20).nullable().optional(),
  active: z.boolean().optional(),
  blocked: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  showOwnerPhone: z.boolean().optional(),
  allowCashAtProperty: z.boolean().optional(),
  instantBooking: z.boolean().optional(),
  idProofRequired: z.boolean().optional(),
  foodIncluded: z.boolean().optional(),
});

/** PATCH key fields / flags of any property (block, activate, feature, contact visibility…). */
export const PATCH = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("properties.manage");
  const b = defined(await parseBody(req, schema));
  if (!Object.keys(b).length) throw badRequest("Nothing to update");
  const [before] = await db.select().from(properties).where(eq(properties.id, params.id));
  if (!before) throw notFound("Property not found");
  const min = b.minStayNights ?? before.minStayNights;
  const max = b.maxStayNights ?? before.maxStayNights;
  if (max < min) throw badRequest("Max stay must be at least the min stay");
  const [after] = await db.update(properties).set({ ...b, updatedBy: u.id }).where(eq(properties.id, params.id)).returning();
  if (b.active !== undefined || b.blocked !== undefined) await refreshStartingPrice(params.id);
  const changed = Object.keys(b);
  await logAudit(req, u, b.blocked !== undefined ? (b.blocked ? "property.block" : "property.unblock") : "property.update", "property", params.id, Object.fromEntries(changed.map((k) => [k, before[k as keyof typeof before]])), b);
  return after;
});
