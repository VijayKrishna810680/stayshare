/** Date helpers. Stay dates are calendar dates (YYYY-MM-DD) handled in UTC to avoid TZ drift. */
const DAY = 86_400_000;

export function parseDate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Invalid date: ${s}`);
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`);
  return d;
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  return fmtDate(new Date(parseDate(s).getTime() + n * DAY));
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / DAY);
}

/** Each night of a stay: [checkIn, checkOut). */
export function listNights(checkIn: string, checkOut: string): string[] {
  const n = nightsBetween(checkIn, checkOut);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(checkIn, i));
  return out;
}

/** Today's date in India (IST) as YYYY-MM-DD. */
export function todayIST(): string {
  const now = new Date(Date.now() + 5.5 * 3600 * 1000);
  return fmtDate(now);
}

export function dayOfWeek(s: string): number {
  return parseDate(s).getUTCDay();
}

/** Combine a stay date and property time ("12:00") in IST into an absolute Date. */
export function istDateTime(dateStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(parseDate(dateStr).getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000 - 5.5 * 3600 * 1000);
}

export function toDateStr(v: string | Date): string {
  return typeof v === "string" ? v.slice(0, 10) : fmtDate(v);
}

export function prettyDate(s: string | Date | null | undefined): string {
  if (!s) return "—";
  const d = typeof s === "string" ? (s.length === 10 ? parseDate(s) : new Date(s)) : s;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: s && typeof s === "string" && s.length === 10 ? "UTC" : "Asia/Kolkata" });
}

export function prettyDateTime(s: string | Date | null | undefined): string {
  if (!s) return "—";
  const d = typeof s === "string" ? new Date(s) : s;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
