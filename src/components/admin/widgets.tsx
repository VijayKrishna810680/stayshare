"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, RotateCcw, Search } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { useAdminAction } from "./step-up";

type Method = "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * A button that calls an admin API. Optional confirmation dialog, optional required note/reason
 * (sent as `noteField`), toasts and refreshes the page on success.
 */
export function ActionButton({
  url,
  method = "POST",
  body,
  label,
  success = "Done",
  confirm,
  confirmText,
  danger,
  variant,
  size = "sm",
  note,
  className,
  onDone,
  disabled,
}: {
  url: string;
  method?: Method;
  body?: Record<string, unknown>;
  label: React.ReactNode;
  success?: string;
  confirm?: string;
  confirmText?: string;
  danger?: boolean;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
  note?: { field: string; label: string; required?: boolean; placeholder?: string };
  className?: string;
  onDone?: (out: unknown) => void;
  disabled?: boolean;
}) {
  const { exec, busy } = useAdminAction();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const go = async () => {
    const payload = { ...(body ?? {}), ...(note ? { [note.field]: text } : {}) };
    const out = await exec(() => apiFetch(url, { method, json: method === "DELETE" && !note && !body ? undefined : payload }), { success });
    if (out !== undefined) {
      setOpen(false);
      setText("");
      onDone?.(out);
    }
  };
  const needsDialog = Boolean(confirm || note);
  return (
    <>
      <Button size={size} variant={variant ?? (danger ? "danger" : "outline")} loading={busy && !open} disabled={disabled} className={className} onClick={() => (needsDialog ? setOpen(true) : go())}>
        {label}
      </Button>
      {needsDialog && (
        <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={go} loading={busy} title={confirm ?? (typeof label === "string" ? label : "Confirm")} confirmText={confirmText ?? (typeof label === "string" ? label : "Confirm")} tone={danger ? "danger" : "primary"}>
          {note && (
            <div>
              <Label htmlFor="ab-note">
                {note.label}
                {note.required && <span className="text-red-600"> *</span>}
              </Label>
              <Textarea id="ab-note" value={text} onChange={(e) => setText(e.target.value)} placeholder={note.placeholder} />
              {note.required && text.trim().length < 3 && <p className="mt-1 text-xs text-slate-500">Required (min 3 characters)</p>}
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/** Accessible on/off switch that PATCHes `{[field]: value}` to `url`. */
export function Toggle({ url, field, value, label, method = "PATCH", extra, disabled }: { url: string; field: string; value: boolean; label?: string; method?: Method; extra?: Record<string, unknown>; disabled?: boolean }) {
  const { exec, busy } = useAdminAction();
  const [v, setV] = useState(value);
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", (busy || disabled) && "opacity-60")}>
      <button
        type="button"
        role="switch"
        aria-checked={v}
        aria-label={label ?? field}
        disabled={busy || disabled}
        onClick={async () => {
          const next = !v;
          const out = await exec(() => apiFetch(url, { method, json: { ...(extra ?? {}), [field]: next } }), { success: "Updated" });
          if (out !== undefined) setV(next);
        }}
        className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", v ? "bg-brand-600" : "bg-slate-300")}
      >
        <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", v ? "translate-x-4" : "translate-x-0.5")} />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}

export type FilterField =
  | { name: string; label: string; type: "text"; placeholder?: string }
  | { name: string; label: string; type: "date" }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[] };

/** URL-driven filters bar for server-rendered lists. */
export function FilterBar({ fields, className }: { fields: FilterField[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, sp.get(f.name) ?? ""])));
  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(vals)) if (v) q.set(k, v);
    for (const [k, v] of sp.entries()) if (!fields.some((f) => f.name === k) && k !== "page") q.set(k, v);
    router.push(`${pathname}${q.size ? `?${q}` : ""}`);
  };
  const reset = () => {
    setVals(Object.fromEntries(fields.map((f) => [f.name, ""])));
    const q = new URLSearchParams();
    for (const [k, v] of sp.entries()) if (!fields.some((f) => f.name === k) && k !== "page") q.set(k, v);
    router.push(`${pathname}${q.size ? `?${q}` : ""}`);
  };
  return (
    <form onSubmit={apply} className={cn("card mb-4 flex flex-wrap items-end gap-3 p-3", className)} role="search">
      {fields.map((f) => (
        <div key={f.name} className={f.type === "text" ? "min-w-[180px] flex-1" : "w-full sm:w-auto sm:min-w-[150px]"}>
          <Label htmlFor={`f-${f.name}`} className="text-xs">
            {f.label}
          </Label>
          {f.type === "select" ? (
            <Select id={`f-${f.name}`} value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} className="h-9">
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input id={`f-${f.name}`} type={f.type} value={vals[f.name]} placeholder={f.type === "text" ? f.placeholder : undefined} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} className="h-9" />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {fields.some((f) => f.type === "text") ? <Search className="h-4 w-4" /> : <Filter className="h-4 w-4" />} Apply
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset} aria-label="Reset filters">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

/** CSV / Excel / PDF download links for an export endpoint (appends ?format=). */
export function ExportButtons({ href, className }: { href: string; className?: string }) {
  const sep = href.includes("?") ? "&" : "?";
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {(["csv", "xlsx", "pdf"] as const).map((f) => (
        <a key={f} href={`${href}${sep}format=${f}`} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50" download>
          <Download className="h-3.5 w-3.5" /> {f === "xlsx" ? "Excel" : f.toUpperCase()}
        </a>
      ))}
    </div>
  );
}

/** Collapsible pretty JSON (audit before/after, webhook payloads). */
export function JsonView({ value, label = "View JSON" }: { value: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  return (
    <>
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label} size="lg">
        <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(value, null, 2)}</pre>
      </Dialog>
    </>
  );
}

/** Generic small form in a dialog; fields are simple inputs. Submits JSON to url. */
export function FormDialogButton({
  url,
  method = "POST",
  label,
  title,
  description,
  fields,
  success = "Saved",
  variant = "outline",
  size = "sm",
  submitText = "Save",
  transform,
  danger,
}: {
  url: string;
  method?: Method;
  label: React.ReactNode;
  title: string;
  description?: string;
  fields: { name: string; label: string; type?: "text" | "number" | "money" | "percent" | "textarea" | "select" | "date" | "checkbox"; options?: { value: string; label: string }[]; required?: boolean; defaultValue?: string | number | boolean; hint?: string; placeholder?: string }[];
  success?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
  submitText?: string;
  transform?: "none";
  danger?: boolean;
}) {
  const { exec, busy } = useAdminAction();
  const [open, setOpen] = useState(false);
  const init = () => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "checkbox" ? false : "")]));
  const [vals, setVals] = useState<Record<string, string | number | boolean>>(init);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = vals[f.name];
      if (transform === "none") payload[f.name] = v;
      else if (f.type === "money") payload[f.name] = v === "" ? null : Math.round(Number(v) * 100);
      else if (f.type === "percent") payload[f.name] = v === "" ? null : Math.round(Number(v) * 100);
      else if (f.type === "number") payload[f.name] = v === "" ? null : Number(v);
      else if (f.type === "checkbox") payload[f.name] = Boolean(v);
      else payload[f.name] = v === "" ? null : v;
    }
    const out = await exec(() => apiFetch(url, { method, json: payload }), { success });
    if (out !== undefined) {
      setOpen(false);
      setVals(init());
    }
  };
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <form onSubmit={submit} className="space-y-3">
          {fields.map((f) => {
            const id = `fd-${f.name}`;
            const v = vals[f.name];
            return (
              <div key={f.name}>
                {f.type !== "checkbox" && (
                  <Label htmlFor={id}>
                    {f.label}
                    {f.type === "money" && " (₹)"}
                    {f.type === "percent" && " (%)"}
                    {f.required && <span className="text-red-600"> *</span>}
                  </Label>
                )}
                {f.type === "textarea" ? (
                  <Textarea id={id} value={String(v)} required={f.required} placeholder={f.placeholder} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
                ) : f.type === "select" ? (
                  <Select id={id} value={String(v)} required={f.required} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}>
                    {!f.required && <option value="">—</option>}
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : f.type === "checkbox" ? (
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(v)} onChange={(e) => setVals({ ...vals, [f.name]: e.target.checked })} className="h-4 w-4 accent-brand-600" /> {f.label}
                  </label>
                ) : (
                  <Input
                    id={id}
                    type={f.type === "date" ? "date" : ["number", "money", "percent"].includes(f.type ?? "") ? "number" : "text"}
                    step={f.type === "money" || f.type === "percent" ? "0.01" : undefined}
                    value={String(v)}
                    required={f.required}
                    placeholder={f.placeholder}
                    onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}
                  />
                )}
                {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
              </div>
            );
          })}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} variant={danger ? "danger" : "primary"}>
              {submitText}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** A select that immediately saves `{[field]: value}` to url on change. */
export function SelectAction({ url, field, value, options, method = "PATCH", label, allowEmpty, extra }: { url: string; field: string; value: string | null; options: { value: string; label: string }[]; method?: Method; label: string; allowEmpty?: string; extra?: Record<string, unknown> }) {
  const { exec, busy } = useAdminAction();
  const [v, setV] = useState(value ?? "");
  return (
    <Select
      aria-label={label}
      value={v}
      disabled={busy}
      className="h-8 min-w-[160px] text-xs"
      onChange={async (e) => {
        const next = e.target.value;
        const prev = v;
        setV(next);
        const out = await exec(() => apiFetch(url, { method, json: { ...(extra ?? {}), [field]: next || null } }), { success: "Saved" });
        if (out === undefined) setV(prev);
      }}
    >
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** Revoke every session of the current admin (POST /api/auth/logout-all) and go to login. */
export function LogoutAllButton() {
  return <ActionButton url="/api/auth/logout-all" label="Sign out all devices" danger confirm="Sign out of all devices, including this one?" success="Signed out everywhere" onDone={() => (window.location.href = "/login")} />;
}
