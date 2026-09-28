"use client";
import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { humanize } from "@/lib/site/labels";
import { Button, EmptyState, ErrorState, Input, Label, Select, TableSkeleton } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";

type G = { id: string; name: string; phone: string | null; email: string | null; gender: string | null; age: number | null; relation: string | null };
const empty = { name: "", phone: "", email: "", gender: "", age: "", relation: "" };

export function GuestsManager() {
  const [rows, setRows] = useState<G[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id?: string; v: typeof empty } | null>(null);
  const [del, setDel] = useState<G | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => apiFetch<G[]>("/api/account/guests").then((r) => (setRows(r), setErr(null))).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    const v = edit.v;
    const body = { name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), gender: v.gender, age: v.age ? Number(v.age) : null, relation: v.relation.trim() || null };
    try {
      await apiFetch("/api/account/guests", { method: edit.id ? "PATCH" : "POST", json: edit.id ? { ...body, id: edit.id } : body });
      toast.success(edit.id ? "Guest updated" : "Guest saved");
      setEdit(null);
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
      await apiFetch(`/api/account/guests?id=${del.id}`, { method: "DELETE" });
      toast.success("Guest removed");
      setDel(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const setV = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => edit && setEdit({ ...edit, v: { ...edit.v, [k]: e.target.value } });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ v: { ...empty } })}>
          <Plus className="h-4 w-4" aria-hidden /> Add guest
        </Button>
      </div>
      {err ? (
        <ErrorState description={err} action={<Button onClick={load}>Retry</Button>} />
      ) : !rows ? (
        <TableSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No saved guests" description="Save people you often book for and fill their details in one tap." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((g) => (
            <li key={g.id} className="card flex items-start justify-between gap-3 p-4">
              <div className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
                  <UserRound className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">
                    {g.name} {g.relation && <span className="text-xs font-normal text-slate-500">· {g.relation}</span>}
                  </p>
                  <p className="text-xs text-slate-500">{[g.gender ? humanize(g.gender) : null, g.age ? `${g.age} yrs` : null, g.phone, g.email].filter(Boolean).join(" · ") || "No details"}</p>
                </div>
              </div>
              <div className="flex">
                <button onClick={() => setEdit({ id: g.id, v: { name: g.name, phone: g.phone ?? "", email: g.email ?? "", gender: g.gender ?? "", age: g.age != null ? String(g.age) : "", relation: g.relation ?? "" } })} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${g.name}`}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => setDel(g)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${g.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? "Edit guest" : "Add a guest"}>
        {edit && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="sg-name">Full name</Label>
              <Input id="sg-name" value={edit.v.name} onChange={setV("name")} required minLength={2} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="sg-phone">Mobile</Label>
              <Input id="sg-phone" value={edit.v.phone} onChange={setV("phone")} inputMode="tel" />
            </div>
            <div>
              <Label htmlFor="sg-email">Email</Label>
              <Input id="sg-email" type="email" value={edit.v.email} onChange={setV("email")} />
            </div>
            <div>
              <Label htmlFor="sg-gender">Gender</Label>
              <Select id="sg-gender" value={edit.v.gender} onChange={setV("gender")}>
                <option value="">Select</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="sg-age">Age</Label>
              <Input id="sg-age" type="number" min={0} max={120} value={edit.v.age} onChange={setV("age")} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="sg-rel">Relation (optional)</Label>
              <Input id="sg-rel" value={edit.v.relation} onChange={setV("relation")} placeholder="e.g. Spouse, Friend, Colleague" maxLength={40} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save guest
              </Button>
            </div>
          </form>
        )}
      </Dialog>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} loading={busy} tone="danger" title={`Remove ${del?.name ?? "guest"}?`} confirmText="Remove" />
    </div>
  );
}
