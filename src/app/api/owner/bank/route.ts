import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ownerProfiles, users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { encrypt, last4 } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";
import { requireOwner } from "@/lib/owner-access";

const blank = z.literal("").transform(() => null);
const schema = z.object({
  bankAccountName: z.string().trim().min(2, "Account holder name is required").max(120).nullable().optional().or(blank),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, "Account number must be 9–18 digits").optional().or(z.literal("").transform(() => undefined)),
  bankIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC (e.g. HDFC0001234)").nullable().optional().or(blank),
  bankName: z.string().trim().max(80).nullable().optional().or(blank),
  upiId: z.string().trim().regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, "Enter a valid UPI ID (name@bank)").nullable().optional().or(blank),
  currentPassword: z.string().min(1, "Confirm with your password"),
});

/** PUT: change payout bank / UPI details. Any change resets verification (finance team re-verifies). */
export const PUT = api(async (req) => {
  const u = await requireOwner();
  const body = await parseBody(req, schema);
  const [usr] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, u.id));
  if (!usr?.passwordHash || !(await verifyPassword(body.currentPassword, usr.passwordHash))) throw badRequest("Password is incorrect");
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, u.id));
  if (!op) throw notFound("Partner profile not found");
  const hasAccount = Boolean(body.accountNumber || op.bankAccountEnc);
  if (hasAccount && (!body.bankIfsc || !body.bankAccountName)) throw badRequest("Account holder name and IFSC are required with a bank account");
  if (!hasAccount && !body.upiId) throw badRequest("Add a bank account or a UPI ID");
  const patch: Partial<typeof ownerProfiles.$inferInsert> = {
    bankAccountName: body.bankAccountName ?? null,
    bankIfsc: body.bankIfsc ?? null,
    bankName: body.bankName ?? null,
    upiId: body.upiId ?? null,
  };
  if (body.accountNumber) Object.assign(patch, { bankAccountEnc: encrypt(body.accountNumber), bankAccountLast4: last4(body.accountNumber) });
  const changed = Boolean(body.accountNumber) || patch.bankIfsc !== op.bankIfsc || patch.upiId !== op.upiId || patch.bankAccountName !== op.bankAccountName;
  if (changed) Object.assign(patch, { bankVerified: false, bankVerifiedBy: null });
  await db.update(ownerProfiles).set(patch).where(eq(ownerProfiles.id, op.id));
  await audit({ actorId: u.id, action: "bank.update", entityType: "owner_profile", entityId: op.id, before: { last4: op.bankAccountLast4, ifsc: op.bankIfsc, upi: op.upiId, verified: op.bankVerified }, after: { last4: body.accountNumber ? last4(body.accountNumber) : op.bankAccountLast4, ifsc: patch.bankIfsc, upi: patch.upiId, verified: changed ? false : op.bankVerified }, ...reqMeta(req) });
  return { ok: true, verificationReset: changed };
});
