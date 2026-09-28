"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarX2, ChevronLeft, ChevronRight, MessageSquareReply, Unlock } from "lucide-react";
import { toast } from "sonner";
import { toPaise, toRupeeInput } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { call, Toggle, useAction } from "./common";
import { humanize, monthLabel } from "./format";

// ───────────────────────────── availability calendar ─────────────────────────────

export type GridRoom = { id: string; roomNumber: string; name: string | null; totalBeds: number; maintenanceStatus: string; cells: Record<string, { BOOKED: number; HELD: number; BLOCKED: number }> };
export type BlockRow = { id: string; roomId: string | null; bedId: string | null; roomNumber: string | null; bedCode: string | null; startDate: string; endDate: string; reason: string; note: string | null };

export function AvailabilityCalendar({ propertyId, month, prevMonth, nextMonth, nights, rooms, blocks, bedsByRoom, today }: { propertyId: string; month: string; prevMonth: string; nextMonth: string; nights: string[]; rooms: GridRoom[]; blocks: BlockRow[]; bedsByRoom: Record<string, { id: string; code: string }[]>; today: string }) {
  const { run, pending } = useAction();
  const [form, setForm] = useState<{ roomId: string; bedId: string; startDate: string; endDate: string; reason: string; note: string } | null>(null);
  const [rel, setRel] = useState<BlockRow | null>(null);
  const base = `/owner/properties/${propertyId}?tab=availability`;
  const openBlock = (roomId = "", start = today) => {
    const d = new Date(start + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    setForm({ roomId, bedId: "", startDate: start, endDate: d.toISOString().slice(0, 10), reason: "OWNER_BLOCK", note: "" });
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`${base}&month=${prevMonth}`} className="rounded-lg border border-slate-300 bg-white p-2 hover:bg-slate-50" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h3 className="min-w-40 text-center font-semibold">{monthLabel(month)}</h3>
          <Link href={`${base}&month=${nextMonth}`} className="rounded-lg border border-slate-300 bg-white p-2 hover:bg-slate-50" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <Legend className="bg-emerald-100" label="All free" />
          <Legend className="bg-amber-200" label="Partly booked" />
          <Legend className="bg-brand-500" label="Fully booked" />
          <Legend className="bg-slate-400" label="Blocked" />
          <Button size="sm" onClick={() => openBlock()} disabled={!rooms.length}>
            <CalendarX2 className="h-4 w-4" /> Block dates
          </Button>
        </div>
      </div>
      {rooms.length === 0 ? (
        <EmptyState title="No rooms to show" description="Add rooms and beds to see their availability." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-600">
                  Room
                </th>
                {nights.map((n) => {
                  const d = new Date(n + "T00:00:00Z");
                  const wk = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                  return (
                    <th key={n} scope="col" className={cn("w-8 px-0.5 py-2 text-center font-medium", wk ? "text-accent-600" : "text-slate-500", n === today && "rounded-t bg-brand-50 text-brand-700")}>
                      <span className="block">{d.getUTCDate()}</span>
                      <span className="block text-[10px] opacity-70">{"SMTWTFS"[d.getUTCDay()]}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-medium">
                    {r.roomNumber}
                    <span className="block text-[10px] font-normal text-slate-500">{r.totalBeds} beds</span>
                  </th>
                  {nights.map((n) => {
                    const c = r.cells[n] ?? { BOOKED: 0, HELD: 0, BLOCKED: 0 };
                    const used = c.BOOKED + c.HELD;
                    const free = Math.max(0, r.totalBeds - used - c.BLOCKED);
                    const tone = c.BLOCKED >= r.totalBeds && r.totalBeds ? "bg-slate-400 text-white" : used >= r.totalBeds && r.totalBeds ? "bg-brand-500 text-white" : used + c.BLOCKED > 0 ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800";
                    const title = `Room ${r.roomNumber}, ${n}: ${c.BOOKED} booked, ${c.HELD} held, ${c.BLOCKED} blocked, ${free} free`;
                    return (
                      <td key={n} className="p-0.5">
                        <button type="button" title={title} aria-label={title} onClick={() => n >= today && openBlock(r.id, n)} disabled={n < today} className={cn("grid h-8 w-8 place-items-center rounded-md font-semibold", tone, n < today && "opacity-50")}>
                          {free}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Numbers show free beds per night. Tap a future date to block it.</p>
        </div>
      )}

      <section>
        <h3 className="mb-2 font-semibold">Active blocks</h3>
        {blocks.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No blocks. Use blocks for maintenance, owner use or offline (walk-in) bookings so they aren&apos;t sold online.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {humanize(b.reason)} · {b.bedCode ? `Bed ${b.bedCode}` : b.roomNumber ? `Room ${b.roomNumber}` : "Whole property"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {b.startDate} → {b.endDate} (check-out day free){b.note ? ` · ${b.note}` : ""}
                  </p>
                </div>
                {b.reason !== "ADMIN_BLOCK" && (
                  <Button size="sm" variant="outline" onClick={() => setRel(b)}>
                    <Unlock className="h-4 w-4" /> Release
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title="Block dates"
        description="Blocked beds can't be booked online. Blocks can't overlap existing bookings."
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button
              loading={pending === "block"}
              onClick={async () => {
                if (!form!.startDate || !form!.endDate || form!.endDate <= form!.startDate) return toast.error("End date must be after the start date");
                const r = await run("block", () => call(`/api/owner/properties/${propertyId}/blocks`, "POST", { roomId: form!.roomId || null, bedId: form!.bedId || null, startDate: form!.startDate, endDate: form!.endDate, reason: form!.reason, note: form!.note || undefined }), { success: "Dates blocked" });
                if (r) setForm(null);
              }}
            >
              Block
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Room">
              {(p) => (
                <Select {...p} value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value, bedId: "" })}>
                  <option value="">Whole property</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Bed">
              {(p) => (
                <Select {...p} value={form.bedId} onChange={(e) => setForm({ ...form, bedId: e.target.value })} disabled={!form.roomId}>
                  <option value="">All beds in the room</option>
                  {(bedsByRoom[form.roomId] ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="From (first night)">
              {(p) => <Input {...p} type="date" min={today} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />}
            </Field>
            <Field label="Until (check-out day, not blocked)">
              {(p) => <Input {...p} type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />}
            </Field>
            <Field label="Reason" className="sm:col-span-2">
              {(p) => (
                <Select {...p} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                  <option value="OWNER_BLOCK">Owner block / not available</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OFFLINE_BOOKING">Offline / walk-in booking</option>
                </Select>
              )}
            </Field>
            <Field label="Note" className="sm:col-span-2">
              {(p) => <Input {...p} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} placeholder={form.reason === "OFFLINE_BOOKING" ? "Guest name / reference" : "Optional"} />}
            </Field>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!rel}
        onClose={() => setRel(null)}
        title="Release this block?"
        description="The dates become bookable again."
        confirmText="Release"
        loading={pending === "rel"}
        onConfirm={async () => {
          await run("rel", () => call(`/api/owner/blocks/${rel!.id}`, "DELETE"), { success: "Block released" });
          setRel(null);
        }}
      />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-3 w-3 rounded", className)} aria-hidden /> {label}
    </span>
  );
}

// ───────────────────────────── suggested price (only when enabled by admin) ─────────────────────────────

export type SuggestValues = { suggestedNightlyBed: number | null; suggestedNightlyRoom: number | null; suggestedMonthlyBed: number | null; suggestedMonthlyRoom: number | null; suggestedDeposit: number | null; suggestedNote: string | null; priceSubmittedAt: string | null };

export function SuggestPriceForm({ roomId, values, allowBed, allowRoom }: { roomId: string; values: SuggestValues; allowBed: boolean; allowRoom: boolean }) {
  const [v, setV] = useState({
    nb: toRupeeInput(values.suggestedNightlyBed),
    nr: toRupeeInput(values.suggestedNightlyRoom),
    mb: toRupeeInput(values.suggestedMonthlyBed),
    mr: toRupeeInput(values.suggestedMonthlyRoom),
    dep: toRupeeInput(values.suggestedDeposit),
    note: values.suggestedNote ?? "",
  });
  const { run, pending } = useAction();
  const p = (s: string) => (s === "" ? null : toPaise(s));
  const bad = Object.entries(v).some(([k, x]) => k !== "note" && x !== "" && (!Number.isFinite(Number(x)) || Number(x) < 0));
  return (
    <details className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">Suggested price (for StayShare team review){values.priceSubmittedAt && <span className="ml-2 text-xs font-normal text-slate-500">last sent {new Date(values.priceSubmittedAt).toLocaleDateString("en-IN")}</span>}</summary>
      <p className="mt-2 text-xs text-slate-500">Optional. These are suggestions only — guests always see the price set by the StayShare team.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {allowBed && (
          <>
            <Field label="Per bed / night (₹)">{(f) => <Input {...f} inputMode="decimal" value={v.nb} onChange={(e) => setV({ ...v, nb: e.target.value })} />}</Field>
            <Field label="Per bed / month (₹)">{(f) => <Input {...f} inputMode="decimal" value={v.mb} onChange={(e) => setV({ ...v, mb: e.target.value })} />}</Field>
          </>
        )}
        {allowRoom && (
          <>
            <Field label="Entire room / night (₹)">{(f) => <Input {...f} inputMode="decimal" value={v.nr} onChange={(e) => setV({ ...v, nr: e.target.value })} />}</Field>
            <Field label="Entire room / month (₹)">{(f) => <Input {...f} inputMode="decimal" value={v.mr} onChange={(e) => setV({ ...v, mr: e.target.value })} />}</Field>
          </>
        )}
        <Field label="Security deposit (₹)">{(f) => <Input {...f} inputMode="decimal" value={v.dep} onChange={(e) => setV({ ...v, dep: e.target.value })} />}</Field>
        <Field label="Note for the pricing team" className="sm:col-span-3">
          {(f) => <Textarea {...f} rows={2} value={v.note} maxLength={500} onChange={(e) => setV({ ...v, note: e.target.value })} />}
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={bad}
          loading={pending === "s"}
          onClick={() => run("s", () => call(`/api/owner/rooms/${roomId}/suggested-price`, "PUT", { suggestedNightlyBed: p(v.nb), suggestedNightlyRoom: p(v.nr), suggestedMonthlyBed: p(v.mb), suggestedMonthlyRoom: p(v.mr), suggestedDeposit: p(v.dep), suggestedNote: v.note || null }), { success: "Suggestion sent to the StayShare team" })}
        >
          Send suggestion
        </Button>
      </div>
    </details>
  );
}

// ───────────────────────────── staff assignment ─────────────────────────────

export function StaffAssign({ propertyId, staff }: { propertyId: string; staff: { id: string; name: string; designation: string | null; active: boolean; assigned: boolean; contact: string }[] }) {
  const { run, pending } = useAction();
  if (!staff.length)
    return (
      <EmptyState
        title="No staff accounts yet"
        description="Create front-desk logins for your team, then assign them to this property."
        action={
          <Link href="/owner/staff" className="text-sm font-semibold text-brand-700 hover:underline">
            Create staff account
          </Link>
        }
      />
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {staff.map((s) => (
        <Toggle
          key={s.id}
          label={`${s.name}${s.active ? "" : " (deactivated)"}`}
          description={[s.designation, s.contact].filter(Boolean).join(" · ")}
          checked={s.assigned}
          disabled={pending === s.id}
          onChange={(v) => run(s.id, () => call(`/api/owner/properties/${propertyId}/staff`, "PUT", { userId: s.id, assigned: v }), { success: v ? `${s.name} assigned` : `${s.name} unassigned` })}
        />
      ))}
    </div>
  );
}

// ───────────────────────────── review replies ─────────────────────────────

export function ReviewReply({ reviewId, existing }: { reviewId: string; existing: string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(existing ?? "");
  const [confirm, setConfirm] = useState(false);
  const { run, pending } = useAction();
  if (!open)
    return (
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <MessageSquareReply className="h-4 w-4" /> {existing ? "Edit reply" : "Reply"}
        </Button>
        {existing && (
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setConfirm(true)}>
            Delete reply
          </Button>
        )}
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Delete your reply?" tone="danger" confirmText="Delete" loading={pending === "d"} onConfirm={async () => {
          await run("d", () => call(`/api/owner/reviews/${reviewId}/reply`, "DELETE"), { success: "Reply deleted" });
          setConfirm(false);
        }} />
      </div>
    );
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("r", () => call(`/api/owner/reviews/${reviewId}/reply`, "POST", { text }), { success: "Reply posted" });
        if (r) setOpen(false);
      }}
    >
      <label htmlFor={`reply-${reviewId}`} className="sr-only">
        Your reply
      </label>
      <Textarea id={`reply-${reviewId}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder="Thank the guest and address any concerns…" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending === "r"} disabled={text.trim().length < 2}>
          Post reply
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
