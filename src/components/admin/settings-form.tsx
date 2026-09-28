"use client";
import { useState } from "react";
import { Lock, Save } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useAdminAction } from "./step-up";

export type SettingField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "bool" | "int" | "money" | "percent" | "select" | "convenience";
  hint?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
};

const toForm = (f: SettingField, v: unknown, all: Record<string, unknown>) => {
  if (f.type === "bool") return Boolean(v);
  if (f.type === "money" || f.type === "percent") return v == null ? "" : String(Number(v) / 100);
  if (f.type === "convenience") return v == null ? "" : String(Number(v) / 100);
  void all;
  return v == null ? "" : String(v);
};
const fromForm = (f: SettingField, v: unknown) => {
  if (f.type === "bool") return Boolean(v);
  if (f.type === "int") return Math.round(Number(v || 0));
  if (f.type === "money" || f.type === "percent" || f.type === "convenience") return Math.round(Number(v || 0) * 100);
  return String(v ?? "").trim();
};

/**
 * Settings tab form. Only changed keys are sent. Protected keys (platform./fees./payout.) trigger the
 * OTP step-up dialog automatically when the API answers 428.
 */
export function SettingsForm({ fields, values, protectedPrefixes, askReason }: { fields: SettingField[]; values: Record<string, unknown>; protectedPrefixes: string[]; askReason?: boolean }) {
  const init = () => Object.fromEntries(fields.map((f) => [f.key, toForm(f, values[f.key], values)]));
  const [vals, setVals] = useState<Record<string, unknown>>(init);
  const [saved, setSaved] = useState<Record<string, unknown>>(init);
  const [reason, setReason] = useState("");
  const { exec, busy } = useAdminAction();
  const changed = fields.filter((f) => JSON.stringify(vals[f.key]) !== JSON.stringify(saved[f.key]));
  const isProtected = fields.some((f) => protectedPrefixes.some((p) => f.key.startsWith(p)));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed.length) return;
    const payload: Record<string, unknown> = Object.fromEntries(changed.map((f) => [f.key, fromForm(f, vals[f.key])]));
    if (askReason && reason.trim()) payload.__reason = reason.trim();
    const out = await exec(() => apiFetch("/api/admin/settings", { method: "PUT", json: payload }), { success: "Settings saved" });
    if (out !== undefined) {
      setSaved(vals);
      setReason("");
    }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      {isProtected && (
        <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Lock className="h-4 w-4 text-slate-500" aria-hidden /> Protected settings — you will be asked for an OTP sent to your registered phone/email before saving.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `s-${f.key}`;
          const v = vals[f.key];
          const set = (x: unknown) => setVals((s) => ({ ...s, [f.key]: x }));
          if (f.type === "bool")
            return (
              <label key={f.key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <input id={id} type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>
                  <span className="font-medium text-slate-800">{f.label}</span>
                  {f.hint && <span className="block text-xs text-slate-500">{f.hint}</span>}
                </span>
              </label>
            );
          const label = f.type === "money" ? `${f.label} (₹)` : f.type === "percent" ? `${f.label} (%)` : f.type === "convenience" ? `${f.label} ${vals["fees.convenienceType"] === "PERCENT" ? "(%)" : "(₹)"}` : f.label;
          return (
            <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
              <Label htmlFor={id}>{label}</Label>
              {f.type === "textarea" ? (
                <Textarea id={id} value={String(v ?? "")} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />
              ) : f.type === "select" ? (
                <Select id={id} value={String(v ?? "")} onChange={(e) => set(e.target.value)}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={id}
                  type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : ["int", "money", "percent", "convenience"].includes(f.type) ? "number" : "text"}
                  step={f.type === "int" ? "1" : f.type === "text" || f.type === "email" || f.type === "tel" ? undefined : "0.01"}
                  min={["int", "money", "percent", "convenience"].includes(f.type) ? 0 : undefined}
                  value={String(v ?? "")}
                  placeholder={f.placeholder}
                  onChange={(e) => set(e.target.value)}
                />
              )}
              {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
            </div>
          );
        })}
      </div>
      {askReason && (
        <div>
          <Label htmlFor="s-reason">Reason for change (recorded in price history)</Label>
          <Input id="s-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Revised convenience fee for festive season" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy} disabled={!changed.length}>
          <Save className="h-4 w-4" /> Save changes
        </Button>
        <span className="text-xs text-slate-500">{changed.length ? `${changed.length} unsaved change${changed.length > 1 ? "s" : ""}` : "No changes"}</span>
        {changed.length > 0 && (
          <button type="button" className="text-xs text-slate-600 underline" onClick={() => setVals(saved)}>
            Discard
          </button>
        )}
      </div>
    </form>
  );
}
