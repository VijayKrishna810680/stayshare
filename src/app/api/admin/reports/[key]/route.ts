import { api } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { forbidden, notFound } from "@/lib/errors";
import { exportResponse, type ExportFormat } from "@/lib/export";
import { getReport, parseReportFilters } from "@/services/reports";
import { logAudit } from "../../_lib/util";

/** GET /api/admin/reports/:key?format=csv|xlsx|pdf|json&from&to&city&property&owner&status&category&sharing&paymentStatus&unit */
export const GET = api<{ key: string }>(async (req, { params }) => {
  const u = await requirePermission("reports.view");
  const rep = getReport(params.key);
  if (!rep) throw notFound("Unknown report");
  if (rep.financial && !u.has("reports.financial")) throw forbidden("This financial report needs the reports.financial permission");
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  const f = parseReportFilters(q);
  const rows = await rep.run(f);
  const format = (["csv", "xlsx", "pdf"].includes(q.format ?? "") ? q.format : "json") as ExportFormat | "json";
  if (format === "json") return { columns: rep.columns, rows, filters: f };
  await logAudit(req, u, "report.export", "report", rep.key, null, { format, filters: f, rows: rows.length });
  return exportResponse(`stayshare-${rep.key}`, rep.columns, rows, format, `${rep.label} · ${f.from} to ${f.to} · generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
});
