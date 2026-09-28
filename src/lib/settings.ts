import "server-only";
import { db } from "@/db";
import { applicationSettings } from "@/db/schema";

/** Platform-wide settings editable in Admin → Settings. Defaults apply until changed. */
export const SETTING_DEFAULTS = {
  "platform.name": "StayShare",
  "platform.legalName": "StayShare Technologies Pvt. Ltd. (placeholder)",
  "platform.gstin": "36AAAAA0000A1Z5",
  "platform.address": "Placeholder address, Hyderabad, Telangana 500081",
  // Contact details are intentionally BLANK — the app owner enters them in Admin → Settings → Contact & support
  // (protected by OTP step-up verification). Support buttons stay hidden until filled.
  "platform.supportEmail": "",
  "platform.supportPhone": "",
  "platform.whatsapp": "",
  "platform.liveChatEnabled": true,
  "platform.supportHours": "",
  "booking.holdMinutes": 15,
  "booking.maxAdvanceDays": 365,
  "booking.allowCashAtProperty": true,
  "booking.allowPartialPayment": true,
  "booking.partialPaymentBps": 3000, // minimum 30% advance
  "booking.extensionNeedsApproval": false,
  "booking.modificationNeedsApproval": true,
  "fees.convenienceType": "FLAT", // FLAT | PERCENT
  "fees.convenienceValue": 4900, // ₹49 or bps when PERCENT
  "fees.convenienceTaxBps": 1800, // GST on platform convenience fee
  "fees.gatewayFeeBps": 200, // estimated gateway fee (2%) used when provider doesn't report one
  "fees.gatewayFeeBorneBy": "OWNER", // OWNER | PLATFORM
  "payout.settlementDaysAfterCheckout": 3,
  "payout.minPayout": 50000, // ₹500
  "reviews.autoPublish": true,
  "owner.canSetFinalPriceDefault": false,
  /** Prices are entered ONLY by the StayShare admin team. Turn on to let owners submit an optional suggested price. */
  "owner.allowPriceSuggestion": false,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K] extends number
  ? number
  : (typeof SETTING_DEFAULTS)[K] extends boolean
    ? boolean
    : string;

// Small in-process cache: settings are read on every quote/booking; admin writes call invalidateSettingsCache().
let cache: { at: number; rows: Map<string, unknown> } | null = null;
const TTL_MS = 30_000;
export function invalidateSettingsCache() {
  cache = null;
}
async function allRows() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await db.select({ key: applicationSettings.key, value: applicationSettings.value }).from(applicationSettings);
  cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.key, r.value])) };
  return cache.rows;
}

export async function getSettings<K extends SettingKey>(keys: K[]): Promise<{ [P in K]: SettingValue<P> }> {
  const map = keys.length ? await allRows() : new Map<string, unknown>();
  const rows = keys.filter((k) => map.has(k)).map((k) => ({ key: k as string, value: map.get(k) }));
  const out = {} as Record<string, unknown>;
  for (const k of keys) out[k] = SETTING_DEFAULTS[k];
  for (const r of rows) out[r.key] = r.value;
  return out as { [P in K]: SettingValue<P> };
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return (await getSettings([key]))[key];
}

/** Settings that require a fresh OTP step-up verification to change. */
export const STEP_UP_SETTING_PREFIXES = ["platform.", "fees.", "payout."];

export async function getAllSettings() {
  return getSettings(Object.keys(SETTING_DEFAULTS) as SettingKey[]);
}
