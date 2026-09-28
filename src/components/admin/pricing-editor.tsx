"use client";
import { useMemo, useState } from "react";
import { Calculator, Plus, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { formatINR } from "@/lib/money";
import { Alert, Badge, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAdminAction } from "./step-up";

export type PlanValues = {
  name: string;
  nightlyBed: number | null;
  nightlyRoom: number | null;
  weeklyBed: number | null;
  weeklyRoom: number | null;
  monthlyBed: number | null;
  monthlyRoom: number | null;
  extraAdultPerNight: number;
  childPerNight: number;
  acChargePerNight: number;
  foodPerPersonPerDay: number;
  laundryPerMonth: number;
  cleaningFee: number;
  securityDepositBed: number;
  securityDepositRoom: number;
  durationPrices: { unit: "BED" | "ROOM"; nights: number; totalPrice: number }[];
};
export type RoomInfo = { id: string; roomNumber: string; name: string | null; category: string; sharingCapacity: number; totalBeds: number; maxOccupancy: number; isAC: boolean; allowBedBooking: boolean; allowEntireRoomBooking: boolean };
export type Suggestion = { nightlyBed: number | null; nightlyRoom: number | null; monthlyBed: number | null; monthlyRoom: number | null; deposit: number | null; note: string | null; submittedAt: string | Date | null } | null;

const PACKAGE_NIGHTS = [1, 2, 5, 10, 15, 20, 30];
const r = (p: number | null | undefined) => (p == null ? "" : String(p / 100));
const p = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));
const p0 = (s: string) => p(s) ?? 0;

type Form = Record<string, string>;

function init(plan: PlanValues | null): { f: Form; pk: { nights: string; bed: string; room: string }[] } {
  const f: Form = { name: plan?.name ?? "Standard" };
  for (const k of ["nightlyBed", "nightlyRoom", "weeklyBed", "weeklyRoom", "monthlyBed", "monthlyRoom", "extraAdultPerNight", "childPerNight", "acChargePerNight", "foodPerPersonPerDay", "laundryPerMonth", "cleaningFee", "securityDepositBed", "securityDepositRoom"] as const) {
    const v = plan?.[k];
    f[k] = r(v);
  }
  const nightsSet = new Set<number>(PACKAGE_NIGHTS);
  for (const d of plan?.durationPrices ?? []) nightsSet.add(d.nights);
  const pk = [...nightsSet]
    .sort((a, b) => a - b)
    .map((n) => ({
      nights: String(n),
      bed: r(plan?.durationPrices.find((d) => d.unit === "BED" && d.nights === n)?.totalPrice),
      room: r(plan?.durationPrices.find((d) => d.unit === "ROOM" && d.nights === n)?.totalPrice),
    }));
  return { f, pk };
}

export function formToPlan(f: Form, pk: { nights: string; bed: string; room: string }[]): PlanValues {
  const durationPrices: PlanValues["durationPrices"] = [];
  for (const row of pk) {
    const n = Math.round(Number(row.nights));
    if (!n || n < 1) continue;
    if (p(row.bed)) durationPrices.push({ unit: "BED", nights: n, totalPrice: p(row.bed)! });
    if (p(row.room)) durationPrices.push({ unit: "ROOM", nights: n, totalPrice: p(row.room)! });
  }
  return {
    name: f.name || "Standard",
    nightlyBed: p(f.nightlyBed ?? ""),
    nightlyRoom: p(f.nightlyRoom ?? ""),
    weeklyBed: p(f.weeklyBed ?? ""),
    weeklyRoom: p(f.weeklyRoom ?? ""),
    monthlyBed: p(f.monthlyBed ?? ""),
    monthlyRoom: p(f.monthlyRoom ?? ""),
    extraAdultPerNight: p0(f.extraAdultPerNight ?? ""),
    childPerNight: p0(f.childPerNight ?? ""),
    acChargePerNight: p0(f.acChargePerNight ?? ""),
    foodPerPersonPerDay: p0(f.foodPerPersonPerDay ?? ""),
    laundryPerMonth: p0(f.laundryPerMonth ?? ""),
    cleaningFee: p0(f.cleaningFee ?? ""),
    securityDepositBed: p0(f.securityDepositBed ?? ""),
    securityDepositRoom: p0(f.securityDepositRoom ?? ""),
    durationPrices,
  };
}

