"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { BedDouble, Sparkles, Snowflake, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button, EmptyState, Select, StatusBadge } from "@/components/ui";
import { call, useAction } from "@/components/owner/common";
import { humanize } from "@/components/owner/format";

/** Property selector that writes ?p= to the URL (keeps other params). */
export function PropertyPicker({ properties, value, allowAll = false }: { properties: { id: string; name: string }[]; value: string; allowAll?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  if (properties.length <= 1 && !allowAll) return properties[0] ? <p className="text-sm font-medium text-slate-700">{properties[0].name}</p> : null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="prop-pick" className="text-sm text-slate-600">
        Property
      </label>
      <Select
        id="prop-pick"
        value={value}
        className="min-w-56"
        onChange={(e) => {
          const q = new URLSearchParams(sp.toString());
          if (e.target.value) q.set("p", e.target.value);
          else q.delete("p");
          router.push(`${pathname}?${q.toString()}`);
        }}
      >
        {allowAll && <option value="">All my properties</option>}
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export type BoardRoom = {
  id: string;
  roomNumber: string;
  name: string | null;
  floor: string | null;
  category: string;
  isAC: boolean;
  cleaningStatus: string;
  maintenanceStatus: string;
  beds: { id: string; bedNumber: string; code: string; status: string; bedType: string; guest: string | null; bookedTonight: boolean; blockedTonight: boolean }[];
};

const BED_TONE: Record<string, string> = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-900",
  OCCUPIED: "border-sky-200 bg-sky-50 text-sky-900",
  RESERVED: "border-violet-200 bg-violet-50 text-violet-900",
  CLEANING: "border-amber-200 bg-amber-50 text-amber-900",
  BLOCKED: "border-slate-300 bg-slate-100 text-slate-700",
};

export function RoomsBoard({ rooms }: { rooms: BoardRoom[] }) {
  const { run, pending } = useAction();
  const [filter, setFilter] = useState<"ALL" | "CLEANING" | "FREE" | "OCCUPIED">("ALL");
  if (!rooms.length) return <EmptyState icon={<BedDouble className="h-6 w-6" />} title="No rooms" description="This property has no active rooms yet." />;
  const shown = rooms.filter((r) => filter === "ALL" || (filter === "CLEANING" ? r.cleaningStatus !== "CLEAN" || r.beds.some((b) => b.status === "CLEANING") : filter === "FREE" ? r.beds.some((b) => b.status === "AVAILABLE" && !b.bookedTonight && !b.blockedTonight) : r.beds.some((b) => b.status === "OCCUPIED")));
  const counts = rooms.flatMap((r) => r.beds).reduce<Record<string, number>>((a, b) => ((a[b.status] = (a[b.status] ?? 0) + 1), a), {});
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-xl border border-slate-300 bg-white p-0.5" role="group" aria-label="Filter rooms">
          {(
            [
              ["ALL", "All rooms"],
              ["CLEANING", "Needs cleaning"],
              ["FREE", "Free beds"],
              ["OCCUPIED", "Occupied"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={filter === k ? "rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white" : "rounded-lg px-3 py-1.5 text-sm text-slate-600"}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(counts).map(([s, n]) => (
            <span key={s} className={cn("rounded-full border px-2 py-0.5", BED_TONE[s])}>
              {humanize(s)}: {n}
            </span>
          ))}
        </div>
      </div>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => (
          <li key={r.id} className={cn("card flex flex-col", r.maintenanceStatus === "UNDER_MAINTENANCE" && "border-red-200")}>
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="font-semibold">
                  Room {r.roomNumber} {r.isAC && <Snowflake className="inline h-3.5 w-3.5 text-sky-600" aria-label="AC" />}
                </p>
                <p className="text-xs text-slate-500">
                  {[r.floor, humanize(r.category), r.name].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={r.cleaningStatus} />
                {r.maintenanceStatus !== "OK" && (
                  <Badge tone="red">
                    <Wrench className="h-3 w-3" /> Maintenance
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              {r.beds.map((b) => (
                <div key={b.id} className={cn("rounded-xl border p-2 text-xs", BED_TONE[b.status] ?? BED_TONE.AVAILABLE)}>
                  <p className="flex items-center justify-between font-semibold">
                    Bed {b.bedNumber} <span className="font-normal">{humanize(b.status)}</span>
                  </p>
                  <p className="truncate opacity-80">{b.guest ?? (b.bookedTonight ? "Booked tonight" : b.blockedTonight ? "Blocked tonight" : humanize(b.bedType))}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {b.status === "CLEANING" && (
                      <button type="button" disabled={pending === b.id} onClick={() => run(b.id, () => call(`/api/staff/beds/${b.id}`, "POST", { action: "clean" }), { success: `Bed ${b.code} is clean` })} className="rounded-md bg-white/80 px-1.5 py-0.5 font-medium text-emerald-700 hover:bg-white">
                        Mark clean
                      </button>
                    )}
                    {b.status === "AVAILABLE" && !b.bookedTonight && !b.blockedTonight && (
                      <button type="button" disabled={pending === b.id} onClick={() => run(b.id, () => call(`/api/staff/beds/${b.id}`, "POST", { action: "occupied" }), { success: "Marked occupied" })} className="rounded-md bg-white/80 px-1.5 py-0.5 font-medium text-sky-700 hover:bg-white">
                        Occupied
                      </button>
                    )}
                    {b.status === "AVAILABLE" && (
                      <button type="button" disabled={pending === b.id} onClick={() => run(b.id, () => call(`/api/staff/beds/${b.id}`, "POST", { action: "cleaning" }), { success: "Marked for cleaning" })} className="rounded-md bg-white/80 px-1.5 py-0.5 font-medium text-amber-700 hover:bg-white">
                        Needs cleaning
                      </button>
                    )}
                    {["OCCUPIED", "BLOCKED", "RESERVED"].includes(b.status) && !b.guest && (
                      <button type="button" disabled={pending === b.id} onClick={() => run(b.id, () => call(`/api/staff/beds/${b.id}`, "POST", { action: "available" }), { success: "Marked available" })} className="rounded-md bg-white/80 px-1.5 py-0.5 font-medium text-emerald-700 hover:bg-white">
                        Available
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2">
              {r.cleaningStatus !== "CLEAN" && (
                <Button size="sm" variant="secondary" loading={pending === `c-${r.id}`} onClick={() => run(`c-${r.id}`, () => call(`/api/staff/rooms/${r.id}/cleaning`, "POST", { status: "CLEAN" }), { success: `Room ${r.roomNumber} is clean` })}>
                  <Sparkles className="h-4 w-4" /> Room clean
                </Button>
              )}
              {r.cleaningStatus === "NEEDS_CLEANING" && (
                <Button size="sm" variant="ghost" loading={pending === `i-${r.id}`} onClick={() => run(`i-${r.id}`, () => call(`/api/staff/rooms/${r.id}/cleaning`, "POST", { status: "IN_PROGRESS" }), { success: "Cleaning started" })}>
                  Start cleaning
                </Button>
              )}
              {r.cleaningStatus === "CLEAN" && (
                <Button size="sm" variant="ghost" loading={pending === `n-${r.id}`} onClick={() => run(`n-${r.id}`, () => call(`/api/staff/rooms/${r.id}/cleaning`, "POST", { status: "NEEDS_CLEANING" }), { success: "Marked for cleaning" })}>
                  Needs cleaning
                </Button>
              )}
              {r.maintenanceStatus === "UNDER_MAINTENANCE" && (
                <Button size="sm" variant="ghost" className="text-emerald-700" loading={pending === `m-${r.id}`} onClick={() => run(`m-${r.id}`, () => call(`/api/staff/rooms/${r.id}/maintenance`, "POST", { status: "OK" }), { success: "Room back in service" })}>
                  Back in service
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
