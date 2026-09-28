"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, toPaise, toRupeeInput } from "@/lib/client-api";
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, DescList, Field, Input, LinkButton, Money, Select, StatusBadge, Textarea } from "@/components/ui";
import { humanize } from "@/components/owner/format";
import type { BookingDetail } from "@/services/owner-reports";
import { BookingSearch, type LookupRow } from "./booking-search";

type Preview = { extras: number; damage: number; stayDue: number; unusedNights: number; earlyRefund: number; depositHeld: number; depositRefund: number; amountDue: number };
type Result = Preview & { cashCollected: number; invoiceNumber: string | null };

const CHECKLIST = ["Bed linen & towels returned", "Wardrobe / locker emptied", "Electricals & AC working", "Bathroom fixtures OK", "Access card / remote returned"];

export function CheckOutDesk({ initialQuery, inHouse }: { initialQuery?: string; inHouse: LookupRow[] }) {
  const [id, setId] = useState<string | null>(null);
  const [done, setDone] = useState<{ result: Result; bookingId: string; number: string } | null>(null);
  if (done)
    return (
      <Card>
        <CardBody className="py-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
          <h2 className="text-xl font-semibold">Checked out · {done.number}</h2>
          <div className="mx-auto mt-4 max-w-sm space-y-1 text-left text-sm">
            <Line label="Deposit held" value={done.result.depositHeld} />
            <Line label="Charges settled" value={done.result.extras + done.result.damage + done.result.stayDue} />
            {done.result.earlyRefund > 0 && <Line label="Early check-out refund" value={done.result.earlyRefund} />}
            <Line label="Deposit refund initiated" value={done.result.depositRefund} strong />
            <Line label="Cash collected" value={done.result.cashCollected} />
            {done.result.amountDue - done.result.cashCollected > 0 && <Line label="Still due" value={done.result.amountDue - done.result.cashCollected} strong />}
          </div>
          <p className="mt-3 text-sm text-slate-500">{done.result.depositRefund > 0 ? "The refund goes back to the guest's original payment method." : "No deposit refund due."} Beds are marked for cleaning.</p>
          <div className="mt-5 flex justify-center gap-2">
            <LinkButton href={`/api/staff/bookings/${done.bookingId}/invoice`} variant="outline" target="_blank">
              <FileText className="h-4 w-4" /> Final invoice {done.result.invoiceNumber ? `(${done.result.invoiceNumber})` : ""}
            </LinkButton>
            <Button onClick={() => (setDone(null), setId(null))}>Next guest</Button>
          </div>
        </CardBody>
      </Card>
    );
  if (id) return <CheckOutForm id={id} onBack={() => setId(null)} onDone={(r, n) => setDone({ result: r, bookingId: id, number: n })} />;
  return <BookingSearch mode="checkout" initialQuery={initialQuery} onPick={setId} quick={inHouse} />;
}

