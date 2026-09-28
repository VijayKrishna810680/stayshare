import { z } from "zod";
import { db } from "@/db";
import { applicationSettings } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth/current";
import { requireStepUp } from "@/lib/auth/step-up";
import { badRequest } from "@/lib/errors";
import { getAllSettings, SETTING_DEFAULTS, STEP_UP_SETTING_PREFIXES, type SettingKey, invalidateSettingsCache } from "@/lib/settings";
import { logAudit, recordPriceChanges } from "../_lib/util";

/** Keys the pricing team may change without full settings access. */
const PRICING_KEYS = ["owner.allowPriceSuggestion", "owner.canSetFinalPriceDefault"];
/** Price-affecting keys that are also written to price_history. */
const PRICE_KEYS = (k: string) => k.startsWith("fees.") || k.startsWith("payout.") || k === "booking.partialPaymentBps";

const ENUMS: Record<string, string[]> = { "fees.convenienceType": ["FLAT", "PERCENT"], "fees.gatewayFeeBorneBy": ["OWNER", "PLATFORM"] };
const RANGES: Record<string, [number, number]> = {
  "booking.holdMinutes": [5, 120],
  "booking.maxAdvanceDays": [7, 730],
  "booking.partialPaymentBps": [0, 10000],
  "fees.convenienceValue": [0, 10_000_000],
  "fees.convenienceTaxBps": [0, 2800],
  "fees.gatewayFeeBps": [0, 1000],
  "payout.settlementDaysAfterCheckout": [0, 90],
  "payout.minPayout": [0, 100_000_000],
};

function validate(key: string, value: unknown): unknown {
  if (!(key in SETTING_DEFAULTS)) throw badRequest(`Unknown setting ${key}`);
  const def = SETTING_DEFAULTS[key as SettingKey];
  if (typeof def === "number") {
    const n = z.number().int().parse(value);
    const r = RANGES[key];
    if (r && (n < r[0] || n > r[1])) throw badRequest(`${key} must be between ${r[0]} and ${r[1]}`);
    return n;
  }
  if (typeof def === "boolean") return z.boolean().parse(value);
  const s = z.string().trim().max(500).parse(value ?? "");
  if (ENUMS[key] && !ENUMS[key]!.includes(s)) throw badRequest(`${key} must be one of ${ENUMS[key]!.join(", ")}`);
  if (key === "platform.supportEmail" && s && !z.string().email().safeParse(s).success) throw badRequest("Enter a valid support email");
  if ((key === "platform.supportPhone" || key === "platform.whatsapp") && s && !/^\+?[0-9 ()-]{8,20}$/.test(s)) throw badRequest("Enter a valid phone number with country code, e.g. +91 98xxxxxxxx");
  if (key === "platform.gstin" && s && !/^[0-9]{2}[A-Z0-9]{13}$/.test(s.toUpperCase())) throw badRequest("GSTIN must be 15 characters");
  return key === "platform.gstin" ? s.toUpperCase() : s;
}

export const GET = api(async () => {
  await requirePermission("settings.manage", "pricing.manage");
  return getAllSettings();
});

/** PUT { "<key>": value, ... } — keys under platform./fees./payout. need OTP step-up. */
export const PUT = api(async (req) => {
  const { __reason, ...body } = await parseBody(req, z.record(z.string(), z.unknown()));
  const reason = typeof __reason === "string" && __reason.trim() ? __reason.trim() : "Settings updated";
  const keys = Object.keys(body);
  if (!keys.length) throw badRequest("Nothing to save");
  const u = keys.every((k) => PRICING_KEYS.includes(k)) ? await requirePermission("settings.manage", "pricing.manage") : await requirePermission("settings.manage");
  const values = Object.fromEntries(keys.map((k) => [k, validate(k, body[k])]));
  if (keys.some((k) => STEP_UP_SETTING_PREFIXES.some((p) => k.startsWith(p)))) await requireStepUp(u);
  const before = await getAllSettings();
  const changed = keys.filter((k) => JSON.stringify(before[k as SettingKey]) !== JSON.stringify(values[k]));
  await db.transaction(async (tx) => {
    for (const k of changed) {
      await tx
        .insert(applicationSettings)
        .values({ key: k, value: values[k] as never, group: k.split(".")[0]!, updatedBy: u.id })
        .onConflictDoUpdate({ target: applicationSettings.key, set: { value: values[k] as never, updatedBy: u.id, updatedAt: new Date() } });
    }
    const priceKeys = changed.filter(PRICE_KEYS);
    for (const k of priceKeys) {
      await recordPriceChanges({ entityType: "SETTING", entityId: k, before: { [k]: before[k as SettingKey] }, after: { [k]: values[k] }, fields: [k], changedBy: u.id, reason }, tx);
    }
    if (changed.length) {
      await logAudit(req, u, "settings.update", "setting", changed.join(","), Object.fromEntries(changed.map((k) => [k, before[k as SettingKey]])), Object.fromEntries(changed.map((k) => [k, values[k]])), tx);
    }
  });
  invalidateSettingsCache();
  return { changed };
});
