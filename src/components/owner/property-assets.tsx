"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FileText, GripVertical, ImagePlus, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/client-api";
import { Badge, Button, Checkbox, EmptyState, Input, Select, StatusBadge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Img } from "@/components/ui/img";
import { call, useAction } from "./common";
import { DOC_TYPES, humanize } from "./format";
import type { DocItem, FacilityOpt, ImageItem } from "./types";

/** Multi-file picker that uploads each file and reports it back. */
export function Uploader({ purpose, accept, multiple = true, label, onUploaded, disabled }: { purpose: string; accept: string; multiple?: boolean; label: string; onUploaded: (f: { id: string; url: string; fileName: string }) => Promise<void> | void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const [i, f] of [...files].entries()) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const up = await uploadFile(f, purpose);
        await onUploaded(up);
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setBusy(false);
    setProgress(null);
    if (ok) {
      toast.success(`${ok} file${ok > 1 ? "s" : ""} uploaded`);
      router.refresh();
    }
    if (ref.current) ref.current.value = "";
  };
  return (
    <div
      className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition-colors hover:border-brand-400"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!disabled) void onFiles(e.dataTransfer.files);
      }}
    >
      <Upload className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden />
      <p className="text-sm text-slate-600">{progress ?? "Drag & drop here, or"}</p>
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="sr-only" id={`up-${purpose}`} onChange={(e) => onFiles(e.target.files)} disabled={disabled || busy} />
      <Button type="button" variant="outline" size="sm" className="mt-2" loading={busy} disabled={disabled} onClick={() => ref.current?.click()}>
        <ImagePlus className="h-4 w-4" /> {label}
      </Button>
      <p className="mt-2 text-xs text-slate-500">{accept.includes("pdf") ? "JPG, PNG, WEBP or PDF" : "JPG, PNG or WEBP"} · max 10 MB each</p>
    </div>
  );
}

// ───────────────────────────── photos ─────────────────────────────

