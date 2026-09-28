import { z } from "zod";
import { api, parseQuery } from "@/lib/api";
import { exportResponse } from "@/lib/export";
import { requireOwner } from "@/lib/owner-access";
import { EARNINGS_EXPORT_COLUMNS, earningRows } from "@/services/owner-reports";

const blank = z.literal("").transform(() => undefined);
const q = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]).default("csv"),
  propertyId: z.string().uuid().optional().or(blank),
  status: z.enum(["PENDING", "ELIGIBLE", "ON_HOLD", "IN_PAYOUT", "PAID", "REVERSED"]).optional().or(blank),
});

/** GET: earnings statement export (CSV, Excel, PDF). */
export const GET = api(async (req) => {
  const u = await requireOwner();
  const f = parseQuery(req, q);
  const rows = await earningRows(u.id, f);
  return exportResponse("earnings-statement", EARNINGS_EXPORT_COLUMNS, rows, f.format);
});