function MoneyInput({ id, value, onChange, label, disabled }: { id: string; value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-2 text-sm text-slate-400">₹</span>
      <Input id={id} aria-label={label} type="number" min={0} step="1" inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-9 pl-6 tabular-nums" />
    </div>
  );
}

/**
 * The admin pricing editor. All customer-facing prices are entered here by the StayShare team.
 * Saving creates a new active price plan and writes price history with the mandatory reason.
 */
export function PricingEditor({ room, plan, suggestion, compact, onSaved }: { room: RoomInfo; plan: PlanValues | null; suggestion?: Suggestion; compact?: boolean; onSaved?: () => void }) {
  const start = useMemo(() => init(plan), [plan]);
  const [f, setF] = useState<Form>(start.f);
  const [pk, setPk] = useState(start.pk);
  const [flags, setFlags] = useState({ allowBedBooking: room.allowBedBooking, allowEntireRoomBooking: room.allowEntireRoomBooking });
  const [reason, setReason] = useState("");
  const [effFrom, setEffFrom] = useState("");
  const [effTo, setEffTo] = useState("");
  const [showPreview, setShowPreview] = useState(!compact);
  const { exec, busy } = useAdminAction();
  const set = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const draft = formToPlan(f, pk);

  const useSuggestion = () => {
    if (!suggestion) return;
    setF((s) => ({
      ...s,
      nightlyBed: suggestion.nightlyBed != null ? r(suggestion.nightlyBed) : s.nightlyBed!,
      nightlyRoom: suggestion.nightlyRoom != null ? r(suggestion.nightlyRoom) : s.nightlyRoom!,
      monthlyBed: suggestion.monthlyBed != null ? r(suggestion.monthlyBed) : s.monthlyBed!,
      monthlyRoom: suggestion.monthlyRoom != null ? r(suggestion.monthlyRoom) : s.monthlyRoom!,
      securityDepositBed: suggestion.deposit != null ? r(suggestion.deposit) : s.securityDepositBed!,
    }));
    toast.info("Owner's suggested prices copied into the form — review before saving");
  };
  const autofill = () => {
    // derive weekly/monthly/packages from nightly prices with standard long-stay discounts
    const nb = p(f.nightlyBed ?? "");
    const nr = p(f.nightlyRoom ?? "");
    const disc: Record<number, number> = { 1: 1, 2: 1, 5: 0.95, 10: 0.92, 15: 0.9, 20: 0.88, 30: 0.8 };
    const round = (x: number) => String(Math.round(x / 100));
    setF((s) => ({
      ...s,
      weeklyBed: nb ? round(nb * 7 * 0.9) : s.weeklyBed!,
      weeklyRoom: nr ? round(nr * 7 * 0.9) : s.weeklyRoom!,
      monthlyBed: nb && !s.monthlyBed ? round(nb * 30 * 0.8) : s.monthlyBed!,
      monthlyRoom: nr && !s.monthlyRoom ? round(nr * 30 * 0.8) : s.monthlyRoom!,
    }));
    setPk((rows) => rows.map((row) => ({ ...row, bed: nb && disc[Number(row.nights)] ? round(nb * Number(row.nights) * disc[Number(row.nights)]!) : row.bed, room: nr && disc[Number(row.nights)] ? round(nr * Number(row.nights) * disc[Number(row.nights)]!) : row.room })));
    toast.info("Weekly, monthly and package prices suggested from nightly rates (10% weekly, 20% monthly discount). Adjust as needed.");
  };

  const save = async () => {
    if (reason.trim().length < 3) return toast.error("Enter a reason for this price change (required for price history)");
    const out = await exec(
      () =>
        apiFetch(`/api/admin/rooms/${room.id}/price-plan`, {
          method: "POST",
          json: { ...draft, ...flags, reason, effectiveFrom: effFrom || null, effectiveTo: effTo || null },
        }),
      { success: `Prices saved for room ${room.roomNumber}` },
    );
    if (out !== undefined) {
      setReason("");
      onSaved?.();
    }
  };

  const grid = [
    { k: "nightly", label: "Nightly price", hint: "per night" },
    { k: "weekly", label: "Weekly (7 nights)", hint: "total for 7 nights" },
    { k: "monthly", label: "Monthly (30 nights)", hint: "total for 30 nights" },
  ];
  const sugg = (unit: "Bed" | "Room", k: string) => {
    if (!suggestion) return null;
    const v = k === "nightly" ? (unit === "Bed" ? suggestion.nightlyBed : suggestion.nightlyRoom) : k === "monthly" ? (unit === "Bed" ? suggestion.monthlyBed : suggestion.monthlyRoom) : null;
    return v == null ? "—" : formatINR(v);
  };

  return (
    <div className="space-y-5">
      {!plan && <Alert tone="warn" title="No price plan yet">This room cannot be approved or booked until the StayShare team enters its prices below.</Alert>}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3 text-sm">
        <span className="font-medium">
          Room {room.roomNumber}
          {room.name ? ` · ${room.name}` : ""}
        </span>
        <Badge>{room.category.toLowerCase()}</Badge>
        <Badge>{room.sharingCapacity}-sharing</Badge>
        <Badge tone={room.isAC ? "blue" : "slate"}>{room.isAC ? "AC" : "Non-AC"}</Badge>
        <label className="ml-auto flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={flags.allowBedBooking} onChange={(e) => setFlags({ ...flags, allowBedBooking: e.target.checked })} /> Bed booking
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={flags.allowEntireRoomBooking} onChange={(e) => setFlags({ ...flags, allowEntireRoomBooking: e.target.checked })} /> Entire-room booking
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 text-left font-semibold">Base price</th>
              <th className="py-2 text-left font-semibold">Per bed</th>
              <th className="py-2 text-left font-semibold">Entire room</th>
              {suggestion && <th className="py-2 text-left font-semibold text-accent-600">Owner suggested (bed / room)</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grid.map((g) => (
              <tr key={g.k}>
                <td className="py-2 pr-3">
                  <p className="font-medium text-slate-800">{g.label}</p>
                  <p className="text-xs text-slate-500">{g.hint}</p>
                </td>
                <td className="py-2 pr-3">
                  <MoneyInput id={`${room.id}-${g.k}Bed`} label={`${g.label} per bed`} value={f[`${g.k}Bed`] ?? ""} onChange={set(`${g.k}Bed`)} disabled={!flags.allowBedBooking} />
                </td>
                <td className="py-2 pr-3">
                  <MoneyInput id={`${room.id}-${g.k}Room`} label={`${g.label} entire room`} value={f[`${g.k}Room`] ?? ""} onChange={set(`${g.k}Room`)} disabled={!flags.allowEntireRoomBooking} />
                </td>
                {suggestion && (
                  <td className="py-2 text-xs text-slate-600">
                    {sugg("Bed", g.k)} / {sugg("Room", g.k)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {suggestion && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent-100 bg-accent-50 p-3 text-sm">
          <span>
            Owner suggestion{suggestion.deposit != null && ` · deposit ${formatINR(suggestion.deposit)}`}
            {suggestion.note && ` · “${suggestion.note}”`}
          </span>
          <Button size="sm" variant="outline" onClick={useSuggestion} className="ml-auto">
            Use suggested prices
          </Button>
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Duration packages (total price for N nights)</h4>
          <Button size="sm" variant="ghost" onClick={autofill}>
            <Sparkles className="h-4 w-4" /> Suggest from nightly
          </Button>
        </div>
        <p className="mb-2 text-xs text-slate-500">The engine uses the largest package/tier whose length is ≤ the stay; an exact match charges the package total. Leave blank to skip.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1.5 text-left">Nights</th>
                <th className="py-1.5 text-left">Bed total</th>
                <th className="py-1.5 text-left">Room total</th>
                <th className="py-1.5 text-left">Per night (bed / room)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pk.map((row, i) => {
                const n = Number(row.nights) || 0;
                return (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <Input aria-label="Nights" type="number" min={1} value={row.nights} onChange={(e) => setPk(pk.map((x, j) => (j === i ? { ...x, nights: e.target.value } : x)))} className="h-9 w-20" />
                    </td>
                    <td className="py-1 pr-2">
                      <MoneyInput id={`${room.id}-pk-b-${i}`} label={`${row.nights}-night bed package`} value={row.bed} onChange={(v) => setPk(pk.map((x, j) => (j === i ? { ...x, bed: v } : x)))} disabled={!flags.allowBedBooking} />
                    </td>
                    <td className="py-1 pr-2">
                      <MoneyInput id={`${room.id}-pk-r-${i}`} label={`${row.nights}-night room package`} value={row.room} onChange={(v) => setPk(pk.map((x, j) => (j === i ? { ...x, room: v } : x)))} disabled={!flags.allowEntireRoomBooking} />
                    </td>
                    <td className="py-1 pr-2 text-xs tabular-nums text-slate-500">
                      {n && row.bed ? formatINR(Math.round((p(row.bed)! / n) / 100) * 100) : "—"} / {n && row.room ? formatINR(Math.round((p(row.room)! / n) / 100) * 100) : "—"}
                    </td>
                    <td>
                      <button type="button" aria-label="Remove package row" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setPk(pk.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setPk([...pk, { nights: "", bed: "", room: "" }])}>
          <Plus className="h-4 w-4" /> Custom N nights
        </Button>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Extras, fees & deposits</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["extraAdultPerNight", "Extra adult / night"],
            ["childPerNight", "Child / night"],
            ["acChargePerNight", room.isAC ? "AC charge / night" : "AC charge / night (non-AC room)"],
            ["foodPerPersonPerDay", "Food / person / day"],
            ["laundryPerMonth", "Laundry / month"],
            ["cleaningFee", "Cleaning fee (per booking)"],
            ["securityDepositBed", "Security deposit / bed"],
            ["securityDepositRoom", "Security deposit / room"],
          ].map(([k, l]) => (
            <div key={k}>
              <Label htmlFor={`${room.id}-${k}`} className="text-xs">
                {l}
              </Label>
              <MoneyInput id={`${room.id}-${k}`} label={l!} value={f[k!] ?? ""} onChange={set(k!)} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${room.id}-pn`} className="text-xs">
            Plan name
          </Label>
          <Input id={`${room.id}-pn`} value={f.name ?? ""} onChange={(e) => set("name")(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label htmlFor={`${room.id}-ef`} className="text-xs">
            Effective from
          </Label>
          <Input id={`${room.id}-ef`} type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label htmlFor={`${room.id}-et`} className="text-xs">
            Effective to (optional)
          </Label>
          <Input id={`${room.id}-et`} type="date" value={effTo} onChange={(e) => setEffTo(e.target.value)} className="h-9" />
        </div>
        <p className="text-xs text-slate-500 sm:col-span-3">The new plan becomes the active customer-facing price as soon as it is saved; effective dates are recorded in price history for reference.</p>
        <div className="sm:col-span-3">
          <Label htmlFor={`${room.id}-reason`} className="text-xs">
            Reason for change <span className="text-red-600">*</span>
          </Label>
          <Textarea id={`${room.id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Initial pricing after property verification / market correction for Q4" className="min-h-16" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} loading={busy}>
          <Save className="h-4 w-4" /> Save price plan
        </Button>
        <Button variant="outline" onClick={() => setShowPreview((s) => !s)}>
          <Calculator className="h-4 w-4" /> {showPreview ? "Hide" : "Show"} live preview
        </Button>
      </div>
      {showPreview && <PricePreview room={{ ...room, ...flags }} draft={draft} />}
    </div>
  );
}

type QuoteLine = { key: string; label: string; amount: number; kind: string };
type QuoteOut = { lines: QuoteLine[]; totalAmount: number; tierLabel: string; appliedRules: string[]; taxRateBps: number; nights: number; nightly: { night: string; amount: number }[]; payableExDeposit: number };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Live quote breakdown from the real pricing engine; uses the draft plan when provided. */
export function PricePreview({ room, draft }: { room: RoomInfo; draft?: PlanValues | null }) {
  const today = new Date();
  const [unit, setUnit] = useState<"BED" | "ROOM">(room.allowBedBooking ? "BED" : "ROOM");
  const [checkIn, setCheckIn] = useState(iso(new Date(today.getTime() + 7 * 86400_000)));
  const [checkOut, setCheckOut] = useState(iso(new Date(today.getTime() + 9 * 86400_000)));
  const [beds, setBeds] = useState("1");
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [food, setFood] = useState(false);
  const [laundry, setLaundry] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [useDraft, setUseDraft] = useState(Boolean(draft));
  const [q, setQ] = useState<QuoteOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const out = await apiFetch<QuoteOut>("/api/admin/pricing/preview", {
        method: "POST",
        json: { roomId: room.id, unit, beds: Number(beds) || 1, checkIn, checkOut, adults: Number(adults) || 1, children: Number(children) || 0, services: [...(food ? ["FOOD"] : []), ...(laundry ? ["LAUNDRY"] : [])], couponCode: coupon || null, draftPlan: useDraft && draft ? draft : null },
      });
      setQ(out);
    } catch (e) {
      setQ(null);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Calculator className="h-4 w-4" /> Live price preview
      </h4>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <Label htmlFor={`pv-u-${room.id}`} className="text-xs">
            Unit
          </Label>
          <Select id={`pv-u-${room.id}`} value={unit} onChange={(e) => setUnit(e.target.value as "BED" | "ROOM")} className="h-9">
            <option value="BED" disabled={!room.allowBedBooking}>
              Bed(s)
            </option>
            <option value="ROOM" disabled={!room.allowEntireRoomBooking}>
              Entire room
            </option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`pv-ci-${room.id}`} className="text-xs">
            Check-in
          </Label>
          <Input id={`pv-ci-${room.id}`} type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label htmlFor={`pv-co-${room.id}`} className="text-xs">
            Check-out
          </Label>
          <Input id={`pv-co-${room.id}`} type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="h-9" />
        </div>
        {unit === "BED" && (
          <div>
            <Label htmlFor={`pv-b-${room.id}`} className="text-xs">
              Beds
            </Label>
            <Input id={`pv-b-${room.id}`} type="number" min={1} max={room.totalBeds} value={beds} onChange={(e) => setBeds(e.target.value)} className="h-9" />
          </div>
        )}
        <div>
          <Label htmlFor={`pv-a-${room.id}`} className="text-xs">
            Adults
          </Label>
          <Input id={`pv-a-${room.id}`} type="number" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label htmlFor={`pv-c-${room.id}`} className="text-xs">
            Children
          </Label>
          <Input id={`pv-c-${room.id}`} type="number" min={0} value={children} onChange={(e) => setChildren(e.target.value)} className="h-9" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={food} onChange={(e) => setFood(e.target.checked)} /> Food
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={laundry} onChange={(e) => setLaundry(e.target.checked)} /> Laundry
        </label>
        <div>
          <Label htmlFor={`pv-cp-${room.id}`} className="text-xs">
            Coupon
          </Label>
          <Input id={`pv-cp-${room.id}`} value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className="h-9 w-36" placeholder="Optional" />
        </div>
        {draft && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={useDraft} onChange={(e) => setUseDraft(e.target.checked)} /> Use unsaved values from the editor
          </label>
        )}
        <Button size="sm" onClick={run} loading={busy} className="ml-auto">
          Calculate
        </Button>
      </div>
      {err && (
        <div className="mt-3">
          <Alert tone="error">{err}</Alert>
        </div>
      )}
      {q && (
        <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="mb-2 text-xs text-slate-500">
            {q.nights} night{q.nights > 1 ? "s" : ""} · tier: {q.tierLabel}
            {q.appliedRules.length > 0 && ` · rules: ${q.appliedRules.join(", ")}`}
          </p>
          <dl className="space-y-1.5 text-sm">
            {q.lines.map((l) => (
              <div key={l.key} className={cn("flex justify-between gap-4", l.kind === "discount" && "text-emerald-700", l.kind === "info" && "text-slate-500")}>
                <dt>{l.label}</dt>
                <dd className="tabular-nums">{formatINR(l.amount, { exact: true })}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <dt>Total payable</dt>
              <dd className="tabular-nums">{formatINR(q.totalAmount, { exact: true })}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