function CheckOutForm({ id, onBack, onDone }: { id: string; onBack: () => void; onDone: (r: Result, number: string) => void }) {
  const [d, setD] = useState<BookingDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [keys, setKeys] = useState(true);
  const [condition, setCondition] = useState("GOOD");
  const [checks, setChecks] = useState<Record<string, boolean>>(Object.fromEntries(CHECKLIST.map((c) => [c, true])));
  const [damages, setDamages] = useState("");
  const [damageAmt, setDamageAmt] = useState("");
  const [extras, setExtras] = useState<{ description: string; amount: string }[]>([]);
  const [cash, setCash] = useState("");
  const [cashTouched, setCashTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    apiFetch<BookingDetail>(`/api/staff/bookings/${id}`)
      .then(setD)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load booking"));
  }, [id]);

  const extraPayload = extras.filter((x) => x.description.trim() && toPaise(x.amount) > 0).map((x) => ({ description: x.description.trim(), amount: toPaise(x.amount) }));
  const key = JSON.stringify([damageAmt, extraPayload]);
  const runPreview = useCallback(async () => {
    const my = ++seq.current;
    setPreviewing(true);
    try {
      const p = await apiFetch<Preview>(`/api/staff/bookings/${id}/checkout-preview`, { method: "POST", json: { damageCharges: toPaise(damageAmt), extraCharges: extraPayload } });
      if (my === seq.current) {
        setPreview(p);
        if (!cashTouched) setCash(toRupeeInput(p.amountDue));
      }
    } catch (e) {
      if (my === seq.current) toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      if (my === seq.current) setPreviewing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, cashTouched]);
  useEffect(() => {
    const t = setTimeout(runPreview, 350);
    return () => clearTimeout(t);
  }, [runPreview]);

  if (err) return <Alert tone="error" title="Couldn't open booking">{err}</Alert>;
  if (!d)
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading booking…
      </div>
    );
  const primary = d.guests.find((g) => g.isPrimary) ?? d.guests[0];

  const submit = async () => {
    if (condition === "DAMAGED" && !damages.trim()) return toast.error("Describe the damage");
    setSaving(true);
    try {
      const r = await apiFetch<Result>(`/api/staff/bookings/${d.id}/check-out`, {
        method: "POST",
        json: { inspection: { keysReturned: keys, roomCondition: condition, damages: damages || undefined, checklist: checks }, damageCharges: toPaise(damageAmt), extraCharges: extraPayload, cashCollected: toPaise(cash), notes: notes || null },
      });
      toast.success("Guest checked out");
      onDone(r, d.bookingNumber);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <Card>
        <CardHeader title={primary?.name ?? d.customer.name} description={`${d.bookingNumber} · ${d.propertyName} · Room ${d.roomNumber}`} action={<StatusBadge status={d.status} />} />
        <CardBody>
          <DescList
            items={[
              { label: "Stay", value: `${d.checkIn} → ${d.checkOut} (${d.nights} nights)` },
              { label: "Beds", value: d.beds.map((b) => b.code).join(", ") || "—" },
              { label: "Checked in", value: d.checkInRecord ? new Date(d.checkInRecord.at).toLocaleString("en-IN") : "—" },
              { label: "Phone", value: d.customer.phone },
            ]}
          />
          {d.status !== "CHECKED_IN" && <div className="mt-3"><Alert tone="warn">Only checked-in guests can be checked out.</Alert></div>}
        </CardBody>
      </Card>

      {d.status === "CHECKED_IN" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Room inspection</span>} />
              <CardBody className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Checkbox label="Keys returned" checked={keys} onChange={(e) => setKeys(e.target.checked)} />
                  <Field label="Room condition">
                    {(p) => (
                      <Select {...p} value={condition} onChange={(e) => setCondition(e.target.value)}>
                        <option value="GOOD">Good</option>
                        <option value="FAIR">Fair — minor wear</option>
                        <option value="DAMAGED">Damaged</option>
                      </Select>
                    )}
                  </Field>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-slate-700">Checklist</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CHECKLIST.map((c) => (
                      <Checkbox key={c} label={c} checked={checks[c] ?? false} onChange={(e) => setChecks({ ...checks, [c]: e.target.checked })} />
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <Field label="Damages" hint={condition === "DAMAGED" ? "Required when the room is damaged" : undefined}>
                    {(p) => <Textarea {...p} rows={2} value={damages} onChange={(e) => setDamages(e.target.value)} placeholder="e.g. Broken lamp, stained mattress" maxLength={1000} />}
                  </Field>
                  <Field label="Damage charges (₹)">
                    {(p) => <Input {...p} inputMode="decimal" value={damageAmt} onChange={(e) => setDamageAmt(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />}
                  </Field>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Extra charges"
                description="Food, laundry, minibar or other services not yet billed."
                action={
                  <Button size="sm" variant="outline" onClick={() => setExtras([...extras, { description: "", amount: "" }])}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                }
              />
              <CardBody className="space-y-2">
                {d.services.filter((s) => !s.settled).length > 0 && (
                  <ul className="mb-2 space-y-1 text-sm">
                    {d.services.filter((s) => !s.settled).map((s) => (
                      <li key={s.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                        <span>{s.description} (unbilled)</span>
                        <Money paise={s.amount} />
                      </li>
                    ))}
                  </ul>
                )}
                {extras.length === 0 && <p className="text-sm text-slate-500">No extra charges.</p>}
                {extras.map((x, i) => (
                  <div key={i} className="flex gap-2">
                    <Input aria-label="Charge description" placeholder="Description" value={x.description} maxLength={120} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} />
                    <Input aria-label="Amount in rupees" placeholder="₹" inputMode="decimal" className="w-28" value={x.amount} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, amount: e.target.value.replace(/[^\d.]/g, "") } : y)))} />
                    <Button size="icon" variant="ghost" aria-label="Remove charge" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          <Card className="lg:sticky lg:top-20 lg:self-start">
            <CardHeader title="Settlement" action={previewing ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Updating" /> : null} />
            <CardBody className="space-y-2 text-sm">
              {preview ? (
                <>
                  <Line label="Deposit held" value={preview.depositHeld} />
                  <Line label="Extra charges" value={preview.extras} />
                  <Line label="Damage charges" value={preview.damage} />
                  <Line label="Unpaid stay balance" value={preview.stayDue} />
                  {preview.unusedNights > 0 && <Line label={`Early check-out refund (${preview.unusedNights} nights)`} value={-preview.earlyRefund} />}
                  <div className="space-y-2 border-t border-slate-100 pt-2">
                    <Line label="Deposit refund to guest" value={preview.depositRefund} strong />
                    <Line label="Amount due from guest" value={preview.amountDue} strong />
                  </div>
                  {preview.amountDue > 0 && (
                    <Field label="Cash collected now (₹)">
                      {(p) => (
                        <Input
                          {...p}
                          inputMode="decimal"
                          value={cash}
                          onChange={(e) => {
                            setCashTouched(true);
                            setCash(e.target.value.replace(/[^\d.]/g, ""));
                          }}
                        />
                      )}
                    </Field>
                  )}
                </>
              ) : (
                <p className="text-slate-500">Calculating…</p>
              )}
              <Field label="Notes">
                {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />}
              </Field>
              <Button size="lg" className="w-full" onClick={submit} loading={saving} disabled={!preview || previewing}>
                Complete check-out
              </Button>
              {!keys && <p className="text-xs text-amber-700">Keys not returned — note it for the record.</p>}
              <p className="text-xs text-slate-500">Condition: {humanize(condition)}</p>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <Money paise={value} className={strong ? "font-semibold text-slate-900" : ""} />
    </div>
  );
}
