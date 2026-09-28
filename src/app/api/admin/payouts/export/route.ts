import { api } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { exportResponse, type ExportFormat } from "@/lib/export";
import { getReport, parseReportFilters } from "@/services/reports";
import { logAudit } from "../../_lib/util";

/** GET ?format=csv|xlsx|pdf&from&to&owner — payout report for the payouts team. */
export const GET = api(async (req) => {
  const u = await requirePermission("payouts.manage");
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  const rep = getReport("payouts")!;
  const f = parseReportFilters({ from: "2000-01-01", ...q });
  const rows = await rep.run(f);
  const format = (["csv", "xlsx", "pdf"].includes(q.format ?? "") ? q.format : "csv") as ExportFormat;
  await logAudit(req, u, "report.export", "report", "payouts", null, { format, filters: f });
  return exportResponse("stayshare-payouts", rep.columns, rows, format, `Owner payouts · ${f.from} to ${f.to}`);
});
