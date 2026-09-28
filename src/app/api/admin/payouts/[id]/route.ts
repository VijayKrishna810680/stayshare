import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payouts } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { badRequest, notFound } from "@/lib/errors";
import { transitionPayout } from "@/services/settlement";
import { logAudit } from "../../_lib/util";

const schema = z.object({
  to: z.enum(["APPROVED", "ON_HOLD", "PROCESSING", "PAID", "FAILED", "REVERSED", "PENDING"]),
  note: z.string().trim().max(1000).nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  deductions: z.number().int().min(0).nullable().optional(),
});

/** POST — move a payout through APPROVED / ON_HOLD / PROCESSING / PAID (UTR) / FAILED / REVERSED. */
export const POST = api<{ id: string }>(async (req, { params }) => {
  const u = await requirePermission("payouts.manage");
  const b = await parseBody(req, schema);
  const [before] = await db.select().from(payouts).where(eq(payouts.id, params.id));
  if (!before) throw notFound("Payout not found");
  if (b.to === "PAID" && !b.reference) throw badRequest("Enter the bank reference / UTR for the transfer");
  if (["ON_HOLD", "FAILED", "REVERSED"].includes(b.to) && (!b.note || b.note.length < 3)) throw badRequest("Add a note explaining this status change");
  if (b.deductions && !b.note) throw badRequest("Explain the deduction in the note");
  const res = await transitionPayout(params.id, b.to, u.id, { note: b.note ?? undefined, reference: b.reference ?? undefined, deductions: b.deductions ?? undefined });
  await logAudit(req, u, `payout.${b.to.toLowerCase()}`, "payout", params.id, before, res);
  return res;
});
