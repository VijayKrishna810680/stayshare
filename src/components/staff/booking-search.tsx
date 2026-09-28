"use client";
import { useCallback, useEffect, useState } from "react";
import { QrCode, Search } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { Button, Input, Money, StatusBadge } from "@/components/ui";
import { QrScanner } from "./qr-scanner";

export type LookupRow = { id: string; bookingNumber: string; status: string; checkIn: string; checkOut: string; unit: string; bedsCount: number; guestName: string; guestPhone: string; propertyName: string; roomNumber: string; totalAmount: number; paidAmount: number; balanceDue: number };

/** Search by booking number / phone / name, or scan the booking QR. */
export function BookingSearch({ mode, initialQuery, onPick, quick }: { mode: "checkin" | "checkout"; initialQuery?: string; onPick: (id: string) => void; quick?: LookupRow[] }) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [rows, setRows] = useState<LookupRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);
  const search = useCallback(
    async (query: string) => {
      if (query.trim().length < 3) return toast.error("Enter at least 3 characters");
      setBusy(true);
      try {
        const res = await apiFetch<LookupRow[]>(`/api/staff/bookings/lookup?mode=${mode}&q=${encodeURIComponent(query.trim())}`);
        setRows(res);
        if (res.length === 1) onPick(res[0]!.id);
        if (!res.length) toast.error(mode === "checkin" ? "No confirmed booking found for check-in" : "No checked-in guest found");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      } finally {
        setBusy(false);
      }
    },
    [mode, onPick],
  );
  useEffect(() => {
    if (initialQuery) void search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = rows ?? quick ?? [];
  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <label htmlFor={`bs-${mode}`} className="sr-only">
          Booking number, phone or guest name
        </label>
        <Input id={`bs-${mode}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Booking number (SS-HYD-2026-…), phone or guest name" className="h-12 text-base" />
        <div className="flex gap-2">
          <Button type="submit" size="lg" loading={busy} className="flex-1">
            <Search className="h-4 w-4" /> Find
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={() => setScan(true)} className="flex-1">
            <QrCode className="h-4 w-4" /> Scan QR
          </Button>
        </div>
      </form>
      {list.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{rows ? "Search results" : mode === "checkin" ? "Today's arrivals" : "Guests in house"}</p>
          <ul className="grid gap-2 md:grid-cols-2">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onPick(r.id)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-400 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.guestName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {r.bookingNumber} · {r.guestPhone}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {r.propertyName} · Room {r.roomNumber} · {r.checkIn} → {r.checkOut}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={r.status} />
                      {r.balanceDue > 0 && (
                        <span className="text-xs font-medium text-amber-700">
                          Due <Money paise={r.balanceDue} />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <QrScanner
        open={scan}
        onClose={() => setScan(false)}
        onResult={(t) => {
          setScan(false);
          setQ(t.length > 60 ? "QR scanned" : t);
          void search(t);
        }}
      />
    </div>
  );
}
