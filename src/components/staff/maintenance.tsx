"use client";
import { useMemo, useState } from "react";
import { Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, EmptyState, Field, Input, Select, StatusBadge, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { call, useAction } from "@/components/owner/common";
import { humanize } from "@/components/owner/format";

export type IssueRow = { id: string; propertyId: string; propertyName: string; roomId: string | null; roomNumber: string | null; title: string; description: string | null; priority: string; status: string; createdAt: string; reporter: string; resolvedAt: string | null };
export type MRoom = { id: string; roomNumber: string; propertyId: string; maintenanceStatus: string };

export function MaintenanceBoard({ properties, rooms, issues, fixedPropertyId, today }: { properties: { id: string; name: string }[]; rooms: MRoom[]; issues: IssueRow[]; fixedPropertyId?: string; today: string }) {
  const { run, pending } = useAction();
  const [filter, setFilter] = useState<"OPEN" | "ALL">("OPEN");
  const [form, setForm] = useState<{ propertyId: string; roomId: string; title: string; description: string; priority: string; markRoom: boolean; startDate: string; endDate: string } | null>(null);
  const shown = issues.filter((i) => filter === "ALL" || i.status !== "RESOLVED");
  const formRooms = useMemo(() => rooms.filter((r) => r.propertyId === form?.propertyId), [rooms, form?.propertyId]);
  const maintRooms = rooms.filter((r) => r.maintenanceStatus === "UNDER_MAINTENANCE" && (!fixedPropertyId || r.propertyId === fixedPropertyId));
  const plus = (d: string, n: number) => {
    const x = new Date(d + "T00:00:00Z");
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const submit = async () => {
    const f = form!;
    if (f.title.trim().length < 3) return toast.error("Give the issue a short title");
    const created = await run("new", () => call("/api/staff/maintenance", "POST", { propertyId: f.propertyId, roomId: f.roomId || null, title: f.title, description: f.description || null, priority: f.priority }), { success: "Issue reported" });
    if (!created) return;
    if (f.markRoom && f.roomId) await run("m", () => call(`/api/staff/rooms/${f.roomId}/maintenance`, "POST", { status: "UNDER_MAINTENANCE", startDate: f.startDate, endDate: f.endDate, note: f.title }), { success: "Room marked under maintenance and blocked" });
    setForm(null);
  };
  return (
    <div className="space-y-5">
      {maintRooms.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-semibold text-red-800">Rooms under maintenance</p>
          <ul className="flex flex-wrap gap-2">
            {maintRooms.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-sm shadow-sm">
                Room {r.roomNumber}
                {!fixedPropertyId && <span className="text-xs text-slate-500">· {properties.find((p) => p.id === r.propertyId)?.name}</span>}
                <Button size="sm" variant="ghost" loading={pending === `ok-${r.id}`} onClick={() => run(`ok-${r.id}`, () => call(`/api/staff/rooms/${r.id}/maintenance`, "POST", { status: "OK" }), { success: `Room ${r.roomNumber} is back in service` })}>
                  Mark OK
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-300 bg-white p-0.5" role="group" aria-label="Filter issues">
          {(["OPEN", "ALL"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={filter === f ? "rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white" : "rounded-lg px-3 py-1.5 text-sm text-slate-600"}>
              {f === "OPEN" ? "Open" : "All"}
            </button>
          ))}
        </div>
        <Button onClick={() => setForm({ propertyId: fixedPropertyId ?? properties[0]?.id ?? "", roomId: "", title: "", description: "", priority: "MEDIUM", markRoom: false, startDate: today, endDate: plus(today, 1) })} disabled={!properties.length}>
          <Plus className="h-4 w-4" /> Report issue
        </Button>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<Wrench className="h-6 w-6" />} title={filter === "OPEN" ? "No open issues" : "No issues reported"} description="Report broken fixtures, leaks, AC problems and more so they get fixed quickly." />
      ) : (
        <ul className="space-y-3">
          {shown.map((i) => (
            <li key={i.id} className="card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{i.title}</p>
                  <p className="text-xs text-slate-500">
                    {!fixedPropertyId && `${i.propertyName} · `}
                    {i.roomNumber ? `Room ${i.roomNumber}` : "Common area"} · reported by {i.reporter} on {new Date(i.createdAt).toLocaleDateString("en-IN")}
                  </p>
                  {i.description && <p className="mt-1 text-sm text-slate-600">{i.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={i.priority === "URGENT" ? "red" : i.priority === "HIGH" ? "amber" : "slate"}>{humanize(i.priority)}</Badge>
                  <StatusBadge status={i.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {i.status === "OPEN" && (
                  <Button size="sm" variant="outline" loading={pending === `p-${i.id}`} onClick={() => run(`p-${i.id}`, () => call(`/api/staff/maintenance/${i.id}`, "PATCH", { status: "IN_PROGRESS" }), { success: "Marked in progress" })}>
                    Start work
                  </Button>
                )}
                {i.status !== "RESOLVED" ? (
                  <Button size="sm" variant="secondary" loading={pending === `r-${i.id}`} onClick={() => run(`r-${i.id}`, () => call(`/api/staff/maintenance/${i.id}`, "PATCH", { status: "RESOLVED" }), { success: "Resolved" })}>
                    Mark resolved
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" loading={pending === `o-${i.id}`} onClick={() => run(`o-${i.id}`, () => call(`/api/staff/maintenance/${i.id}`, "PATCH", { status: "OPEN" }), { success: "Re-opened" })}>
                    Re-open
                  </Button>
                )}
                {i.roomId && i.status !== "RESOLVED" && rooms.find((r) => r.id === i.roomId)?.maintenanceStatus === "OK" && (
                  <Button size="sm" variant="ghost" className="text-red-700" loading={pending === `u-${i.id}`} onClick={() => run(`u-${i.id}`, () => call(`/api/staff/rooms/${i.roomId}/maintenance`, "POST", { status: "UNDER_MAINTENANCE", note: i.title }), { success: "Room taken out of service" })}>
                    Take room out of service
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title="Report a maintenance issue"
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending === "new" || pending === "m"}>
              Report
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            {!fixedPropertyId && (
              <Field label="Property" className="sm:col-span-2">
                {(p) => (
                  <Select {...p} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value, roomId: "" })}>
                    {properties.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label="Room">
              {(p) => (
                <Select {...p} value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                  <option value="">Common area / building</option>
                  {formRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Priority">
              {(p) => (
                <Select {...p} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((x) => (
                    <option key={x} value={x}>
                      {humanize(x)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Title" required className="sm:col-span-2">
              {(p) => <Input {...p} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. AC not cooling" />}
            </Field>
            <Field label="Details" className="sm:col-span-2">
              {(p) => <Textarea {...p} rows={3} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
            </Field>
            {form.roomId && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.markRoom} onChange={(e) => setForm({ ...form, markRoom: e.target.checked })} />
                  Take this room out of service and block these dates
                </label>
                {form.markRoom && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="From">{(p) => <Input {...p} type="date" min={today} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />}</Field>
                    <Field label="Until">{(p) => <Input {...p} type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />}</Field>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
