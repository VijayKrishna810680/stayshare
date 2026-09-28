import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ownerProfiles } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { logAudit } from "../../../_lib/util";

/** POST {verified, notes} — mark owner bank/UPI details verified (enables payouts). */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("kyc.approve", "payouts.manage");
  const b = await parseBody(req, z.object({ verified: z.boolean(), notes: z.string().max(500).nullable().optional() }));
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, params.id));
  if (!op) throw notFound("Owner not found");
  if (b.verified && !op.bankAccountLast4 && !op.upiId) throw badRequest("The owner has not added bank or UPI details yet");
  await db.update(ownerProfiles).set({ bankVerified: b.verified, bankVerifiedBy: b.verified ? u.id : null }).where(eq(ownerProfiles.id, op.id));
  await logAudit(req, u, b.verified ? "owner.bank_verify" : "owner.bank_unverify", "owner", params.id, { bankVerified: op.bankVerified }, { bankVerified: b.verified, notes: b.notes });
  return { bankVerified: b.verified };
});
