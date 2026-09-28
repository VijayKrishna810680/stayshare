"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarPlus, CircleSlash, ImagePlus, LifeBuoy, Loader2, ReceiptIndianRupee, Star, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, toPaise, uploadFile } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { CATEGORY_LABEL, MOD_LABEL, REVIEW_CATEGORIES } from "@/lib/site/labels";
import { Alert, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Img } from "@/components/ui/img";
import { startPayment, type Checkout } from "./pay";
import { TicketForm } from "./ticket-form";

type Preview = { cancellable: boolean; refundBps: number; stayRefund: number; depositRefund: number; convenienceRefund: number; totalRefund: number; retained: number; paidAmount: number; nonRefundable: boolean; policy: { name?: string } };

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("Change of plans");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setErr(null);
    apiFetch<Preview>(`/api/bookings/${bookingId}/cancel`).then(setPreview).catch((e) => setErr((e as Error).message));
  }, [open, bookingId]);
  async function confirm() {
    setBusy(true);
    try {
      const r = await apiFetch<{ totalRefund: number }>(`/api/bookings/${bookingId}/cancel`, { method: "POST", json: { reason: detail.trim() ? `${reason} — ${detail.trim()}` : reason } });
      toast.success(r.totalRefund > 0 ? `Booking cancelled. Refund of ${formatINR(r.totalRefund)} started.` : "Booking cancelled.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setOpen(true)}>
        <CircleSlash className="h-4 w-4" aria-hidden /> Cancel booking
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this booking?"
        description="Your refund is calculated from the cancellation policy that applied when you booked."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep booking
            </Button>
            <Button variant="danger" onClick={confirm} loading={busy} disabled={!preview?.cancellable}>
              Cancel booking
            </Button>
          </>
        }
      >
        {err ? (
          <Alert tone="error">{err}</Alert>
        ) : !preview ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculating your refund…
          </div>
        ) : !preview.cancellable ? (
          <Alert tone="warn">This booking can no longer be cancelled online. Please contact support.</Alert>
        ) : (
          <div className="space-y-4">
            <dl className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Amount paid</dt>
                <dd className="tabular-nums">{formatINR(preview.paidAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Stay refund ({preview.refundBps / 100}%{preview.policy?.name ? ` · ${preview.policy.name}` : ""})</dt>
                <dd className="tabular-nums">{formatINR(preview.stayRefund)}</dd>
              </div>
              {preview.depositRefund > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-600">Security deposit</dt>
                  <dd className="tabular-nums">{formatINR(preview.depositRefund)}</dd>
                </div>
              )}
              {preview.convenienceRefund > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-600">Convenience fee</dt>
                  <dd className="tabular-nums">{formatINR(preview.convenienceRefund)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <dt>You&apos;ll get back</dt>
                <dd className="tabular-nums text-emerald-700">{formatINR(preview.totalRefund)}</dd>
              </div>
              {preview.retained > 0 && <p className="text-xs text-slate-500">Cancellation charge: {formatINR(preview.retained)}</p>}
            </dl>
            {preview.nonRefundable && <Alert tone="warn">This was a non-refundable rate.</Alert>}
            <div>
              <Label htmlFor="cx-reason">Reason</Label>
              <Select id="cx-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option>Change of plans</option>
                <option>Found another place</option>
                <option>Booked by mistake</option>
                <option>Travel dates changed</option>
                <option>Property concerns</option>
                <option>Other</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="cx-detail">Anything else? (optional)</Label>
              <Textarea id="cx-detail" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={400} rows={2} />
            </div>
            <p className="text-xs text-slate-500">Refunds go back to your original payment method, usually within 5–7 business days.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}

type RoomOpt = { id: string; roomNumber: string; name: string | null; category: string; isAC: boolean; totalBeds: number; allowBed: boolean; allowRoom: boolean; nightlyBed: number | null; nightlyRoom: number | null; availableBeds: number; entireRoomAvailable: boolean };

export function ModifyBookingButton({ booking, guests, canPreCheckIn }: { booking: { id: string; unit: "BED" | "ROOM"; checkIn: string; checkOut: string; roomId: string; bedsCount: number; adults: number; children: number; services: string[]; isAC: boolean; category: string }; guests: { id: string; name: string; isPrimary: boolean }[]; canPreCheckIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("EXTEND_STAY");
  const [newCheckOut, setNewCheckOut] = useState("");
  const [time, setTime] = useState("09:00");
  const [rooms, setRooms] = useState<RoomOpt[] | null>(null);
  const [targetRoomId, setTargetRoomId] = useState("");
  const [unit, setUnit] = useState<"BED" | "ROOM">(booking.unit);
  const [guest, setGuest] = useState({ name: "", phone: "", gender: "", age: "", isChild: false });
  const [guestId, setGuestId] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const roomTypes = ["ROOM_CHANGE", "UPGRADE_AC", "UPGRADE_PRIVATE"];

  useEffect(() => {
    if (open && roomTypes.includes(type) && !rooms)
      apiFetch<{ rooms: RoomOpt[] }>(`/api/bookings/${booking.id}/modify`)
        .then((d) => setRooms(d.rooms))
        .catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type]);

  // estimate for extensions via the live quote
  useEffect(() => {
    setEstimate(null);
    if (type !== "EXTEND_STAY" || !newCheckOut || newCheckOut <= booking.checkOut) return;
    const t = setTimeout(() => {
      apiFetch<{ quote: { lines: { key: string; amount: number; kind: string }[] } }>("/api/quote", {
        method: "POST",
        json: { roomId: booking.roomId, unit: booking.unit, bedsCount: booking.bedsCount, checkIn: booking.checkOut, checkOut: newCheckOut, adults: booking.adults, children: booking.children, services: booking.services.filter((s) => s === "FOOD" || s === "LAUNDRY") },
      })
        .then((d) => setEstimate(d.quote.lines.filter((l) => !["deposit", "convenience", "convenienceTax", "cleaning"].includes(l.key) && l.kind !== "info").reduce((a, l) => a + (l.kind === "discount" ? -Math.abs(l.amount) : l.amount), 0)))
        .catch((e) => toast.error((e as Error).message));
    }, 300);
    return () => clearTimeout(t);
  }, [type, newCheckOut, booking]);

  const roomChoices = (rooms ?? []).filter((r) => r.id !== booking.roomId && (type !== "UPGRADE_AC" || r.isAC) && (type !== "UPGRADE_PRIVATE" || r.category === "PRIVATE" || r.allowRoom));
  const target = roomChoices.find((r) => r.id === targetRoomId);
  const types = [
    "EXTEND_STAY",
    ...(canPreCheckIn ? ["EARLY_CHECK_IN"] : []),
    "LATE_CHECK_OUT",
    "ROOM_CHANGE",
    ...(!booking.isAC ? ["UPGRADE_AC"] : []),
    ...(booking.category !== "PRIVATE" || booking.unit === "BED" ? ["UPGRADE_PRIVATE"] : []),
    ...(booking.unit === "ROOM" ? ["ADD_GUEST"] : []),
    ...(guests.some((g) => !g.isPrimary) ? ["REMOVE_GUEST"] : []),
  ];

  async function submit() {
    let request: Record<string, unknown>;
    if (type === "EXTEND_STAY") {
      if (!newCheckOut || newCheckOut <= booking.checkOut) return toast.error("Pick a new check-out date after your current one");
      request = { type, newCheckOut };
    } else if (type === "EARLY_CHECK_IN" || type === "LATE_CHECK_OUT") request = { type, time };
    else if (roomTypes.includes(type)) {
      if (!target) return toast.error("Choose a room");
      request = { type, targetRoomId: target.id, unit: target.allowBed && target.allowRoom ? unit : target.allowBed ? "BED" : "ROOM" };
    } else if (type === "ADD_GUEST") {
      if (guest.name.trim().length < 2) return toast.error("Enter the guest's name");
      request = { type, guest: { name: guest.name.trim(), phone: guest.phone || undefined, gender: guest.gender || undefined, age: guest.age ? Number(guest.age) : undefined, isChild: guest.isChild } };
    } else {
      if (!guestId) return toast.error("Choose the guest to remove");
      request = { type, guestId };
    }
    setBusy(true);
    try {
      const r = await apiFetch<{ status: string; priceDiff: number; checkout?: Checkout }>(`/api/bookings/${booking.id}/modify`, { method: "POST", json: { action: "request", request } });
      setOpen(false);
      if (r.status === "AWAITING_PAYMENT" && r.checkout) {
        toast.success(`Change approved — pay ${formatINR(r.priceDiff)} to confirm`);
        await startPayment(r.checkout, { doneUrl: `/account/bookings/${booking.id}?payment=success`, description: MOD_LABEL[type] });
      } else if (r.status === "REQUESTED") toast.success(`Request sent to the property for approval${r.priceDiff > 0 ? ` · extra ${formatINR(r.priceDiff)}` : r.priceDiff < 0 ? ` · refund ${formatINR(-r.priceDiff)}` : ""}`);
      else toast.success(`Done! ${MOD_LABEL[type]} applied${r.priceDiff < 0 ? ` · ${formatINR(-r.priceDiff)} will be refunded` : ""}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus className="h-4 w-4" aria-hidden /> Extend or modify
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Change your booking"
        description="Price differences are calculated live for the affected nights."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button onClick={submit} loading={busy}>
              Request change
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Change type">
            {types.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", type === t ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                {MOD_LABEL[t]}
              </button>
            ))}
          </div>
          {type === "EXTEND_STAY" && (
            <div className="space-y-2">
              <Label htmlFor="md-out">New check-out date</Label>
              <Input id="md-out" type="date" min={new Date(new Date(booking.checkOut + "T00:00:00Z").getTime() + 86400_000).toISOString().slice(0, 10)} value={newCheckOut} onChange={(e) => setNewCheckOut(e.target.value)} className="max-w-xs" />
              <p className="text-xs text-slate-500">Current check-out: {booking.checkOut}. The same bed/room is held for you while you pay.</p>
              {estimate !== null && (
                <p className="text-sm font-medium">
                  Estimated extra: <span className="tabular-nums">{formatINR(estimate)}</span> <span className="text-xs font-normal text-slate-500">(final amount confirmed before payment)</span>
                </p>
              )}
            </div>
          )}
          {(type === "EARLY_CHECK_IN" || type === "LATE_CHECK_OUT") && (
            <div className="space-y-2">
              <Label htmlFor="md-time">{type === "EARLY_CHECK_IN" ? "Arrival time" : "Departure time"}</Label>
              <Input id="md-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="max-w-[10rem]" />
              <p className="text-xs text-slate-500">A half-day charge applies if approved by the property.</p>
            </div>
          )}
          {roomTypes.includes(type) && (
            <div className="space-y-2">
              {!rooms ? (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading available rooms…
                </p>
              ) : roomChoices.length === 0 ? (
                <Alert tone="info">No other matching rooms are available for your remaining nights.</Alert>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {roomChoices.map((r) => {
                    const free = r.availableBeds > 0;
                    return (
                      <li key={r.id}>
                        <label className={cn("flex cursor-pointer flex-col rounded-xl border p-3 text-sm", targetRoomId === r.id ? "border-brand-600 bg-brand-50 ring-1 ring-brand-200" : "border-slate-200", !free && "cursor-not-allowed opacity-50")}>
                          <span className="flex items-center gap-2">
                            <input type="radio" name="md-room" disabled={!free} checked={targetRoomId === r.id} onChange={() => setTargetRoomId(r.id)} className="accent-brand-600" />
                            <span className="font-semibold">{r.name ?? `Room ${r.roomNumber}`}</span>
                          </span>
                          <span className="mt-1 text-xs text-slate-500">
                            {CATEGORY_LABEL[r.category]} · {r.isAC ? "AC" : "Non-AC"} · {r.availableBeds}/{r.totalBeds} beds free
                          </span>
                          <span className="mt-1 text-xs font-medium text-slate-700">
                            {r.nightlyBed ? `${formatINR(r.nightlyBed)}/bed/night` : ""} {r.nightlyRoom ? `· ${formatINR(r.nightlyRoom)}/room/night` : ""}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {target && target.allowBed && target.allowRoom && (
                <div className="flex gap-2" role="radiogroup" aria-label="Booking type">
                  {(["BED", "ROOM"] as const).map((u) => (
                    <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} className={cn("rounded-full border px-3 py-1 text-sm", unit === u ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200")}>
                      {u === "BED" ? `Same number of beds (${booking.bedsCount})` : "Entire room"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {type === "ADD_GUEST" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ag-name">Guest name</Label>
                <Input id="ag-name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ag-phone">Mobile (optional)</Label>
                <Input id="ag-phone" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ag-gender">Gender</Label>
                <Select id="ag-gender" value={guest.gender} onChange={(e) => setGuest({ ...guest, gender: e.target.value })}>
                  <option value="">Select</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="ag-age">Age</Label>
                <Input id="ag-age" type="number" min={0} max={120} value={guest.age} onChange={(e) => setGuest({ ...guest, age: e.target.value, isChild: Number(e.target.value) > 0 && Number(e.target.value) < 12 })} />
              </div>
            </div>
          )}
          {type === "REMOVE_GUEST" && (
            <div>
              <Label htmlFor="rg-guest">Guest to remove</Label>
              <Select id="rg-guest" value={guestId} onChange={(e) => setGuestId(e.target.value)}>
                <option value="">Choose a guest</option>
                {guests
                  .filter((g) => !g.isPrimary)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </Select>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

export function PayModificationButton({ bookingId, modificationId, amount }: { bookingId: string; modificationId: string; amount: number }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="accent"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await apiFetch<{ checkout: Checkout }>(`/api/bookings/${bookingId}/modify`, { method: "POST", json: { action: "pay", modificationId } });
          await startPayment(r.checkout, { doneUrl: `/account/bookings/${bookingId}?payment=success` });
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      Pay {formatINR(amount)}
    </Button>
  );
}

export function RefundRequestButton({ bookingId, max }: { bookingId: string; max: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.floor(max / 100)));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const paise = toPaise(amount);
    if (paise < 100 || paise > max) return toast.error(`Enter an amount between ₹1 and ${formatINR(max)}`);
    setBusy(true);
    try {
      await apiFetch(`/api/bookings/${bookingId}/refund-request`, { method: "POST", json: { amount: paise, reason: reason.trim() } });
      toast.success("Refund request submitted. Our team will review it within 2 business days.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ReceiptIndianRupee className="h-4 w-4" aria-hidden /> Request refund
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Request a refund"
        description="For issues like a room not as described or services not provided. Cancellation refunds happen automatically."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="rf-amt">Amount (₹)</Label>
            <Input id="rf-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="max-w-[12rem]" />
            <p className="mt-1 text-xs text-slate-500">Up to {formatINR(max)} can be refunded on this booking.</p>
          </div>
          <div>
            <Label htmlFor="rf-reason">What went wrong?</Label>
            <Textarea id="rf-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={1000} rows={4} />
          </div>
        </div>
      </Dialog>
    </>
  );
}

function StarInput({ label, value, onChange, optional }: { label: string; value: number; onChange: (n: number) => void; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700">
        {label}
        {optional && <span className="text-xs text-slate-400"> (optional)</span>}
      </span>
      <span className="flex items-center gap-0.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} star${i > 1 ? "s" : ""}`} onClick={() => onChange(value === i && optional ? 0 : i)} className="rounded p-0.5">
            <Star className={cn("h-6 w-6", i <= value ? "fill-amber-400 text-amber-400" : "text-slate-300")} aria-hidden />
          </button>
        ))}
      </span>
    </div>
  );
}

export function ReviewForm({ bookingId, propertyName }: { bookingId: string; propertyName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<Record<string, number>>({ cleanliness: 0, location: 0, staff: 0, facilities: 0, valueForMoney: 0, foodQuality: 0, safety: 0, overall: 0 });
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  async function addImage(f?: File) {
    if (!f) return;
    if (images.length >= 6) return toast.error("Up to 6 photos");
    setUploading(true);
    try {
      const up = await uploadFile(f, "REVIEW_IMAGE");
      setImages((x) => [...x, up.url]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function submit() {
    const required = ["cleanliness", "location", "staff", "facilities", "valueForMoney", "safety", "overall"];
    if (required.some((k) => !r[k])) return toast.error("Please rate every category");
    setBusy(true);
    try {
      const res = await apiFetch<{ status: string }>(`/api/bookings/${bookingId}/review`, { method: "POST", json: { ...r, foodQuality: r.foodQuality || null, title: title.trim() || null, text: text.trim(), images } });
      toast.success(res.status === "PUBLISHED" ? "Thanks! Your review is live." : "Thanks! Your review will appear after moderation.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)}>
        <Star className="h-4 w-4" aria-hidden /> Write a review
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Review your stay at ${propertyName}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={uploading}>
              Submit review
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="rounded-xl bg-amber-50 p-3">
            <StarInput label="Overall experience" value={r.overall!} onChange={(n) => setR({ ...r, overall: n })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-6">
            {REVIEW_CATEGORIES.map((c) => (
              <StarInput key={c.key} label={c.label} optional={c.optional} value={r[c.key] ?? 0} onChange={(n) => setR({ ...r, [c.key]: n })} />
            ))}
          </div>
          <div>
            <Label htmlFor="rv-title">Title (optional)</Label>
            <Input id="rv-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Sum it up in a few words" />
          </div>
          <div>
            <Label htmlFor="rv-text">Your review</Label>
            <Textarea id="rv-text" value={text} onChange={(e) => setText(e.target.value)} minLength={10} maxLength={3000} rows={5} placeholder="What did you like? What could be better?" />
          </div>
          <div className="flex flex-wrap gap-2">
            {images.map((u) => (
              <span key={u} className="relative h-16 w-16 overflow-hidden rounded-lg">
                <Img src={u} alt="Review photo" className="h-full w-full" />
                <button type="button" onClick={() => setImages((x) => x.filter((y) => y !== u))} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label="Remove photo">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" aria-hidden />}
              <span className="sr-only">Add photo</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => (addImage(e.target.files?.[0]), (e.target.value = ""))} disabled={uploading} />
            </label>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function BookingTicketButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <LifeBuoy className="h-4 w-4" aria-hidden /> Get help with this booking
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Raise a support ticket" description="Our team usually replies within a few hours." size="lg">
        <TicketForm defaultBookingId={bookingId} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
