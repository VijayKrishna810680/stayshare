import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { identityDocuments, ownerProfiles } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { encrypt, last4 } from "@/lib/crypto";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";

const blank = z.literal("").transform(() => null);
const schema = z.object({
  businessName: z.string().trim().min(2, "Business name is required").max(120),
  businessType: z.string().trim().max(60).nullable().optional().or(blank),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN").nullable().optional().or(blank),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)").optional().or(z.literal("").transform(() => undefined)),
  address: z.string().trim().min(5, "Enter your business address").max(300),
  submit: z.boolean().default(false),
});

/** PUT: save business & KYC details (PAN encrypted); submit=true sends them for StayShare review. */
export const PUT = api(async (req) => {
  const u = await requireOwner();
  const body = await parseBody(req, schema);
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, u.id));
  if (!op) throw notFound("Partner profile not found");
  if (op.kycStatus === "APPROVED" && (body.pan || body.gstin !== op.gstin)) throw conflict("Your KYC is approved. Contact StayShare support to change PAN or GSTIN.");
  const patch: Partial<typeof ownerProfiles.$inferInsert> = { businessName: body.businessName, businessType: body.businessType ?? null, gstin: body.gstin ?? null, address: body.address };
  if (body.pan) Object.assign(patch, { panEnc: encrypt(body.pan), panLast4: last4(body.pan) });
  if (body.submit) {
    if (op.kycStatus === "PENDING") throw conflict("Your KYC is already under review");
    if (op.kycStatus === "APPROVED") throw conflict("Your KYC is already approved");
    if (!body.pan && !op.panEnc) throw badRequest("PAN is required for KYC");
    const [docs] = await db.select({ n: sql<number>`count(*)::int` }).from(identityDocuments).where(and(eq(identityDocuments.userId, u.id), sql`${identityDocuments.deletedAt} IS NULL`));
    if (!Number(docs?.n)) throw badRequest("Upload at least one KYC document (e.g. PAN card)");
    Object.assign(patch, { kycStatus: "PENDING", kycNotes: null });
  }
  await db.update(ownerProfiles).set(patch).where(eq(ownerProfiles.id, op.id));
  await audit({ actorId: u.id, action: body.submit ? "kyc.submit" : "kyc.update", entityType: "owner_profile", entityId: op.id, after: { businessName: body.businessName, gstin: body.gstin, panLast4: body.pan ? last4(body.pan) : op.panLast4 }, ...reqMeta(req) });
  return { ok: true };
});
