"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, BedDouble, Camera, CheckCircle2, IdCard, IndianRupee, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, toPaise, toRupeeInput, uploadFile } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, DescList, Field, Input, Money, Select, StatusBadge, Textarea } from "@/components/ui";
import { Toggle } from "@/components/owner/common";
import { humanize, ID_TYPES } from "@/components/owner/format";
import type { BookingDetail } from "@/services/owner-reports";
import { BookingSearch, type LookupRow } from "./booking-search";

type FreeBed = { id: string; code: string; bedNumber: string; bedType: string; roomId: string; roomNumber: string; roomName: string | null; isAC: boolean; assigned: boolean; needsCleaning: boolean };
type Detail = BookingDetail & { freeBeds: FreeBed[] };

export function CheckInDesk({ initialQuery, arrivals, today }: { initialQuery?: string; arrivals: LookupRow[]; today: string }) {
  const [id, setId] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; guest: string } | null>(null);
  if (done)
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
          <h2 className="text-xl font-semibold">{done.guest} is checked in</h2>
          <p className="mt-1 text-sm text-slate-500">Booking {done.number}. Beds are now marked occupied.</p>
          <Button className="mt-5" onClick={() => (setDone(null), setId(null))}>
            Next guest
          </Button>
        </CardBody>
      </Card>
    );
  if (id) return <CheckInForm id={id} today={today} onBack={() => setId(null)} onDone={setDone} />;
  return <BookingSearch mode="checkin" initialQuery={initialQuery} onPick={setId} quick={arrivals} />;
}