export function PhotosManager({ propertyId, images, approvedProperty }: { propertyId: string; images: ImageItem[]; approvedProperty: boolean }) {
  const { run, pending } = useAction();
  const [del, setDel] = useState<ImageItem | null>(null);
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  const move = (idx: number, dir: -1 | 1) => {
    const order = sorted.map((i) => i.id);
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j]!, order[idx]!];
    void run("order", () => call(`/api/owner/properties/${propertyId}/images`, "PATCH", { order }));
  };
  return (
    <div className="space-y-4">
      {approvedProperty && <p className="text-sm text-slate-500">New photos are reviewed by the StayShare team before they appear on your listing.</p>}
      <Uploader purpose="PROPERTY_IMAGE" accept="image/jpeg,image/png,image/webp" label="Add building photos" onUploaded={async (f) => {
          await call(`/api/owner/properties/${propertyId}/images`, "POST", { fileId: f.id });
        }}
      />
      {sorted.length === 0 ? (
        <EmptyState title="No photos yet" description="Add a front view, reception, common areas, rooms and bathrooms. Great photos get more bookings." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Property photos">
          {sorted.map((img, i) => (
            <li key={img.id} className="card overflow-hidden">
              <div className="relative">
                <Img src={img.url} alt={img.caption ?? `Photo ${i + 1}`} className="h-40 w-full" fallback="/images/placeholder-building.svg" />
                <div className="absolute left-2 top-2 flex gap-1">
                  {img.isCover && (
                    <Badge tone="amber">
                      <Star className="h-3 w-3 fill-current" /> Cover
                    </Badge>
                  )}
                  <StatusBadge status={img.status} />
                </div>
              </div>
              <div className="flex items-center gap-1 p-2">
                <GripVertical className="h-4 w-4 text-slate-300" aria-hidden />
                <CaptionInput propertyId={propertyId} img={img} />
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move earlier" disabled={i === 0 || pending === "order"} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move later" disabled={i === sorted.length - 1 || pending === "order"} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                {!img.isCover && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Set as cover photo" onClick={() => run("cover", () => call(`/api/owner/properties/${propertyId}/images`, "PATCH", { coverId: img.id }), { success: "Cover photo updated" })}>
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label="Delete photo" onClick={() => setDel(img)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete this photo?"
        description="It will be removed from your listing immediately."
        confirmText="Delete"
        tone="danger"
        loading={pending === "del"}
        onConfirm={async () => {
          await run("del", () => call(`/api/owner/properties/${propertyId}/images/${del!.id}`, "DELETE"), { success: "Photo deleted" });
          setDel(null);
        }}
      />
    </div>
  );
}

function CaptionInput({ propertyId, img }: { propertyId: string; img: ImageItem }) {
  const [v, setV] = useState(img.caption ?? "");
  const { run } = useAction();
  return (
    <Input
      aria-label="Photo caption"
      value={v}
      placeholder="Caption"
      className="h-8 flex-1 text-xs"
      maxLength={120}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (img.caption ?? "") && run("cap", () => call(`/api/owner/properties/${propertyId}/images`, "PATCH", { captions: [{ id: img.id, caption: v }] }), { success: "Caption saved", refresh: false })}
    />
  );
}

// ───────────────────────────── facilities ─────────────────────────────

export function FacilitiesEditor({ propertyId, facilities, selected, custom }: { propertyId: string; facilities: FacilityOpt[]; selected: { facilityId: string; status: string }[]; custom: { id: string; name: string; status: string }[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(selected.map((s) => s.facilityId)));
  const [customName, setCustomName] = useState("");
  const { run, pending } = useAction();
  const statusOf = useMemo(() => Object.fromEntries(selected.map((s) => [s.facilityId, s.status])), [selected]);
  const groups = useMemo(() => {
    const g: Record<string, FacilityOpt[]> = {};
    for (const f of facilities.filter((x) => x.active && !x.isCustom)) (g[f.category] ??= []).push(f);
    return g;
  }, [facilities]);
  const save = () => run("save", () => call(`/api/owner/properties/${propertyId}/facilities`, "PUT", { facilityIds: [...sel, ...custom.map((c) => c.id)] }), { success: "Facilities saved" });
  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([cat, list]) => (
        <fieldset key={cat}>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{humanize(cat)}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Checkbox
                  label={f.name}
                  checked={sel.has(f.id)}
                  onChange={(e) => {
                    const n = new Set(sel);
                    if (e.target.checked) n.add(f.id);
                    else n.delete(f.id);
                    setSel(n);
                  }}
                />
                {sel.has(f.id) && statusOf[f.id] && statusOf[f.id] !== "APPROVED" && <StatusBadge status={statusOf[f.id]} />}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      {custom.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Requested custom facilities</p>
          <div className="flex flex-wrap gap-2">
            {custom.map((c) => (
              <Badge key={c.id} tone={c.status === "APPROVED" ? "green" : "amber"}>
                {c.name} · {humanize(c.status)}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Request a custom facility" placeholder="Something missing? e.g. Rooftop terrace" value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={60} />
        <Button
          type="button"
          variant="outline"
          disabled={customName.trim().length < 2}
          loading={pending === "custom"}
          onClick={async () => {
            const r = await run("custom", () => call(`/api/owner/properties/${propertyId}/facilities/custom`, "POST", { name: customName.trim() }), { success: "Sent to StayShare for approval" });
            if (r) setCustomName("");
          }}
        >
          <Plus className="h-4 w-4" /> Request facility
        </Button>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} loading={pending === "save"}>
          Save facilities
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────── house rules ─────────────────────────────

const RULE_SUGGESTIONS = ["No smoking inside the rooms", "No alcohol or drugs on the premises", "Visitors allowed in the lounge only, till 9 PM", "Gate closes at 11 PM — inform the warden for late entry", "Keep common areas clean", "Quiet hours from 10 PM to 7 AM", "Valid government ID mandatory at check-in", "Pets are not allowed"];

export function RulesEditor({ propertyId, rules }: { propertyId: string; rules: string[] }) {
  const [list, setList] = useState<string[]>(rules);
  const [draft, setDraft] = useState("");
  const { run, pending } = useAction();
  const add = (t: string) => {
    const s = t.trim();
    if (s.length < 2 || list.includes(s)) return;
    setList([...list, s]);
    setDraft("");
  };
  return (
    <div className="space-y-4">
      {list.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No house rules yet. Add a few so guests know what to expect.</p>
      ) : (
        <ol className="space-y-2">
          {list.map((r, i) => (
            <li key={`${r}-${i}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <span className="w-5 text-slate-400">{i + 1}.</span>
              <span className="flex-1">{r}</span>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move up" disabled={i === 0} onClick={() => setList(list.map((x, j) => (j === i - 1 ? list[i]! : j === i ? list[i - 1]! : x)))}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label={`Remove rule ${r}`} onClick={() => setList(list.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <Input aria-label="New house rule" placeholder="Type a rule and press Add" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} />
        <Button type="submit" variant="outline">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">Quick add</p>
        <div className="flex flex-wrap gap-2">
          {RULE_SUGGESTIONS.filter((s) => !list.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
              + {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button loading={pending === "save"} onClick={() => run("save", () => call(`/api/owner/properties/${propertyId}/rules`, "PUT", { rules: list }), { success: "House rules saved" })}>
          Save rules
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────── documents ─────────────────────────────

export function DocumentsManager({ propertyId, docs }: { propertyId: string; docs: DocItem[] }) {
  const [docType, setDocType] = useState<string>(DOC_TYPES[0].value);
  const { run, pending } = useAction();
  const [del, setDel] = useState<DocItem | null>(null);
  const label = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? humanize(t);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[240px_1fr] sm:items-start">
        <div>
          <label htmlFor="doc-type" className="mb-1 block text-sm font-medium text-slate-700">
            Document type
          </label>
          <Select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-xs text-slate-500">Documents are private — only you and the StayShare verification team can see them.</p>
        </div>
        <Uploader purpose="PROPERTY_DOC" accept="image/jpeg,image/png,image/webp,application/pdf" label="Upload document" onUploaded={async (f) => {
            await call(`/api/owner/properties/${propertyId}/documents`, "POST", { fileId: f.id, docType });
          }}
        />
      </div>
      {docs.length === 0 ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No documents uploaded" description="Upload ownership / lease proof and licences so we can verify your property faster." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0">
                  <a href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-brand-700 hover:underline">
                    {label(d.docType)}
                  </a>
                  <p className="text-xs text-slate-500">{d.notes ?? new Date(d.createdAt).toLocaleDateString("en-IN")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />
                {d.status !== "APPROVED" && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label="Remove document" onClick={() => setDel(d)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title="Remove this document?"
        confirmText="Remove"
        tone="danger"
        loading={pending === "del"}
        onConfirm={async () => {
          await run("del", () => call(`/api/owner/properties/${propertyId}/documents/${del!.id}`, "DELETE"), { success: "Document removed" });
          setDel(null);
        }}
      />
    </div>
  );
}
