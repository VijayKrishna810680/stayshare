"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bath, BedDouble, BedSingle, CalendarDays, ChevronRight, Loader2, Minus, Plus, Snowflake, Users, UtensilsCrossed, WashingMachine, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { CATEGORY_LABEL, GENDER_LABEL } from "@/lib/site/labels";
import type { PublicRoom } from "@/lib/site/property";
import { Img } from "@/components/ui/img";
import { PriceBreakdown, type Line } from "./price-breakdown";

type Avail = { roomId: string; totalBeds: number; availableBeds: number; availableBedIds: string[]; entireRoomAvailable: boolean };
type Quote = { lines: Line[]; totalAmount: number; payableExDeposit: number; securityDeposit: number; nights: number; tierLabel: string; nonRefundable: boolean; baseNightlyPerUnit: number; units: number };
export type Bed = { id: string; bedNumber: string; bedType: string; free: boolean | null };

function istToday(offset = 0) {
  return new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
}
function addDays(s: string, n: number) {
  return new Date(new Date(s + "T00:00:00Z").getTime() + n * 86400_000).toISOString().slice(0, 10);
}
function nights(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400_000);
}

function Stepper({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="grid h-8 w-8 place-items-center rounded-full border border-slate-300 text-slate-700 disabled:opacity-40" aria-label={`Decrease ${label}`}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="grid h-8 w-8 place-items-center rounded-full border border-slate-300 text-slate-700 disabled:opacity-40" aria-label={`Increase ${label}`}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function roomPriceSummary(r: PublicRoom) {
  const nightly = r.allowBedBooking && r.plan.nightlyBed ? { amt: r.plan.nightlyBed, per: "bed / night" } : r.plan.nightlyRoom ? { amt: r.plan.nightlyRoom, per: "room / night" } : r.plan.nightlyBed ? { amt: r.plan.nightlyBed, per: "bed / night" } : null;
  const monthly = r.allowBedBooking && r.plan.monthlyBed ? { amt: r.plan.monthlyBed, per: "bed / month" } : r.plan.monthlyRoom ? { amt: r.plan.monthlyRoom, per: "room / month" } : r.plan.monthlyBed ? { amt: r.plan.monthlyBed, per: "bed / month" } : null;
  return { nightly, monthly };
}

export function RoomCard({ r, selected, onSelect, slug, query, hasDates }: { r: PublicRoom; selected: boolean; onSelect: () => void; slug: string; query: string; hasDates: boolean }) {
  const a = r.availability;
  const soldOut = hasDates && a !== null && a.availableBeds === 0;
  const { nightly, monthly } = roomPriceSummary(r);
  return (
    <article className={cn("flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition sm:flex-row", selected ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-200")}>
      <div className="relative aspect-[16/10] w-full shrink-0 bg-slate-100 sm:aspect-auto sm:w-56">
        <Img src={r.images[0]} alt={`${r.name ?? CATEGORY_LABEL[r.category]} photo`} className="h-full w-full" />
        {r.images.length > 1 && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">+{r.images.length - 1} photos</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">{r.name ?? `${CATEGORY_LABEL[r.category]} · Room ${r.roomNumber}`}</h3>
            <p className="text-xs text-slate-500">
              Room {r.roomNumber} · {CATEGORY_LABEL[r.category]} · {r.sharingCapacity === 1 ? "Single occupancy" : `${r.sharingCapacity}-sharing`}
            </p>
          </div>
          {hasDates && a && (
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", soldOut ? "bg-red-50 text-red-700" : a.availableBeds <= 2 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
              {soldOut ? "Fully booked" : r.totalBeds === 1 ? "Available" : `${a.availableBeds} of ${a.totalBeds} beds free`}
            </span>
          )}
        </div>
        <ul className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-700">
          <li className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", r.isAC ? "bg-sky-50 text-sky-700" : "bg-slate-100")}>
            <Snowflake className="h-3 w-3" aria-hidden /> {r.isAC ? "AC" : "Non-AC"}
          </li>
          <li className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
            <Bath className="h-3 w-3" aria-hidden /> {r.bathroom === "ATTACHED" ? "Attached bath" : "Common bath"}
          </li>
          <li className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
            <Users className="h-3 w-3" aria-hidden /> Up to {r.maxOccupancy}
          </li>
          <li className="rounded-full bg-slate-100 px-2 py-0.5">{GENDER_LABEL[r.gender] ?? r.gender}</li>
          {r.furnishing !== "FURNISHED" && <li className="rounded-full bg-slate-100 px-2 py-0.5">{r.furnishing === "SEMI_FURNISHED" ? "Semi-furnished" : "Unfurnished"}</li>}
          {r.facilities.slice(0, 4).map((f) => (
            <li key={f.key} className="rounded-full bg-slate-100 px-2 py-0.5">
              {f.name}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
          <div>
            {nightly && (
              <p>
                <span className="text-lg font-bold tabular-nums">{formatINR(nightly.amt)}</span> <span className="text-xs text-slate-500">/{nightly.per}</span>
              </p>
            )}
            {monthly && (
              <p className="text-sm font-medium text-brand-700">
                {formatINR(monthly.amt)} <span className="text-xs font-normal text-slate-500">/{monthly.per}</span>
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              {r.allowBedBooking && r.allowEntireRoomBooking ? "Book a bed or the entire room" : r.allowBedBooking ? "Per-bed booking" : "Entire room only"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/property/${slug}/room/${r.id}${query ? `?${query}` : ""}`} className="inline-flex items-center text-sm font-medium text-brand-700 hover:underline">
              Beds & details <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <button type="button" onClick={onSelect} disabled={soldOut} aria-pressed={selected} className={cn("h-9 rounded-xl px-4 text-sm font-semibold", selected ? "bg-brand-600 text-white" : "border border-brand-600 text-brand-700 hover:bg-brand-50", soldOut && "cursor-not-allowed border-slate-300 text-slate-400")}>
              {soldOut ? "Sold out" : selected ? "Selected" : "Select"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

type Props = {
  slug: string;
  minStay: number;
  maxStay: number;
  checkInTime: string;
  checkOutTime: string;
  rooms: PublicRoom[];
  initial: { checkIn?: string; checkOut?: string; guests?: number; roomId?: string; unit?: "BED" | "ROOM" };
  /** Room page: bed map & single room */
  singleRoom?: boolean;
  beds?: Bed[];
  overview?: React.ReactNode;
  details?: React.ReactNode;
};

/** Property page booking experience: room list + sticky booking panel with a live server quote. */
export function BookingExperience(props: Props) {
  const { slug, rooms: initialRooms, minStay, maxStay, initial, singleRoom } = props;
  const defIn = initial.checkIn && initial.checkIn >= istToday() ? initial.checkIn : istToday(1);
  const defOut = initial.checkOut && initial.checkOut > defIn ? initial.checkOut : addDays(defIn, Math.max(1, minStay));
  const [checkIn, setCheckIn] = useState(defIn);
  const [checkOut, setCheckOut] = useState(defOut);
  const [adults, setAdults] = useState(Math.max(1, initial.guests ?? 1));
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(initialRooms);
  const [beds, setBeds] = useState<Bed[] | undefined>(props.beds);
  const [roomId, setRoomId] = useState<string | null>(initial.roomId ?? (singleRoom ? (initialRooms[0]?.id ?? null) : null));
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const [unit, setUnit] = useState<"BED" | "ROOM">(initial.unit ?? "BED");
  const [bedsCount, setBedsCount] = useState(1);
  const [bedIds, setBedIds] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [availLoading, setAvailLoading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const datesValid = checkIn >= istToday() && checkOut > checkIn;
  const n = datesValid ? nights(checkIn, checkOut) : 0;

  // effective unit given room capabilities
  const effUnit: "BED" | "ROOM" = room ? (room.allowBedBooking && room.allowEntireRoomBooking ? unit : room.allowBedBooking ? "BED" : "ROOM") : unit;
  const avail = room?.availability ?? null;
  const maxBeds = room ? Math.max(1, avail ? avail.availableBeds : room.totalBeds) : 1;
  const effBeds = effUnit === "BED" ? (bedIds.length ? bedIds.length : Math.max(bedsCount, adults)) : room?.totalBeds ?? 1;

  // refresh availability (and bed map) when dates change
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current && initial.checkIn === checkIn && initial.checkOut === checkOut) {
      firstRun.current = false;
      return;
    }
    firstRun.current = false;
    if (!datesValid) return;
    let cancel = false;
    setAvailLoading(true);
    const q = new URLSearchParams({ checkIn, checkOut, ...(singleRoom && roomId ? { roomId } : {}) });
    apiFetch<{ property: { rooms: PublicRoom[] }; beds?: Bed[] }>(`/api/properties/${slug}?${q}`)
      .then((d) => {
        if (cancel) return;
        setRooms(singleRoom ? d.property.rooms.filter((r) => r.id === roomId) : d.property.rooms);
        if (d.beds) {
          setBeds(d.beds);
          setBedIds((ids) => ids.filter((id) => d.beds!.find((b) => b.id === id)?.free));
        }
      })
      .catch(() => {})
      .finally(() => !cancel && setAvailLoading(false));
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut]);

  // live quote
  const reqKey = JSON.stringify({ roomId, effUnit, effBeds, bedIds, checkIn, checkOut, adults, children, services });
  const runQuote = useCallback(async () => {
    if (!room || !datesValid) {
      setQuote(null);
      setQuoteErr(null);
      return;
    }
    setQuoting(true);
    try {
      const d = await apiFetch<{ quote: Quote }>("/api/quote", {
        method: "POST",
        json: { roomId: room.id, unit: effUnit, bedsCount: effBeds, bedIds: effUnit === "BED" && bedIds.length ? bedIds : undefined, checkIn, checkOut, adults, children, services },
      });
      setQuote(d.quote);
      setQuoteErr(null);
    } catch (e) {
      setQuote(null);
      setQuoteErr((e as Error).message);
    } finally {
      setQuoting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);
  useEffect(() => {
    const t = setTimeout(runQuote, 250);
    return () => clearTimeout(t);
  }, [runQuote]);

  const hasFood = Boolean(room && room.plan.foodPerPersonPerDay > 0);
  const hasLaundry = Boolean(room && room.plan.laundryPerMonth > 0);
  useEffect(() => {
    setServices((s) => s.filter((x) => (x === "FOOD" ? hasFood : x === "LAUNDRY" ? hasLaundry : false)));
  }, [hasFood, hasLaundry]);

  const soldOut = Boolean(room && avail && (effUnit === "ROOM" ? !avail.entireRoomAvailable : avail.availableBeds < effBeds));
  const occupancyErr =
    room && effUnit === "ROOM" && adults + children > room.maxOccupancy
      ? `This room allows up to ${room.maxOccupancy} guests`
      : room && effUnit === "BED" && bedIds.length > 0 && bedIds.length < adults
        ? `Select at least ${adults} beds — each adult needs a bed`
        : null;
  const canBook = Boolean(room && datesValid && quote && !soldOut && !occupancyErr && !quoting);

  const checkoutHref = useMemo(() => {
    if (!room) return "#";
    const q = new URLSearchParams({ roomId: room.id, unit: effUnit, beds: String(effBeds), checkIn, checkOut, adults: String(adults), children: String(children) });
    if (services.length) q.set("services", services.join(","));
    if (effUnit === "BED" && bedIds.length) q.set("bedIds", bedIds.join(","));
    return `/checkout?${q.toString()}`;
  }, [room, effUnit, effBeds, checkIn, checkOut, adults, children, services, bedIds]);

  const query = new URLSearchParams({ checkIn, checkOut, guests: String(adults) }).toString();
  const selectRoom = (id: string) => {
    setRoomId(id);
    setBedIds([]);
    const r = rooms.find((x) => x.id === id);
    if (r && !r.allowBedBooking) setUnit("ROOM");
    else if (r && r.allowBedBooking) setUnit("BED");
    if (window.matchMedia("(max-width: 1023px)").matches) setSheet(true);
    else panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const renderPanel = (inSheet?: boolean) => {
    const uid = inSheet ? "bk-sheet" : "bk-side";
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Your stay</p>
          <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-300">
            <label htmlFor={`${uid}-in`} className="border-r border-slate-300 px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Check-in</span>
              <input id={`${uid}-in`} type="date" min={istToday()} value={checkIn} onChange={(e) => {
                const v = e.target.value;
                setCheckIn(v);
                if (v && checkOut <= v) setCheckOut(addDays(v, Math.max(1, minStay)));
              }} className="w-full bg-transparent text-sm outline-none" />
            </label>
            <label htmlFor={`${uid}-out`} className="px-3 py-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Check-out</span>
              <input id={`${uid}-out`} type="date" min={addDays(checkIn || istToday(), 1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full bg-transparent text-sm outline-none" />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              [1, "1 night"],
              [7, "1 week"],
              [30, "1 month"],
              [90, "3 months"],
            ]
              .filter(([d]) => (d as number) >= minStay && (d as number) <= maxStay)
              .map(([d, l]) => (
                <button key={d} type="button" onClick={() => setCheckOut(addDays(checkIn, d as number))} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", n === d ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                  {l}
                </button>
              ))}
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {datesValid ? `${n} night${n > 1 ? "s" : ""}` : "Choose valid dates"} · Check-in {props.checkInTime}, check-out {props.checkOutTime}
            {minStay > 1 && ` · Min ${minStay} nights`}
            {availLoading && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" aria-label="Checking availability" />}
          </p>
        </div>

        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <Stepper label="Adults" value={adults} min={1} max={room ? (effUnit === "BED" ? Math.max(1, maxBeds) : room.maxOccupancy) : 12} onChange={(v) => setAdults(v)} />
          {(!room || effUnit === "ROOM") && <Stepper label="Children" hint="Under 12" value={children} min={0} max={room ? Math.max(0, room.maxOccupancy - adults) : 6} onChange={setChildren} />}
        </div>

        {!room ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Select a room to see the live price for your dates.</p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{room.name ?? `${CATEGORY_LABEL[room.category]} · Room ${room.roomNumber}`}</p>
                  <p className="text-xs text-slate-500">
                    {room.isAC ? "AC" : "Non-AC"} · {room.bathroom === "ATTACHED" ? "Attached bath" : "Common bath"}
                    {avail && ` · ${avail.availableBeds}/${avail.totalBeds} beds free`}
                  </p>
                </div>
                {!singleRoom && (
                  <button type="button" onClick={() => setRoomId(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Clear room selection">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {room.allowBedBooking && room.allowEntireRoomBooking && (
                <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Booking type">
                  <button type="button" role="radio" aria-checked={effUnit === "BED"} onClick={() => setUnit("BED")} className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium", effUnit === "BED" ? "bg-white text-brand-700 shadow-sm" : "text-slate-600")}>
                    <BedSingle className="h-4 w-4" aria-hidden /> Book beds
                  </button>
                  <button type="button" role="radio" aria-checked={effUnit === "ROOM"} onClick={() => (setUnit("ROOM"), setBedIds([]))} className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium", effUnit === "ROOM" ? "bg-white text-brand-700 shadow-sm" : "text-slate-600")}>
                    <BedDouble className="h-4 w-4" aria-hidden /> Entire room
                  </button>
                </div>
              )}
              {effUnit === "BED" && room.totalBeds > 1 && !bedIds.length && (
                <div className="mt-3">
                  <Stepper label="Beds" hint={`${maxBeds} available`} value={Math.max(bedsCount, adults)} min={Math.max(1, adults)} max={maxBeds} onChange={setBedsCount} />
                </div>
              )}
              {effUnit === "BED" && bedIds.length > 0 && beds && (
                <p className="mt-2 text-xs text-slate-600">
                  Selected: {beds.filter((b) => bedIds.includes(b.id)).map((b) => `Bed ${b.bedNumber}`).join(", ")}{" "}
                  <button type="button" className="font-medium text-brand-700 underline" onClick={() => setBedIds([])}>
                    clear
                  </button>
                </p>
              )}
            </div>

            {(hasFood || hasLaundry) && (
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">Add-on services</legend>
                <div className="mt-2 space-y-2">
                  {hasFood && (
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={services.includes("FOOD")} onChange={(e) => setServices((s) => (e.target.checked ? [...s, "FOOD"] : s.filter((x) => x !== "FOOD")))} className="h-4 w-4 accent-brand-600" />
                        <UtensilsCrossed className="h-4 w-4 text-amber-600" aria-hidden /> Meals
                      </span>
                      <span className="text-xs text-slate-500">{formatINR(room.plan.foodPerPersonPerDay)}/person/day</span>
                    </label>
                  )}
                  {hasLaundry && (
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={services.includes("LAUNDRY")} onChange={(e) => setServices((s) => (e.target.checked ? [...s, "LAUNDRY"] : s.filter((x) => x !== "LAUNDRY")))} className="h-4 w-4 accent-brand-600" />
                        <WashingMachine className="h-4 w-4 text-sky-600" aria-hidden /> Laundry
                      </span>
                      <span className="text-xs text-slate-500">{formatINR(room.plan.laundryPerMonth)}/month</span>
                    </label>
                  )}
                </div>
              </fieldset>
            )}

            <div aria-live="polite" className="rounded-xl border border-slate-200 p-3">
              {quoting && !quote ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculating live price…
                </div>
              ) : soldOut ? (
                <p className="text-sm font-medium text-red-600">{effUnit === "ROOM" ? "The entire room isn't available for these dates — try booking beds or other dates." : "Not enough beds free for these dates. Try fewer beds or other dates."}</p>
              ) : occupancyErr ? (
                <p className="text-sm font-medium text-red-600">{occupancyErr}</p>
              ) : quoteErr ? (
                <p className="text-sm font-medium text-red-600">{quoteErr}</p>
              ) : quote ? (
                <div className={cn(quoting && "opacity-60")}>
                  <p className="mb-2 text-xs font-medium text-brand-700">
                    {quote.tierLabel} rate · {formatINR(quote.baseNightlyPerUnit)} per {effUnit === "BED" ? "bed" : "room"}/night
                  </p>
                  <PriceBreakdown lines={quote.lines} total={quote.totalAmount} />
                  {quote.nonRefundable && <p className="mt-2 text-xs font-medium text-amber-700">Non-refundable rate</p>}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Choose valid dates to see the price.</p>
              )}
            </div>
          </>
        )}
        <Link
          href={canBook ? checkoutHref : "#"}
          aria-disabled={!canBook}
          onClick={(e) => {
            if (!canBook) {
              e.preventDefault();
              if (!room) toast.info("Select a room first");
            }
          }}
          className={cn("flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold text-white shadow-sm", canBook ? "bg-accent-500 hover:bg-accent-600" : "cursor-not-allowed bg-slate-300")}
        >
          {quote && canBook ? `Book now · ${formatINR(quote.totalAmount)}` : "Book now"}
        </Link>
        {!inSheet && <p className="text-center text-xs text-slate-500">You won&apos;t be charged yet — review everything at checkout.</p>}
      </div>
    );
  };

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          {props.overview}
          {beds && room && (
            <section aria-labelledby="bedmap-h">
              <h2 id="bedmap-h" className="text-xl font-bold">
                Bed map
              </h2>
              <p className="mt-1 text-sm text-slate-500">{effUnit === "ROOM" ? "You're booking the entire room — all beds are yours." : "Pick specific beds (optional). Grey beds are taken for your dates."}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {beds.map((b) => {
                  const chosen = bedIds.includes(b.id) || effUnit === "ROOM";
                  const free = b.free !== false;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={!free || effUnit === "ROOM" || !room.allowBedBooking}
                      aria-pressed={chosen}
                      onClick={() => setBedIds((ids) => (ids.includes(b.id) ? ids.filter((x) => x !== b.id) : [...ids, b.id]))}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-2xl border-2 p-4 text-sm font-medium transition",
                        !free ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : chosen ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300",
                      )}
                    >
                      <BedSingle className="h-7 w-7" aria-hidden />
                      Bed {b.bedNumber}
                      <span className="text-[11px] font-normal">{!free ? "Taken" : b.free === null ? b.bedType.toLowerCase() : chosen ? "Selected" : "Free"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {!singleRoom && (
            <section id="rooms" aria-labelledby="rooms-h" className="scroll-mt-24">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 id="rooms-h" className="text-xl font-bold">
                  Choose your room
                </h2>
                <p className="text-sm text-slate-500">{datesValid ? `Availability for ${n} night${n > 1 ? "s" : ""}` : "Select dates for live availability"}</p>
              </div>
              {rooms.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No rooms are open for booking right now.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {rooms.map((r) => (
                    <RoomCard key={r.id} r={r} selected={roomId === r.id} onSelect={() => selectRoom(r.id)} slug={slug} query={query} hasDates={datesValid} />
                  ))}
                </div>
              )}
            </section>
          )}
          {props.details}
        </div>
        <aside className="hidden lg:block" aria-label="Booking">
          <div ref={panelRef} className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
            {renderPanel()}
          </div>
        </aside>
      </div>

      {/* mobile sticky bar + sheet */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {quote && room ? (
              <>
                <p className="text-lg font-bold tabular-nums">{formatINR(quote.totalAmount)}</p>
                <p className="truncate text-xs text-slate-500">
                  {n} night{n > 1 ? "s" : ""} · {effUnit === "BED" ? `${effBeds} bed${effBeds > 1 ? "s" : ""}` : "entire room"}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-600">{room ? "Pick dates for a price" : "Select a room to book"}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => (room || singleRoom ? setSheet(true) : document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }))}
            className="h-11 shrink-0 rounded-xl bg-accent-500 px-5 font-semibold text-white"
          >
            {room ? "Review & book" : "See rooms"}
          </button>
        </div>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Book this stay">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSheet(false)} />
          <div className="pb-safe absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">Book your stay</p>
              <button onClick={() => setSheet(false)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderPanel(true)}
          </div>
        </div>
      )}
    </>
  );
}
