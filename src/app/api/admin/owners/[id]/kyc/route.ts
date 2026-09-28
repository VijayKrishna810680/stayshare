import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { identityDocuments, ownerProfiles, users } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { notify } from "@/services/notifications";
import { logAudit } from "../../../_lib/util";

/** POST {action: approve|reject, notes} — owner KYC decision. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("kyc.approve");
  const b = await parseBody(req, z.object({ action: z.enum(["approve", "reject"]), notes: z.string().trim().max(1000).nullable().optional() }));
  if (b.action === "reject" && (!b.notes || b.notes.length < 3)) throw badRequest("Add a reason so the owner knows what to fix");
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, params.id));
  if (!op) throw notFound("Owner not found");
  const status = b.action === "approve" ? "APPROVED" : "REJECTED";
  await db.update(ownerProfiles).set({ kycStatus: status, kycNotes: b.notes ?? null, kycReviewedBy: u.id, kycReviewedAt: new Date() }).where(eq(ownerProfiles.id, op.id));
  await db
    .update(identityDocuments)
    .set({ status, verifiedBy: u.id, verifiedAt: new Date() })
    .where(and(eq(identityDocuments.userId, params.id), eq(identityDocuments.status, "PENDING")));
  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, params.id));
  await logAudit(req, u, `owner.kyc_${b.action}`, "owner", params.id, { kycStatus: op.kycStatus }, { kycStatus: status, notes: b.notes });
  await notify(status === "APPROVED" ? "owner.approved" : "owner.rejected", { userId: params.id, vars: { name: owner?.name, reason: b.notes ?? "" } });
  return { kycStatus: status };
});
