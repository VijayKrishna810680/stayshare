import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Tabular export helpers used by admin & owner reports.
 *   return exportResponse("bookings", columns, rows, format)
 * Money columns: pass `money: true` and values in paise — rendered as rupees.
 */
export type ExportColumn = { key: string; label: string; money?: boolean; width?: number };
export type ExportFormat = "csv" | "xlsx" | "pdf";

function cell(v: unknown, money?: boolean): string | number {
  if (v === null || v === undefined) return "";
  if (money && typeof v === "number") return Number((v / 100).toFixed(2));
  if (v instanceof Date) return v.toISOString().replace("T", " ").slice(0, 16);
  if (typeof v === "object") return JSON.stringify(v);
  return v as string | number;
}

export function toCsv(cols: ExportColumn[], rows: Record<string, unknown>[]) {
  const esc = (s: string | number) => {
    const str = String(s);
    // neutralise spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = cols.map((c) => esc(c.label + (c.money ? " (₹)" : ""))).join(",");
  const body = rows.map((r) => cols.map((c) => esc(cell(r[c.key], c.money))).join(",")).join("\n");
  return "﻿" + head + "\n" + body;
}

export async function toXlsx(title: string, cols: ExportColumn[], rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StayShare";
  const ws = wb.addWorksheet(title.slice(0, 30));
  ws.columns = cols.map((c) => ({ header: c.label + (c.money ? " (₹)" : ""), key: c.key, width: c.width ?? Math.max(12, c.label.length + 4) }));
  for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c.key, cell(r[c.key], c.money)])));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C7B6E" } };
  cols.forEach((c, i) => {
    if (c.money) ws.getColumn(i + 1).numFmt = "#,##0.00";
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const safe = (s: string) => s.replace(/₹/g, "Rs.").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export async function toPdf(title: string, cols: ExportColumn[], rows: Record<string, unknown>[], subtitle?: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595; // A4 landscape
  const margin = 30;
  const usable = W - margin * 2;
  const colW = usable / cols.length;
  const size = cols.length > 9 ? 6.5 : 8;
  let page = pdf.addPage([W, H]);
  let y = H - margin;
  const header = () => {
    page.drawText(safe(`StayShare · ${title}`), { x: margin, y, size: 14, font: bold, color: rgb(0.1, 0.45, 0.4) });
    y -= 14;
    page.drawText(safe(subtitle ?? `Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`), { x: margin, y, size: 8, font, color: rgb(0.4, 0.4, 0.45) });
    y -= 18;
    page.drawRectangle({ x: margin, y: y - 3, width: usable, height: 14, color: rgb(0.11, 0.48, 0.43) });
    cols.forEach((c, i) => page.drawText(safe(c.label).slice(0, Math.floor(colW / (size * 0.55))), { x: margin + i * colW + 2, y, size, font: bold, color: rgb(1, 1, 1) }));
    y -= 14;
  };
  header();
  rows.forEach((r, idx) => {
    if (y < margin + 12) {
      page = pdf.addPage([W, H]);
      y = H - margin;
      header();
    }
    if (idx % 2 === 0) page.drawRectangle({ x: margin, y: y - 3, width: usable, height: 12, color: rgb(0.96, 0.97, 0.97) });
    cols.forEach((c, i) => {
      const v = cell(r[c.key], c.money);
      const txt = safe(typeof v === "number" && c.money ? v.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : String(v));
      page.drawText(txt.slice(0, Math.floor(colW / (size * 0.52))), { x: margin + i * colW + 2, y, size, font });
    });
    y -= 12;
  });
  if (!rows.length) page.drawText("No records for the selected filters.", { x: margin, y, size: 9, font });
  return Buffer.from(await pdf.save());
}

export async function exportResponse(name: string, cols: ExportColumn[], rows: Record<string, unknown>[], format: ExportFormat, subtitle?: string): Promise<Response> {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `${name}-${stamp}`;
  if (format === "csv") {
    return new Response(toCsv(cols, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` } });
  }
  if (format === "xlsx") {
    const buf = await toXlsx(name, cols, rows);
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${file}.xlsx"` } });
  }
  const buf = await toPdf(name.replace(/-/g, " "), cols, rows, subtitle);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}.pdf"` } });
}
