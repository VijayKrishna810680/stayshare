"use client";
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { formatINR } from "@/lib/money";
import { Badge, Button, EmptyState, Input, Label, Select, StatusBadge, Textarea } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { DOW, RESOURCE_CONFIG, SCOPE_REF, type ColDef, type FieldDef, type Opt } from "./resource-config";
import { useAdminAction } from "./step-up";
import { Markdown } from "./ui";

type Row = Record<string, unknown> & { id: string };
type Options = Record<string, Opt[]>;
type FormVals = Record<string, unknown>;

const pct = (bps: unknown) => (bps == null ? "—" : `${(Number(bps) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`);
const pad = (n: number) => String(n).padStart(2, "0");
const toLocalDT = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function toForm(f: FieldDef, v: unknown, row: FormVals): unknown {
  switch (f.type) {
    case "money":
      return v == null ? "" : String(Number(v) / 100);
    case "percent":
      return v == null ? "" : String(Number(v) / 100);
    case "couponValue":
      return v == null ? "" : String(Number(v) / 100); // bps→% or paise→₹ (both /100)
    case "ruleValue":
      return v == null ? "" : String(Number(v) / 100);
    case "int":
    case "number":
      return v == null ? "" : String(v);
    case "bool":
      return Boolean(v);
    case "date":
      return v ? String(v).slice(0, 10) : "";
    case "datetime":
      return toLocalDT(v);
    case "list":
      return Array.isArray(v) ? v.join("\n") : "";
    case "tiers":
      return Array.isArray(v) ? (v as { hoursBeforeCheckIn: number; refundBps: number }[]).map((t) => ({ hours: String(t.hoursBeforeCheckIn), pct: String(t.refundBps / 100) })) : [{ hours: "24", pct: "100" }, { hours: "0", pct: "0" }];
    case "days":
      return Array.isArray(v) ? v : [];
    case "benefits": {
      const b = (v ?? {}) as Record<string, unknown>;
      return {
        bookingDiscountBps: b.bookingDiscountBps != null ? String(Number(b.bookingDiscountBps) / 100) : "",
        maxDiscountPerBooking: b.maxDiscountPerBooking != null ? String(Number(b.maxDiscountPerBooking) / 100) : "",
        waiveConvenienceFee: Boolean(b.waiveConvenienceFee),
        commissionBps: b.commissionBps != null ? String(Number(b.commissionBps) / 100) : "",
        featuredListing: Boolean(b.featuredListing),
        maxProperties: b.maxProperties != null ? String(b.maxProperties) : "",
        prioritySupport: Boolean(b.prioritySupport),
      };
    }
    default:
      void row;
      return v == null ? "" : String(v);
  }
}

