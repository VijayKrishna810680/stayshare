"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BedDouble, CalendarDays, LocateFixed, MapPin, Search, Snowflake, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

function today(offset = 0) {
  const d = new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000);
  return d.toISOString().slice(0, 10);
}

const TYPES = [
  { value: "", label: "Any" },
  { value: "PRIVATE", label: "Private room" },
  { value: "SHARED", label: "Shared bed" },
  { value: "FAMILY", label: "Family room" },
];

/** Hero search: text (city/locality/landmark/property), dates, guests, sharing type and AC toggle. */
export function HeroSearch({ cities }: { cities: { name: string; slug: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [type, setType] = useState("");
  const [ac, setAc] = useState<"" | "1" | "0">("");
  const [locating, setLocating] = useState(false);

  function go(extra: Record<string, string> = {}) {
    const sp = new URLSearchParams();
    const text = q.trim();
    const city = cities.find((c) => c.name.toLowerCase() === text.toLowerCase() || c.slug === text.toLowerCase());
    if (city) sp.set("city", city.slug);
    else if (text) sp.set("q", text);
    if (checkIn) sp.set("checkIn", checkIn);
    if (checkOut) sp.set("checkOut", checkOut);
    if (guests > 1) sp.set("guests", String(guests));
    if (type) sp.set("type", type);
    if (ac) sp.set("ac", ac);
    for (const [k, v] of Object.entries(extra)) sp.set(k, v);
    router.push(`/search?${sp.toString()}`);
  }

  function nearMe() {
    if (!("geolocation" in navigator)) return toast.error("Location is not available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        go({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5), sort: "nearest" });
      },
      () => {
        setLocating(false);
        toast.error("We couldn't get your location. Please allow location access or type a city.");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (checkIn && checkOut && checkOut <= checkIn) return toast.error("Check-out must be after check-in");
        go();
      }}
      className="rounded-3xl bg-white p-3 text-slate-900 shadow-2xl shadow-brand-950/20 ring-1 ring-slate-200 sm:p-4"
      role="search"
      aria-label="Search stays"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Sharing type">
        {TYPES.map((t) => (
          <button
            type="button"
            key={t.value}
            role="radio"
            aria-checked={type === t.value}
            onClick={() => setType(t.value)}
            className={cn("rounded-full px-3 py-1.5 text-sm font-medium transition", type === t.value ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />
        <div className="flex items-center gap-1 rounded-full bg-slate-100 p-0.5" role="radiogroup" aria-label="Air conditioning">
          {[
            { v: "" as const, l: "AC / Non-AC" },
            { v: "1" as const, l: "AC" },
            { v: "0" as const, l: "Non-AC" },
          ].map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={ac === o.v} onClick={() => setAc(o.v)} className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium", ac === o.v ? "bg-white text-brand-700 shadow-sm" : "text-slate-600")}>
              {o.v === "1" && <Snowflake className="h-3.5 w-3.5" aria-hidden />}
              {o.l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-[1.6fr_1fr_1fr_0.7fr_auto]">
        <label className="relative flex items-center rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-brand-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-100">
          <MapPin className="ml-3 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <span className="sr-only">City, locality, landmark or property</span>
          <input list="ss-cities" value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, locality, landmark or property" className="h-14 w-full bg-transparent px-3 text-sm outline-none placeholder:text-slate-400" />
          <datalist id="ss-cities">
            {cities.map((c) => (
              <option key={c.slug} value={c.name} />
            ))}
          </datalist>
          <button type="button" onClick={nearMe} disabled={locating} className="mr-2 inline-flex shrink-0 items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60" aria-label="Search near me">
            <LocateFixed className={cn("h-4 w-4", locating && "animate-pulse")} aria-hidden />
            <span className="hidden sm:inline">Near me</span>
          </button>
        </label>
        <label className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-brand-400 focus-within:bg-white">
          <CalendarDays className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <span className="ml-2 flex flex-1 flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Check-in</span>
            <input type="date" min={today()} value={checkIn} onChange={(e) => (setCheckIn(e.target.value), checkOut && e.target.value >= checkOut && setCheckOut(""))} className="bg-transparent text-sm outline-none" />
          </span>
        </label>
        <label className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-brand-400 focus-within:bg-white">
          <CalendarDays className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <span className="ml-2 flex flex-1 flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Check-out</span>
            <input type="date" min={checkIn || today(1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="bg-transparent text-sm outline-none" />
          </span>
        </label>
        <label className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-brand-400 focus-within:bg-white">
          <Users className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <span className="ml-2 flex flex-1 flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Guests</span>
            <select value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="bg-transparent text-sm outline-none">
              {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} guest{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </span>
        </label>
        <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent-500 px-6 text-base font-semibold text-white shadow-sm hover:bg-accent-600">
          <Search className="h-5 w-5" aria-hidden /> Search
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1 px-1 text-xs text-slate-500">
        <BedDouble className="h-3.5 w-3.5" aria-hidden /> Book a single bed, a private room or an entire family room — nightly or monthly.
      </p>
    </form>
  );
}