function CheckInForm({ id, today, onBack, onDone }: { id: string; today: string; onBack: () => void; onDone: (d: { number: string; guest: string }) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ idDocType: "AADHAAR", idNumber: "", idVerified: false, idFileId: null as string | null, idFileName: "", deposit: "", cash: "", notes: "", allowEarly: false, beds: [] as string[] });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const x = await apiFetch<Detail>(`/api/staff/bookings/${id}`);
      setD(x);
      const stayDue = Math.max(0, x.money.balanceDue - x.money.depositPending);
      setF((s) => ({ ...s, deposit: toRupeeInput(x.money.depositPending), cash: toRupeeInput(stayDue), beds: x.freeBeds.filter((b) => b.assigned).map((b) => b.id), idDocType: x.guests.find((g) => g.isPrimary)?.idType ?? "AADHAAR" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load booking");
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const byRoom = useMemo(() => {
    const m = new Map<string, FreeBed[]>();
    for (const b of d?.freeBeds ?? []) m.set(b.roomId, [...(m.get(b.roomId) ?? []), b]);
    return [...m.entries()];
  }, [d]);

  if (err) return <Alert tone="error" title="Couldn't open booking">{err}</Alert>;
  if (!d)
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading booking…
      </div>
    );

  const canCheckIn = ["CONFIRMED", "CHECK_IN_PENDING"].includes(d.status);
  const early = d.checkIn > today;
  const primary = d.guests.find((g) => g.isPrimary) ?? d.guests[0];
  const needBeds = d.unit === "BED" ? d.bedsCount : 0;
  const bedsOk = d.unit === "ROOM" || f.beds.length === needBeds;

  const toggleBed = (bid: string) => {
    setF((s) => {
      if (s.beds.includes(bid)) return { ...s, beds: s.beds.filter((x) => x !== bid) };
      if (s.beds.length >= needBeds) return { ...s, beds: [...s.beds.slice(1), bid] };
      return { ...s, beds: [...s.beds, bid] };
    });
  };

  const submit = async () => {
    if (!f.idVerified) return toast.error("Verify the guest's ID first");
    if (f.idNumber.replace(/\s/g, "").length < 4) return toast.error("Enter the ID number (only the last 4 digits are stored)");
    if (!bedsOk) return toast.error(`Select exactly ${needBeds} bed(s)`);
    if (early && !f.allowEarly) return toast.error("Approve the early arrival to continue");
    setSaving(true);
    try {
      await apiFetch(`/api/staff/bookings/${d.id}/check-in`, {
        method: "POST",
        json: {
          idVerified: true,
          idDocType: f.idDocType,
          idNumber: f.idNumber.replace(/\s/g, ""),
          idFileId: f.idFileId,
          depositCollected: toPaise(f.deposit),
          cashCollected: toPaise(f.cash),
          assignBedIds: d.unit === "BED" ? f.beds : null,
          notes: f.notes || null,
          allowEarly: f.allowEarly,
        },
      });
      toast.success("Guest checked in");
      onDone({ number: d.bookingNumber, guest: primary?.name ?? d.customer.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Button>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`${primary?.name ?? d.customer.name}`} description={`${d.bookingNumber} · ${d.propertyName}`} action={<StatusBadge status={d.status} />} />
          <CardBody className="space-y-4">
            <DescList
              items={[
                { label: "Stay", value: `${d.checkIn} → ${d.checkOut} (${d.nights} night${d.nights > 1 ? "s" : ""})` },
                { label: "Room", value: `Room ${d.roomNumber}${d.roomName ? ` · ${d.roomName}` : ""} · ${d.unit === "ROOM" ? "Entire room" : `${d.bedsCount} bed(s)`}` },
                { label: "Guests", value: `${d.adults} adult(s)${d.children ? `, ${d.children} child(ren)` : ""}` },
                { label: "Check-in time", value: d.checkInTime },
                { label: "Assigned beds", value: d.beds.map((b) => b.code).join(", ") || "—" },
                { label: "Special requests", value: d.specialRequests || "—" },
              ]}
            />
            {d.guests.length > 1 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Guest list</p>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {d.guests.map((g) => (
                    <li key={g.id} className="rounded-lg bg-slate-100 px-2 py-1">
                      {g.name}
                      {g.gender ? ` · ${humanize(g.gender)}` : ""}
                      {g.age ? ` · ${g.age}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!canCheckIn && <Alert tone="warn">This booking is {humanize(d.status).toLowerCase()} and can&apos;t be checked in.</Alert>}
            {early && canCheckIn && (
              <Toggle label={`Early arrival — booking starts ${d.checkIn}`} description="Approve to check the guest in today. The stay dates are not changed." checked={f.allowEarly} onChange={(v) => setF({ ...f, allowEarly: v })} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Payment" />
          <CardBody className="space-y-2 text-sm">
            <Row label="Booking total" value={<Money paise={d.money.totalAmount} />} />
            <Row label="Paid" value={<Money paise={d.money.paidAmount} />} />
            <Row label="Security deposit" value={<Money paise={d.money.securityDeposit} />} />
            <Row label="Deposit pending" value={<Money paise={d.money.depositPending} />} strong={d.money.depositPending > 0} />
            <div className="border-t border-slate-100 pt-2">
              <Row label="Balance due" value={<Money paise={d.money.balanceDue} />} strong />
            </div>
            {d.payAtProperty && <Badge tone="amber">Pay at property</Badge>}
            {d.payments.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>
                      {humanize(p.purpose)} · {humanize(p.method)}
                    </span>
                    <span>
                      <Money paise={p.amount} /> <StatusBadge status={p.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {canCheckIn && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><IdCard className="h-4 w-4" /> Verify ID</span>} description="Check the original document. Only the last 4 digits are stored." />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Field label="Document type" required>
                {(p) => (
                  <Select {...p} value={f.idDocType} onChange={(e) => setF({ ...f, idDocType: e.target.value })}>
                    {ID_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Document number" required hint={f.idNumber ? `Stored as ••••${f.idNumber.replace(/\s|-/g, "").slice(-4)}` : undefined}>
                {(p) => <Input {...p} value={f.idNumber} autoComplete="off" onChange={(e) => setF({ ...f, idNumber: e.target.value.toUpperCase() })} maxLength={30} />}
              </Field>
              <div className="sm:col-span-2">
                <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm hover:bg-slate-50", uploading && "opacity-60")}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {f.idFileId ? `ID photo attached (${f.idFileName}) — replace` : "Capture / upload ID photo (optional)"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    className="sr-only"
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      try {
                        const up = await uploadFile(file, "ID_PROOF");
                        setF((s) => ({ ...s, idFileId: up.id, idFileName: up.fileName }));
                        toast.success("ID photo uploaded");
                      } catch (er) {
                        toast.error(er instanceof Error ? er.message : "Upload failed");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              </div>
              <Checkbox className="sm:col-span-2" label={<span className="font-medium">I have checked the original ID and it matches the guest</span>} checked={f.idVerified} onChange={(e) => setF({ ...f, idVerified: e.target.checked })} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><IndianRupee className="h-4 w-4" /> Collect at desk</span>} description="Cash collected is recorded against the booking." />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Field label="Security deposit (₹)" hint={d.money.depositPending ? `Pending: ₹${d.money.depositPending / 100}` : "Nothing pending"}>
                {(p) => <Input {...p} inputMode="decimal" value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value.replace(/[^\d.]/g, "") })} />}
              </Field>
              <Field label="Balance / rent (₹)" hint={`Stay balance: ₹${Math.max(0, d.money.balanceDue - d.money.depositPending) / 100}`}>
                {(p) => <Input {...p} inputMode="decimal" value={f.cash} onChange={(e) => setF({ ...f, cash: e.target.value.replace(/[^\d.]/g, "") })} />}
              </Field>
              <p className="text-sm text-slate-600 sm:col-span-2">
                Total to collect now: <strong><Money paise={toPaise(f.deposit) + toPaise(f.cash)} /></strong>
              </p>
              <Field label="Notes" className="sm:col-span-2">
                {(p) => <Textarea {...p} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} placeholder="Key number, special instructions…" />}
              </Field>
            </CardBody>
          </Card>

          {d.unit === "BED" && (
            <Card className="lg:col-span-2">
              <CardHeader title={<span className="flex items-center gap-2"><BedDouble className="h-4 w-4" /> Confirm beds</span>} description={`Select ${needBeds} bed(s). Pre-selected beds are the ones reserved for this booking.`} action={<Badge tone={bedsOk ? "green" : "amber"}>{f.beds.length}/{needBeds} selected</Badge>} />
              <CardBody className="space-y-4">
                {byRoom.length === 0 && <p className="text-sm text-slate-500">No other free beds for these dates — keep the reserved bed(s).</p>}
                {byRoom.map(([roomId, list]) => (
                  <div key={roomId}>
                    <p className="mb-2 text-sm font-medium">
                      Room {list[0]!.roomNumber} {list[0]!.roomName && <span className="text-slate-500">· {list[0]!.roomName}</span>} {list[0]!.isAC && <Badge tone="blue">AC</Badge>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((b) => {
                        const on = f.beds.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleBed(b.id)}
                            className={cn("min-w-24 rounded-xl border px-3 py-2 text-left text-sm transition", on ? "border-brand-600 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 bg-white hover:border-brand-300")}
                          >
                            <span className="block font-semibold">Bed {b.bedNumber}</span>
                            <span className="block text-xs text-slate-500">{humanize(b.bedType)}</span>
                            {b.assigned && <span className="block text-xs text-brand-700">Reserved</span>}
                            {b.needsCleaning && <span className="block text-xs text-amber-700">Needs cleaning</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:col-span-2">
            <Button variant="outline" onClick={onBack}>
              Cancel
            </Button>
            <Button size="lg" onClick={submit} loading={saving} disabled={!f.idVerified || !bedsOk || (early && !f.allowEarly)}>
              <BadgeCheck className="h-5 w-5" /> Complete check-in
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={strong ? "font-semibold text-slate-900" : ""}>{value}</span>
    </div>
  );
}