function fromForm(f: FieldDef, v: unknown, vals: FormVals): unknown {
  const s = typeof v === "string" ? v.trim() : v;
  switch (f.type) {
    case "money":
    case "percent":
    case "couponValue":
    case "ruleValue":
      return s === "" || s == null ? null : Math.round(Number(s) * 100);
    case "int":
      return s === "" || s == null ? null : Math.round(Number(s));
    case "number":
      return s === "" || s == null ? null : Number(s);
    case "bool":
      return Boolean(v);
    case "date":
      return s || null;
    case "datetime":
      return s ? new Date(String(s)).toISOString() : null;
    case "list":
      return String(v ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
    case "tiers":
      return (v as { hours: string; pct: string }[]).filter((t) => t.hours !== "").map((t) => ({ hoursBeforeCheckIn: Math.round(Number(t.hours)), refundBps: Math.round(Number(t.pct || 0) * 100) }));
    case "days":
      return v;
    case "benefits": {
      const b = v as Record<string, string | boolean>;
      const out: Record<string, unknown> = {};
      if (vals.audience === "OWNER") {
        if (b.commissionBps !== "") out.commissionBps = Math.round(Number(b.commissionBps) * 100);
        if (b.maxProperties !== "") out.maxProperties = Math.round(Number(b.maxProperties));
        out.featuredListing = Boolean(b.featuredListing);
        out.prioritySupport = Boolean(b.prioritySupport);
      } else {
        if (b.bookingDiscountBps !== "") out.bookingDiscountBps = Math.round(Number(b.bookingDiscountBps) * 100);
        if (b.maxDiscountPerBooking !== "") out.maxDiscountPerBooking = Math.round(Number(b.maxDiscountPerBooking) * 100);
        out.waiveConvenienceFee = Boolean(b.waiveConvenienceFee);
      }
      return out;
    }
    default:
      return s === "" ? null : s;
  }
}

function label(opts: Opt[] | undefined, v: unknown) {
  if (v == null || v === "") return "—";
  return opts?.find((o) => o.value === v)?.label ?? String(v).slice(0, 8);
}

function Cell({ c, row, options }: { c: ColDef; row: Row; options: Options }) {
  const v = row[c.key];
  switch (c.type) {
    case "money":
      return <span className="tabular-nums">{v == null ? "—" : formatINR(Number(v))}</span>;
    case "percent":
      return <span className="tabular-nums">{pct(v)}</span>;
    case "bool":
      return v ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge>;
    case "status":
      return <StatusBadge status={v as string} />;
    case "code":
      return <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{String(v ?? "")}</code>;
    case "date":
      return <span className="whitespace-nowrap">{v ? new Date(String(v).length === 10 ? `${v}T00:00:00Z` : String(v)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>;
    case "datetime":
      return <span className="whitespace-nowrap">{v ? new Date(String(v)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</span>;
    case "ref":
      return <span>{label(options[c.ref!], v)}</span>;
    case "list":
      return <span>{Array.isArray(v) ? v.join(", ") : "—"}</span>;
    case "days":
      return <span className="text-xs">{Array.isArray(v) && v.length ? (v as number[]).map((d) => DOW[d]).join(" ") : "All"}</span>;
    case "tiers":
      return (
        <span className="text-xs">
          {Array.isArray(v) ? (v as { hoursBeforeCheckIn: number; refundBps: number }[]).map((t) => `≥${t.hoursBeforeCheckIn}h: ${t.refundBps / 100}%`).join(" · ") : "—"}
        </span>
      );
    case "scope": {
      const scope = String(row.scope);
      if (scope === "GLOBAL") return <Badge>Global</Badge>;
      return (
        <span className="text-xs">
          <StatusBadge status={scope} /> {label(options[SCOPE_REF[scope]!], row.scopeId)}
        </span>
      );
    }
    case "couponValue":
      return <span className="tabular-nums">{row.discountType === "PERCENT" ? pct(v) : formatINR(Number(v))}</span>;
    case "ruleValue": {
      const at = row.adjustmentType;
      const n = Number(v);
      return <span className={cn("tabular-nums", n < 0 ? "text-emerald-700" : "")}>{at === "PERCENT" ? `${n > 0 ? "+" : ""}${pct(n)}` : at === "SET_NIGHTLY_PRICE" ? `= ${formatINR(n)}/night` : `${n > 0 ? "+" : "−"}${formatINR(Math.abs(n))}/night`}</span>;
    }
    default:
      return <span className="line-clamp-2">{v == null || v === "" ? "—" : String(v)}</span>;
  }
}

function FieldInput({ f, vals, set, options }: { f: FieldDef; vals: FormVals; set: (k: string, v: unknown) => void; options: Options }) {
  const id = `rf-${f.name}`;
  const v = vals[f.name];
  const [preview, setPreview] = useState(false);
  const labelText = (() => {
    if (f.type === "money") return `${f.label} (₹)`;
    if (f.type === "percent") return `${f.label} (%)`;
    if (f.type === "couponValue") return `${f.label} ${vals.discountType === "PERCENT" ? "(%)" : "(₹)"}`;
    if (f.type === "ruleValue") return `${f.label} ${vals.adjustmentType === "PERCENT" ? "(% — negative for discount)" : vals.adjustmentType === "SET_NIGHTLY_PRICE" ? "(₹ per night)" : "(₹ per night, negative for discount)"}`;
    return f.label;
  })();
  if (f.type === "bool") {
    return (
      <label className="flex items-center gap-2 pt-6 text-sm">
        <input id={id} type="checkbox" checked={Boolean(v)} onChange={(e) => set(f.name, e.target.checked)} className="h-4 w-4 accent-brand-600" />
        {f.label}
      </label>
    );
  }
  const req = f.required && <span className="text-red-600"> *</span>;
  let control: React.ReactNode;
  switch (f.type) {
    case "textarea":
      control = <Textarea id={id} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} required={f.required} placeholder={f.placeholder} />;
      break;
    case "markdown":
      control = (
        <div>
          <div className="mb-1 flex gap-2 text-xs">
            <button type="button" onClick={() => setPreview(false)} className={cn("rounded px-2 py-0.5", !preview ? "bg-slate-900 text-white" : "bg-slate-100")}>
              Write
            </button>
            <button type="button" onClick={() => setPreview(true)} className={cn("rounded px-2 py-0.5", preview ? "bg-slate-900 text-white" : "bg-slate-100")}>
              Preview
            </button>
            <span className="text-slate-500">Supports # headings, - lists, **bold**, *italic*, [links](/url)</span>
          </div>
          {preview ? (
            <div className="min-h-64 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <Markdown source={String(v ?? "")} />
            </div>
          ) : (
            <Textarea id={id} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} className="min-h-64 font-mono text-xs" />
          )}
        </div>
      );
      break;
    case "select":
      control = (
        <Select id={id} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} required={f.required}>
          {!f.required && <option value="">—</option>}
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    case "ref":
      control = (
        <Select id={id} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} required={f.required}>
          <option value="">{f.required ? "Select…" : "— Any —"}</option>
          {(options[f.ref!] ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    case "scopeRef": {
      const scope = String(vals.scope ?? "GLOBAL");
      if (scope === "GLOBAL") return null;
      const opts = options[SCOPE_REF[scope]!] ?? [];
      control = (
        <Select id={id} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} required>
          <option value="">Select {scope.toLowerCase()}…</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    }
    case "date":
      control = <Input id={id} type="date" value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} required={f.required} />;
      break;
    case "datetime":
      control = <Input id={id} type="datetime-local" value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} required={f.required} />;
      break;
    case "list":
      control = <Textarea id={id} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} placeholder="One per line" />;
      break;
    case "days": {
      const arr = (v as number[]) ?? [];
      control = (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.label}>
          {DOW.map((d, i) => (
            <button key={d} type="button" aria-pressed={arr.includes(i)} onClick={() => set(f.name, arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i].sort())} className={cn("rounded-lg border px-2.5 py-1 text-xs", arr.includes(i) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white")}>
              {d}
            </button>
          ))}
          <button type="button" className="text-xs text-brand-700 underline" onClick={() => set(f.name, [0, 5, 6])}>
            Fri–Sun
          </button>
        </div>
      );
      break;
    }
    case "tiers": {
      const tiers = (v as { hours: string; pct: string }[]) ?? [];
      const upd = (i: number, k: "hours" | "pct", x: string) => set(f.name, tiers.map((t, j) => (j === i ? { ...t, [k]: x } : t)));
      control = (
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">≥</span>
              <Input aria-label={`Tier ${i + 1} hours`} type="number" min={0} value={t.hours} onChange={(e) => upd(i, "hours", e.target.value)} className="w-24" />
              <span className="text-slate-500">hours before → refund</span>
              <Input aria-label={`Tier ${i + 1} refund percent`} type="number" min={0} max={100} step="0.01" value={t.pct} onChange={(e) => upd(i, "pct", e.target.value)} className="w-24" />
              <span className="text-slate-500">%</span>
              <button type="button" aria-label="Remove tier" onClick={() => set(f.name, tiers.filter((_, j) => j !== i))} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => set(f.name, [...tiers, { hours: "", pct: "" }])}>
            <Plus className="h-4 w-4" /> Add tier
          </Button>
        </div>
      );
      break;
    }
    case "benefits": {
      const b = (v as Record<string, string | boolean>) ?? {};
      const sb = (k: string, x: string | boolean) => set(f.name, { ...b, [k]: x });
      control =
        vals.audience === "OWNER" ? (
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="b-comm">Commission rate for subscribers (%)</Label>
              <Input id="b-comm" type="number" step="0.01" value={String(b.commissionBps ?? "")} onChange={(e) => sb("commissionBps", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="b-maxp">Max properties</Label>
              <Input id="b-maxp" type="number" value={String(b.maxProperties ?? "")} onChange={(e) => sb("maxProperties", e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(b.featuredListing)} onChange={(e) => sb("featuredListing", e.target.checked)} className="h-4 w-4 accent-brand-600" /> Featured listing
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(b.prioritySupport)} onChange={(e) => sb("prioritySupport", e.target.checked)} className="h-4 w-4 accent-brand-600" /> Priority support
            </label>
          </div>
        ) : (
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="b-disc">Booking discount (%)</Label>
              <Input id="b-disc" type="number" step="0.01" value={String(b.bookingDiscountBps ?? "")} onChange={(e) => sb("bookingDiscountBps", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="b-max">Max discount per booking (₹)</Label>
              <Input id="b-max" type="number" step="0.01" value={String(b.maxDiscountPerBooking ?? "")} onChange={(e) => sb("maxDiscountPerBooking", e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(b.waiveConvenienceFee)} onChange={(e) => sb("waiveConvenienceFee", e.target.checked)} className="h-4 w-4 accent-brand-600" /> Waive convenience fee
            </label>
          </div>
        );
      break;
    }
    default: {
      const numeric = ["int", "number", "money", "percent", "couponValue", "ruleValue"].includes(f.type);
      control = (
        <Input
          id={id}
          type={numeric ? "number" : "text"}
          step={f.type === "int" ? "1" : numeric ? "any" : undefined}
          min={["money", "percent", "int"].includes(f.type) && f.name !== "priority" ? 0 : undefined}
          value={String(v ?? "")}
          onChange={(e) => set(f.name, e.target.value)}
          required={f.required}
          placeholder={f.placeholder}
        />
      );
    }
  }
  return (
    <div className={cn(f.wide && "sm:col-span-2")}>
      {f.type !== "days" && f.type !== "tiers" && f.type !== "benefits" ? (
        <Label htmlFor={id}>
          {labelText}
          {req}
        </Label>
      ) : (
        <p className="mb-1 text-sm font-medium text-slate-700">
          {labelText}
          {req}
        </p>
      )}
      {control}
      {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
    </div>
  );
}

/**
 * Generic list + create/edit/delete for any resource in RESOURCE_CONFIG, backed by
 * /api/admin/resources/[resource]. Rows come from the server page; mutations refresh it.
 */
export function ResourceManager({ resource, rows, options = {}, title, canEdit = true, pageSize = 25, emptyText }: { resource: string; rows: Row[]; options?: Options; title?: string; canEdit?: boolean; pageSize?: number; emptyText?: string }) {
  const cfg = RESOURCE_CONFIG[resource]!;
  const { exec, busy } = useAdminAction();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [vals, setVals] = useState<FormVals>({});
  const [del, setDel] = useState<Row | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (cfg.search ?? Object.keys(r)).some((k) => String(r[k] ?? "").toLowerCase().includes(s)));
  }, [rows, q, cfg.search]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);

  const open = (r: Row | "new") => {
    const src: Record<string, unknown> = r === "new" ? {} : r;
    const v: FormVals = {};
    for (const f of cfg.fields) {
      const raw = r === "new" ? (f.default ?? (f.type === "bool" ? false : null)) : src[f.name];
      v[f.name] = toForm(f, raw, src);
    }
    if (r === "new") {
      if (resource === "coupons") {
        v.validFrom = toLocalDT(new Date());
        v.validTo = toLocalDT(new Date(Date.now() + 30 * 86400_000));
      }
    } else if (cfg.reasonOnEdit) v.reason = "";
    setVals(v);
    setEditing(r);
  };
  const visible = (f: FieldDef) => (!f.showIf || f.showIf.in.includes(String(vals[f.showIf.field]))) && !(f.createOnly && editing !== "new");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      if (f.createOnly && editing !== "new") continue;
      if (f.showIf && !visible(f)) continue;
      payload[f.name] = fromForm(f, vals[f.name], vals);
    }
    if ("scope" in payload && payload.scope === "GLOBAL") payload.scopeId = null;
    for (const f of cfg.fields) if (f.required && (payload[f.name] === null || payload[f.name] === "") && visible(f)) delete payload[f.name];
    const isNew = editing === "new";
    const out = await exec(() => apiFetch(isNew ? `/api/admin/resources/${resource}` : `/api/admin/resources/${resource}/${(editing as Row).id}`, { method: isNew ? "POST" : "PATCH", json: payload }), { success: isNew ? `${cfg.singular[0]!.toUpperCase()}${cfg.singular.slice(1)} created` : "Saved" });
    if (out !== undefined) setEditing(null);
  };
  const remove = async () => {
    if (!del) return;
    const out = await exec(() => apiFetch(`/api/admin/resources/${resource}/${del.id}`, { method: "DELETE" }), { success: "Deleted" });
    if (out !== undefined) setDel(null);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input
            aria-label={`Search ${title ?? resource}`}
            placeholder={`Search ${title?.toLowerCase() ?? cfg.singular + "s"}…`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="h-9 pl-9"
          />
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => open("new")}>
            <Plus className="h-4 w-4" /> New {cfg.singular}
          </Button>
        )}
      </div>
      {!shown.length ? (
        <EmptyState title={q ? "No matches" : (emptyText ?? `No ${cfg.singular}s yet`)} description={canEdit && !q ? `Create the first ${cfg.singular}.` : undefined} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {cfg.columns.map((c) => (
                    <th key={c.key} scope="col" className="px-3 py-2.5">
                      {c.label}
                    </th>
                  ))}
                  {canEdit && (
                    <th scope="col" className="px-3 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    {cfg.columns.map((c) => (
                      <td key={c.key} className="max-w-xs px-3 py-2.5 align-middle">
                        <Cell c={c} row={r} options={options} />
                      </td>
                    ))}
                    {canEdit && (
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label={`Edit ${cfg.singular}`} onClick={() => open(r)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        {cfg.deletable && (
                          <button className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" aria-label={`Delete ${cfg.singular}`} onClick={() => setDel(r)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          {filtered.length} record{filtered.length === 1 ? "" : "s"}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Prev
            </Button>
            <span>
              {page} / {pages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? `New ${cfg.singular}` : `Edit ${cfg.singular}`} size="lg">
        <form onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            {cfg.fields.filter(visible).map((f) => (
              <FieldInput key={f.name} f={f} vals={vals} set={(k, v) => setVals((s) => ({ ...s, [k]: v }))} options={options} />
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {editing === "new" ? "Create" : "Save changes"}
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog open={del !== null} onClose={() => setDel(null)} onConfirm={remove} loading={busy} tone="danger" title={`Delete this ${cfg.singular}?`} description="This cannot be undone. Records that are in use cannot be deleted — deactivate them instead." confirmText="Delete" />
    </div>
  );
}
