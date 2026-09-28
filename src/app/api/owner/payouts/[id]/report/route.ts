import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payouts } from "@/db/schema";
import { api, parseQuery } from "@/lib/api";
import { exportResponse } from "@/lib/export";
import { notFound } from "@/lib/errors";
import { formatINRAscii } from "@/lib/money";
import { requireOwner } from "@/lib/owner-access";
import { EARNINGS_EXPORT_COLUMNS, earningRows } from "@/services/owner-reports";

/** GET ?format=: settlement report for one payout (the earnings it bundles). */
export const GET = api<{ id: string }>(async (req, { params }) => {
  const u = await requireOwner();
  const { format } = parseQuery(req, z.object({ format: z.enum(["csv", "xlsx", "pdf"]).default("pdf") }));
  const [po] = await db.select().from(payouts).where(and(eq(payouts.id, params.id), eq(payouts.ownerId, u.id)));
  if (!po) throw notFound("Payout not found");
  const rows = await earningRows(u.id, { payoutId: po.id });
  const subtitle = `Payout ${po.payoutNumber} · ${po.status} · Amount ${formatINRAscii(po.amount)} · Deductions ${formatINRAscii(po.deductions)} · Net ${formatINRAscii(po.netAmount)}${po.reference ? ` · Ref ${po.reference}` : ""}`;
  return exportResponse(`settlement-${po.payoutNumber}`, EARNINGS_EXPORT_COLUMNS, rows, format, subtitle);
});
