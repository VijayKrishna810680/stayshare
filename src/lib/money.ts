/** All money in StayShare is integer paise. These helpers never use floats for storage. */
export const PAISE = 100;

export function rupees(r: number): number {
  return Math.round(r * PAISE);
}

export function toRupees(paise: number): number {
  return paise / PAISE;
}

/** Apply basis points with half-up rounding to the nearest paisa. */
export function applyBps(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10000);
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format paise as ₹ (whole rupees when there are no paise). */
export function formatINR(paise: number | null | undefined, opts: { exact?: boolean } = {}): string {
  const p = paise ?? 0;
  if (opts.exact || p % 100 !== 0) return inr2.format(p / 100);
  return inr.format(p / 100);
}

/** Plain ASCII variant for PDFs (standard PDF fonts lack the ₹ glyph). */
export function formatINRAscii(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  const s = r.toLocaleString("en-IN") + "." + String(p).padStart(2, "0");
  return (neg ? "-" : "") + "Rs. " + s;
}

export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2) + "%";
}
