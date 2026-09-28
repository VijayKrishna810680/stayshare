"use client";
import { useCallback, useEffect, useState } from "react";
import { FileText, Paperclip, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, uploadFile } from "@/lib/client-api";
import { DOC_TYPES } from "@/lib/site/labels";
import { Button, EmptyState, ErrorState, Input, Label, Select, StatusBadge, TableSkeleton } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";

type Doc = { id: string; docType: string; numberLast4: string; fileId: string | null; fileName: string | null; status: string; createdAt: string };

export function DocumentsManager() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Doc | null>(null);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState("AADHAAR");
  const [number, setNumber] = useState("");
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const load = useCallback(() => apiFetch<Doc[]>("/api/account/documents").then((d) => (setDocs(d), setErr(null))).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function onFile(f?: File) {
    if (!f) return;
    setUploading(true);
    try {
      const up = await uploadFile(f, "ID_PROOF");
      setFile({ id: up.id, name: up.fileName });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/account/documents", { method: "POST", json: { docType, number, fileId: file?.id ?? null } });
      toast.success("Document saved securely");
      setOpen(false);
      setNumber("");
      setFile(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      await apiFetch(`/api/account/documents?id=${del.id}`, { method: "DELETE" });
      toast.success("Document removed");
      setDel(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const label = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? t;
  const placeholder = { AADHAAR: "12-digit Aadhaar number", PAN: "ABCDE1234F", PASSPORT: "K1234567", DRIVING_LICENSE: "e.g. TS0920190001234", VOTER_ID: "ABC1234567" }[docType];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add document
        </Button>
      </div>
      {err ? (
        <ErrorState description={err} action={<Button onClick={load}>Retry</Button>} />
      ) : !docs ? (
        <TableSkeleton rows={3} />
      ) : docs.length === 0 ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No documents saved" description="Add an Aadhaar, passport, driving licence or voter ID to check out faster." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {docs.map((d) => (
            <li key={d.id} className="card flex items-start justify-between gap-3 p-4">
              <div className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">{label(d.docType)}</p>
                  <p className="font-mono text-sm tracking-wider text-slate-600">•••• •••• {d.numberLast4}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <StatusBadge status={d.status} />
                    {d.fileId && (
                      <a href={`/api/files/${d.fileId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                        <Paperclip className="h-3 w-3" aria-hidden /> View file
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setDel(d)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${label(d.docType)}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add an ID document" description="Your number is encrypted. Properties only see it at check-in for verification.">
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="dc-type">Document type</Label>
            <Select id="dc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dc-num">Document number</Label>
            <Input id="dc-num" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} placeholder={placeholder} required minLength={6} maxLength={24} autoComplete="off" />
          </div>
          <div>
            <Label>Upload a copy (optional)</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-3 text-sm text-slate-600 hover:border-brand-400">
              <Paperclip className="h-4 w-4" aria-hidden /> {uploading ? "Uploading…" : file ? file.name : "Choose JPG, PNG or PDF"}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" disabled={uploading} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={uploading}>
              Save document
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} loading={busy} tone="danger" title="Remove this document?" description="You can add it again at any time." confirmText="Remove" />
    </div>
  );
}
