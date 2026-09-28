"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarDays, LocateFixed, Loader2, Search, SlidersHorizontal, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

type Params = Record<string, string | undefined>;

const FACILITIES = [
  { key: "WIFI", label: "Wi-Fi" },
  { key: "FOOD", label: "Food included" },
  { key: "ATTACHED_BATH", label: "Attached bathroom" },
  { key: "PARKING", label: "Parking" },
  { key: "LAUNDRY", label: "Laundry" },
  { key: "KITCHEN", label: "Kitchen" },
];

function useNav(current: Params) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const set = (patch: Params) => {
    const next: Params = { ...current, ...patch, page: undefined };
    const sp = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    start(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  };
  return { set, pending };
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition", active ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300")}>
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-slate-100 py-4 last:border-0">
      <legend className="mb-2 text-sm font-semibold text-slate-900">{title}</legend>
      {children}
    </fieldset>
  );
}

export function FilterPanel({ params, propertyTypes, onDone }: { params: Params; propertyTypes: { key: string; name: string }[]; onDone?: () => void }) {
  const { set, pending } = useNav(params);
  const [minP, setMinP] = useState(params.minPrice ?? "");
  const [maxP, setMaxP] = useState(params.maxPrice ?? "");
  useEffect(() => {
    setMinP(params.minPrice ?? "");
    setMaxP(params.maxPrice ?? "");
  }, [params.minPrice, params.maxPrice]);
  const facs = new Set((params.facilities ?? "").split(",").filter(Boolean));
  const toggleFac = (k: string) => {
    const n = new Set(facs);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    set({ facilities: [...n].join(",") || undefined });
  };
  const activeCount = ["type", "ac", "sharing", "gender", "facilities", "minPrice", "maxPrice", "rating", "ptype", "minStay", "instant", "refundable", "stay", "audience"].filter((k) => params[k]).length;

  return (
    <div className="relative">
      <div className="flex items-center justify-between pb-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters {activeCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeCount}</span>}
        </h2>
        <div className="flex items-center gap-2">
          {pending && <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-label="Updating results" />}
          {activeCount > 0 && (
            <button
              type="button"
              className="text-sm font-medium text-brand-700 hover:underline"
              onClick={() => set({ type: undefined, ac: undefined, sharing: undefined, gender: undefined, facilities: undefined, minPrice: undefined, maxPrice: undefined, rating: undefined, ptype: undefined, minStay: undefined, instant: undefined, refundable: undefined, stay: undefined, audience: undefined })}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <Group title="Stay length">
        <div className="flex flex-wrap gap-2">
          <Chip active={!params.stay} onClick={() => set({ stay: undefined })}>Any</Chip>
          <Chip active={params.stay === "nightly"} onClick={() => set({ stay: "nightly" })}>Nightly</Chip>
          <Chip active={params.stay === "monthly"} onClick={() => set({ stay: "monthly" })}>Monthly</Chip>
        </div>
      </Group>

      <Group title={params.stay === "monthly" ? "Monthly budget (₹)" : "Price per night (₹)"}>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            set({ minPrice: minP || undefined, maxPrice: maxP || undefined });
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Minimum price</span>
            <input inputMode="numeric" pattern="[0-9]*" value={minP} onChange={(e) => setMinP(e.target.value.replace(/\D/g, ""))} placeholder="Min" className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
          </label>
          <span className="text-slate-400">–</span>
          <label className="flex-1">
            <span className="sr-only">Maximum price</span>
            <input inputMode="numeric" pattern="[0-9]*" value={maxP} onChange={(e) => setMaxP(e.target.value.replace(/\D/g, ""))} placeholder="Max" className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white">Go</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(params.stay === "monthly" ? [["", "5000"], ["5000", "10000"], ["10000", "20000"], ["20000", ""]] : [["", "500"], ["500", "1000"], ["1000", "2500"], ["2500", ""]]).map(([a, b]) => (
            <Chip key={`${a}-${b}`} active={(params.minPrice ?? "") === a && (params.maxPrice ?? "") === b} onClick={() => set({ minPrice: a || undefined, maxPrice: b || undefined })}>
              {a && b ? `₹${Number(a).toLocaleString("en-IN")}–${Number(b).toLocaleString("en-IN")}` : a ? `₹${Number(a).toLocaleString("en-IN")}+` : `Under ₹${Number(b).toLocaleString("en-IN")}`}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Room type">
        <div className="flex flex-wrap gap-2">
          {[
            ["", "Any"],
            ["PRIVATE", "Private"],
            ["SHARED", "Shared"],
            ["FAMILY", "Family"],
          ].map(([v, l]) => (
            <Chip key={v} active={(params.type ?? "") === v} onClick={() => set({ type: v || undefined })}>
              {l}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Air conditioning">
        <div className="flex flex-wrap gap-2">
          {[
            ["", "Any"],
            ["1", "AC"],
            ["0", "Non-AC"],
          ].map(([v, l]) => (
            <Chip key={v} active={(params.ac ?? "") === v} onClick={() => set({ ac: v || undefined })}>
              {l}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Sharing">
        <div className="flex flex-wrap gap-2">
          <Chip active={!params.sharing} onClick={() => set({ sharing: undefined })}>Any</Chip>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Chip key={n} active={params.sharing === String(n)} onClick={() => set({ sharing: String(n) })}>
              {n === 1 ? "Single" : n === 6 ? "6+" : `${n}-sharing`}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Who can stay">
        <div className="flex flex-wrap gap-2">
          {[
            ["", "Anyone"],
            ["MALE_ONLY", "Men only"],
            ["FEMALE_ONLY", "Women only"],
            ["MIXED", "Co-ed"],
            ["FAMILY", "Family"],
          ].map(([v, l]) => (
            <Chip key={v} active={(params.gender ?? "") === v} onClick={() => set({ gender: v || undefined })}>
              {l}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Amenities">
        <div className="grid grid-cols-2 gap-2">
          {FACILITIES.map((f) => (
            <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={facs.has(f.key)} onChange={() => toggleFac(f.key)} className="h-4 w-4 accent-brand-600" />
              {f.label}
            </label>
          ))}
        </div>
      </Group>

      <Group title="Guest rating">
        <div className="flex flex-wrap gap-2">
          {[
            ["", "Any"],
            ["3", "3+"],
            ["3.5", "3.5+"],
            ["4", "4+"],
            ["4.5", "4.5+"],
          ].map(([v, l]) => (
            <Chip key={v} active={(params.rating ?? "") === v} onClick={() => set({ rating: v || undefined })}>
              {l}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Property type">
        <select value={params.ptype ?? ""} onChange={(e) => set({ ptype: e.target.value || undefined })} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" aria-label="Property type">
          <option value="">All property types</option>
          {propertyTypes.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </Group>

      <Group title="Minimum stay">
        <select value={params.minStay ?? ""} onChange={(e) => set({ minStay: e.target.value || undefined })} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" aria-label="Minimum stay">
          <option value="">Any minimum stay</option>
          <option value="1">Allows 1-night stays</option>
          <option value="7">Minimum stay up to 1 week</option>
          <option value="30">Minimum stay up to 1 month</option>
        </select>
      </Group>

      <Group title="Booking">
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={params.instant === "1"} onChange={(e) => set({ instant: e.target.checked ? "1" : undefined })} className="h-4 w-4 accent-brand-600" /> Instant booking
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={params.refundable === "1"} onChange={(e) => set({ refundable: e.target.checked ? "1" : undefined })} className="h-4 w-4 accent-brand-600" /> Refundable only
          </label>
        </div>
      </Group>

      <Group title="Best for">
        <div className="flex flex-wrap gap-2">
          {[
            ["", "Everyone"],
            ["STUDENTS", "Students"],
            ["WORKING_PROFESSIONALS", "Professionals"],
            ["FAMILIES", "Families"],
            ["TRAVELLERS", "Travellers"],
          ].map(([v, l]) => (
            <Chip key={v} active={(params.audience ?? "") === v} onClick={() => set({ audience: v || undefined })}>
              {l}
            </Chip>
          ))}
        </div>
      </Group>

      {onDone && (
        <div className="pb-safe sticky bottom-0 -mx-4 border-t border-slate-200 bg-white px-4 py-3">
          <button type="button" onClick={onDone} className="h-11 w-full rounded-xl bg-brand-600 font-semibold text-white">
            Show results
          </button>
        </div>
      )}
    </div>
  );
}

export function MobileFilterButton({ params, propertyTypes }: { params: Params; propertyTypes: { key: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium lg:hidden">
        <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white px-4 pt-3">
            <div className="flex justify-end">
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close filters">
                <X className="h-5 w-5" />
              </button>
            </div>
            <FilterPanel params={params} propertyTypes={propertyTypes} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

export function SortSelect({ params }: { params: Params }) {
  const { set } = useNav(params);
  const hasGeo = Boolean(params.lat && params.lng);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-slate-500 sm:inline">Sort by</span>
      <select value={params.sort ?? (hasGeo ? "nearest" : "recommended")} onChange={(e) => set({ sort: e.target.value })} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium" aria-label="Sort results">
        <option value="recommended">Recommended</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="rating">Top rated</option>
        <option value="popular">Most popular</option>
        <option value="newest">Recently added</option>
        <option value="nearest" disabled={!hasGeo}>
          Nearest {hasGeo ? "" : "(use Near me)"}
        </option>
      </select>
    </label>
  );
}

/** Compact search bar at the top of results: text, dates, guests, near me. */
export function SearchBar({ params }: { params: Params }) {
  const { set, pending } = useNav(params);
  const [q, setQ] = useState(params.q ?? "");
  const [checkIn, setCheckIn] = useState(params.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(params.checkOut ?? "");
  const [guests, setGuests] = useState(params.guests ?? "1");
  const [locating, setLocating] = useState(false);
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  function nearMe() {
    if (!("geolocation" in navigator)) return toast.error("Location is not available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        set({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5), sort: "nearest", city: undefined });
      },
      () => {
        setLocating(false);
        toast.error("Location permission denied. Type a city or area instead.");
      },
      { timeout: 10000 },
    );
  }
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (checkIn && checkOut && checkOut <= checkIn) return toast.error("Check-out must be after check-in");
        set({ q: q.trim() || undefined, checkIn: checkIn || undefined, checkOut: checkOut || undefined, guests: guests !== "1" ? guests : undefined });
      }}
      className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-[1.5fr_1fr_1fr_auto_auto]"
    >
      <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3">
        <Search className="h-4 w-4 text-slate-400" aria-hidden />
        <span className="sr-only">Search</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Locality, landmark or property" className="h-11 w-full bg-transparent text-sm outline-none" />
        <button type="button" onClick={nearMe} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700" aria-label="Near me">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" aria-hidden />}
          <span className="hidden md:inline">Near me</span>
        </button>
      </label>
      <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3">
        <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden />
        <span className="sr-only">Check-in</span>
        <input type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="h-11 w-full bg-transparent text-sm outline-none" aria-label="Check-in date" />
      </label>
      <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3">
        <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden />
        <span className="sr-only">Check-out</span>
        <input type="date" min={checkIn || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="h-11 w-full bg-transparent text-sm outline-none" aria-label="Check-out date" />
      </label>
      <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3">
        <Users className="h-4 w-4 text-slate-400" aria-hidden />
        <span className="sr-only">Guests</span>
        <select value={guests} onChange={(e) => setGuests(e.target.value)} className="h-11 bg-transparent text-sm outline-none" aria-label="Guests">
          {Array.from({ length: 8 }, (_, i) => String(i + 1)).map((n) => (
            <option key={n} value={n}>
              {n} guest{n !== "1" ? "s" : ""}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-70">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" aria-hidden />} Search
      </button>
    </form>
  );
}
