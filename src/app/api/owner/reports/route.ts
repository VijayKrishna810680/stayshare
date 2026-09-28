import { z } from "zod";
import { api, parseQuery } from "@/lib/api";
import { addDays, todayIST } from "@/lib/dates";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { assertOwnsProperty, requireOwner } from "@/lib/owner-access";
import { REPORT_COLUMNS, bookingsReport, occupancyReport, revenueReport } from "@/services/owner-reports";

const blank = z.literal("").transform(() => undefined);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const q = z.object({
  type: z.enum(["occupancy", "bookings", "revenue"]).default("bookings"),
  format: z.enum(["csv", "xlsx", "pdf", "json"]).default("json"),
  from: date.optional().or(blank),
  to: date.optional().or(blank),
  propertyId: z.string().uuid().optional().or(blank),
  status: z.string().max(40).optional().or(blank),
});

/** GET: owner reports (occupancy / bookings / revenue by property) as JSON or CSV/Excel/PDF. */
export const GET = api(async (req) => {
  const u = await requireOwner();
  const f = parseQuery(req, q);
  if (f.propertyId) await assertOwnsProperty(u, f.propertyId);
  const to = f.to ?? addDays(todayIST(), 1);
  const from = f.from ?? addDays(to, -30);
  const filters = { from, to, propertyId: f.propertyId, status: f.status };
  const rows = f.type === "occupancy" ? await occupancyReport(u.id, filters) : f.type === "revenue" ? await revenueReport(u.id, filters) : await bookingsReport(u.id, filters);
  if (f.format === "json") return { rows, from, to };
  return exportResponse(`${f.type}-report`, REPORT_COLUMNS[f.type] as unknown as ExportColumn[], rows as Record<string, unknown>[], f.format, `${f.type} report · ${from} to ${to}`);
});
