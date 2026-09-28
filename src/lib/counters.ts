import "server-only";
import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db";

/** Atomically increment a named counter (safe under concurrency via UPSERT ... RETURNING). */
export async function nextCounter(key: string, tx?: Tx): Promise<number> {
  const res = await (tx ?? db).execute<{ value: number }>(
    sql`INSERT INTO counters (key, value) VALUES (${key}, 1)
        ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
        RETURNING value`,
  );
  return Number(res.rows[0]!.value);
}

/** SS-HYD-2026-000001 */
export async function nextBookingNumber(cityCode: string, tx?: Tx) {
  const year = new Date().getFullYear();
  const n = await nextCounter(`booking:${cityCode}:${year}`, tx);
  return `SS-${cityCode}-${year}-${String(n).padStart(6, "0")}`;
}
export async function nextInvoiceNumber(tx?: Tx) {
  const d = new Date();
  // Indian FY (Apr–Mar)
  const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const n = await nextCounter(`invoice:${fy}`, tx);
  return `INV/${fy}-${String((fy + 1) % 100).padStart(2, "0")}/${String(n).padStart(6, "0")}`;
}
export async function nextTicketNumber(tx?: Tx) {
  return `TKT-${String(await nextCounter("ticket", tx)).padStart(6, "0")}`;
}
export async function nextPayoutNumber(tx?: Tx) {
  return `PO-${new Date().getFullYear()}-${String(await nextCounter("payout", tx)).padStart(5, "0")}`;
}
