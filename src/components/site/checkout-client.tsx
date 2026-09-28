"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BadgePercent, BedDouble, CalendarDays, CheckCircle2, CreditCard, FileUp, Landmark, Loader2, Lock, Plus, ShieldCheck, Trash2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiClientError, uploadFile } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { CATEGORY_LABEL, GENDER_LABEL } from "@/lib/site/labels";
import { Alert, Button, Input, Select } from "@/components/ui";
import { Img } from "@/components/ui/img";
import { PriceBreakdown, type Line } from "./price-breakdown";
import { HoldCountdown } from "./countdown";
import { startPayment, type Checkout } from "./pay";

type Gender = "MALE" | "FEMALE" | "OTHER";
type Guest = { name: string; phone: string; email: string; gender: Gender | ""; age: string };
type Saved = { id: string; name: string; phone: string | null; email: string | null; gender: Gender | null; age: number | null; relation: string | null };
type Quote = { lines: Line[]; totalAmount: number; payableExDeposit: number; securityDeposit: number; couponDiscount: number; nights: number; tierLabel: string; nonRefundable: boolean };

type Props = {
  user: { name: string; email: string | null; phone: string | null; gender: Gender | null };
  property: { id: string; name: string; slug: string; city: string; image: string | null; checkInTime: string; checkOutTime: string; idProofRequired: boolean; allowCashAtProperty: boolean; gender: string };
  room: { id: string; name: string | null; roomNumber: string; category: string; isAC: boolean; bathroom: string; maxOccupancy: number; totalBeds: number };
  request: { unit: "BED" | "ROOM"; beds: number; bedIds: string[]; checkIn: string; checkOut: string; adults: number; children: number; services: ("FOOD" | "LAUNDRY")[] };
  hasIdDocument: boolean;
  savedGuests: Saved[];
  payment: { allowPartial: boolean; partialBps: number; holdMinutes: number };
  offers: { code: string; title: string }[];
};

const blank = (): Guest => ({ name: "", phone: "", email: "", gender: "", age: "" });
const fmtDate = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function CheckoutClient(props: Props) {
  const { request: rq, property, room } = props;
  const router = useRouter();
  const genderRestricted = property.gender === "MALE_ONLY" || property.gender === "FEMALE_ONLY";
  const guestCount = rq.adults + rq.children;
  const [guests, setGuests] = useState<Guest[]>(() => [
    { name: props.user.name, phone: props.user.phone ?? "", email: props.user.email ?? "", gender: props.user.gender ?? "", age: "" },
    ...Array.from({ length: Math.max(0, guestCount - 1) }, blank),
  ]);
  const [special, setSpecial] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(true);
  const [option, setOption] = useState<"FULL" | "PARTIAL" | "PAY_AT_PROPERTY">("FULL");
  const [accept, setAccept] = useState(false);
  const [needsId, setNeedsId] = useState(property.idProofRequired && !props.hasIdDocument);
  const [idFile, setIdFile] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<{ bookingId: string; holdExpiresAt: string | null } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchQuote = useCallback(
    async (code: string | null) => {
      setQuoting(true);
      try {
        const d = await apiFetch<{ quote: Quote }>("/api/quote", {
          method: "POST",
          json: { roomId: room.id, unit: rq.unit, bedsCount: rq.beds, bedIds: rq.bedIds.length ? rq.bedIds : undefined, checkIn: rq.checkIn, checkOut: rq.checkOut, adults: rq.adults, children: rq.children, services: rq.services, couponCode: code },
        });
        setQuote(d.quote);
        setQuoteErr(null);
        return true;
      } catch (e) {
        if (code) {
          setCouponErr((e as Error).message);
          return false;
        }
        setQuoteErr((e as Error).message);
        return false;
      } finally {
        setQuoting(false);
      }
    },
    [room.id, rq],
  );
  useEffect(() => {
    void fetchQuote(null);
  }, [fetchQuote]);

  async function applyCoupon(code = couponInput) {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setCouponErr(null);
    const ok = await fetchQuote(c);
    if (ok) {
      setCoupon(c);
      setCouponInput(c);
      toast.success(`Coupon ${c} applied`);
    } else {
      await fetchQuote(coupon);
    }
  }
  async function removeCoupon() {
    setCoupon(null);
    setCouponInput("");
    setCouponErr(null);
    await fetchQuote(null);
  }

  const total = quote?.totalAmount ?? 0;
  const partialAmount = Math.min(total, Math.ceil(Math.round((total * props.payment.partialBps) / 10000) / 100) * 100);
  const payNow = option === "PARTIAL" ? partialAmount : option === "PAY_AT_PROPERTY" ? 0 : total;

  function setGuest(i: number, patch: Partial<Guest>) {
    setGuests((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  }
  function fillSaved(i: number, id: string) {
    const s = props.savedGuests.find((g) => g.id === id);
    if (s) setGuest(i, { name: s.name, phone: s.phone ?? "", email: s.email ?? "", gender: s.gender ?? "", age: s.age != null ? String(s.age) : "" });
  }

  async function onIdFile(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    try {
      const up = await uploadFile(f, "ID_PROOF");
      setIdFile({ id: up.id, name: up.fileName });
      toast.success("ID proof uploaded securely");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    const g0 = guests[0]!;
    if (g0.name.trim().length < 2) e["g0.name"] = "Enter the primary guest's full name";
    if (!/^(\+?91)?[6-9]\d{9}$/.test(g0.phone.replace(/\s/g, ""))) e["g0.phone"] = "Enter a valid 10-digit mobile number";
    if (g0.email && !/^\S+@\S+\.\S+$/.test(g0.email)) e["g0.email"] = "Enter a valid email";
    guests.forEach((g, i) => {
      const used = i === 0 || g.name.trim();
      if (!used) return;
      if (i > 0 && g.name.trim().length < 2) e[`g${i}.name`] = "Enter the full name";
      if (genderRestricted && !g.gender) e[`g${i}.gender`] = "Gender is required for this property";
      if (property.gender === "MALE_ONLY" && g.gender && g.gender !== "MALE") e[`g${i}.gender`] = "This property is for men only";
      if (property.gender === "FEMALE_ONLY" && g.gender && g.gender !== "FEMALE") e[`g${i}.gender`] = "This property is for women only";
    });
    if (genderRestricted) guests.forEach((g, i) => i > 0 && !g.name.trim() && (e[`g${i}.name`] = "Guest details are required for this property"));
    if (needsId && !idFile) e.id = "Please upload a government ID proof";
    if (!accept) e.accept = "Please accept to continue";
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]!);
      return false;
    }
    return true;
  }

  async function pay(bookingId: string, checkout: Checkout) {
    const r = await startPayment(checkout, { doneUrl: `/booking/${bookingId}/status`, description: `${property.name} booking` });
    if (r === "dismissed") toast.info("Payment not completed. Your beds are held — you can retry below.");
  }

  async function submit() {
    if (!quote || !validate()) return;
    setSubmitting(true);
    setConflictMsg(null);
    try {
      const out = await apiFetch<{ bookingId: string; status: string; checkout: Checkout; holdExpiresAt?: string }>("/api/bookings", {
        method: "POST",
        json: {
          roomId: room.id,
          unit: rq.unit,
          bedIds: rq.unit === "BED" && rq.bedIds.length ? rq.bedIds : undefined,
          bedsCount: rq.unit === "ROOM" ? room.totalBeds : Math.max(rq.beds, rq.adults),
          checkIn: rq.checkIn,
          checkOut: rq.checkOut,
          adults: rq.adults,
          children: rq.children,
          services: rq.services,
          couponCode: coupon,
          guests: guests
            .filter((g, i) => i === 0 || g.name.trim())
            .map((g) => ({ name: g.name.trim(), phone: g.phone.trim() || null, email: g.email.trim() || null, gender: g.gender || null, age: g.age ? Number(g.age) : null })),
          specialRequests: special.trim() || null,
          idProofFileId: idFile?.id ?? null,
          acceptTerms: true,
          paymentOption: option,
        },
      });
      if (out.status === "CONFIRMED" || !out.checkout) {
        toast.success("Booking confirmed!");
        router.push(`/booking/${out.bookingId}/status`);
        return;
      }
      setPending({ bookingId: out.bookingId, holdExpiresAt: out.holdExpiresAt ?? null });
      await pay(out.bookingId, out.checkout);
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.status === 409) {
          setConflictMsg(e.message);
          toast.error(e.message);
        } else if ((e.details as { needsIdProof?: boolean } | undefined)?.needsIdProof) {
          setNeedsId(true);
          toast.error(e.message);
        } else toast.error(e.message);
      } else toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    if (!pending) return;
    setSubmitting(true);
    try {
      const r = await apiFetch<{ checkout: Checkout }>(`/api/bookings/${pending.bookingId}/pay`, { method: "POST" });
      await pay(pending.bookingId, r.checkout);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const err = (k: string) => errors[k];
  const roomTitle = room.name ?? `${CATEGORY_LABEL[room.category]} · Room ${room.roomNumber}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-6">
        {conflictMsg && (
          <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Just missed it!</p>
              <p className="text-sm">{conflictMsg}</p>
              <Link href={`/property/${property.slug}?checkIn=${rq.checkIn}&checkOut=${rq.checkOut}`} className="mt-2 inline-block text-sm font-semibold underline">
                Choose another room or bed
              </Link>
            </div>
          </div>
        )}
        {pending && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">Payment pending</p>
            <p className="mt-1 text-sm text-amber-900">Your booking is reserved. Complete the payment before the hold expires, or it will be released automatically.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <HoldCountdown until={pending.holdExpiresAt} />
              <Button onClick={retry} loading={submitting} variant="accent">
                Pay now
              </Button>
              <Link href={`/booking/${pending.bookingId}/status`} className="text-sm font-medium text-amber-900 underline">
                View booking status
              </Link>
            </div>
          </div>
        )}

        {/* guests */}
        <section className="card p-5" aria-labelledby="guests-h">
          <h2 id="guests-h" className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-brand-600" aria-hidden /> Guest details
          </h2>
          {genderRestricted && <p className="mt-1 text-sm text-slate-600">This property is for {GENDER_LABEL[property.gender]?.toLowerCase()}. Please add every guest with their gender.</p>}
          <div className="mt-4 space-y-5">
            {guests.map((g, i) => (
              <fieldset key={i} className="rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-800">{i === 0 ? "Primary guest" : `Guest ${i + 1}${i >= rq.adults ? " (child)" : ""}${genderRestricted ? "" : " — optional"}`}</legend>
                {props.savedGuests.length > 0 && (
                  <label className="mb-3 block max-w-xs text-xs font-medium text-slate-600">
                    Fill from saved guests
                    <Select defaultValue="" onChange={(e) => fillSaved(i, e.target.value)} className="mt-1 h-9">
                      <option value="">Choose a saved guest…</option>
                      {props.savedGuests.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.relation ? ` (${s.relation})` : ""}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Full name{(i === 0 || genderRestricted) && <span className="text-red-600"> *</span>}
                    <Input value={g.name} onChange={(e) => setGuest(i, { name: e.target.value })} aria-invalid={Boolean(err(`g${i}.name`)) || undefined} className="mt-1" autoComplete={i === 0 ? "name" : "off"} />
                    {err(`g${i}.name`) && <span className="mt-1 block text-xs text-red-600">{err(`g${i}.name`)}</span>}
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Mobile{i === 0 && <span className="text-red-600"> *</span>}
                    <Input value={g.phone} inputMode="tel" onChange={(e) => setGuest(i, { phone: e.target.value })} aria-invalid={Boolean(err(`g${i}.phone`)) || undefined} className="mt-1" autoComplete={i === 0 ? "tel" : "off"} />
                    {err(`g${i}.phone`) && <span className="mt-1 block text-xs text-red-600">{err(`g${i}.phone`)}</span>}
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Email
                    <Input type="email" value={g.email} onChange={(e) => setGuest(i, { email: e.target.value })} aria-invalid={Boolean(err(`g${i}.email`)) || undefined} className="mt-1" />
                    {err(`g${i}.email`) && <span className="mt-1 block text-xs text-red-600">{err(`g${i}.email`)}</span>}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm font-medium text-slate-700">
                      Gender{genderRestricted && <span className="text-red-600"> *</span>}
                      <Select value={g.gender} onChange={(e) => setGuest(i, { gender: e.target.value as Gender | "" })} aria-invalid={Boolean(err(`g${i}.gender`)) || undefined} className="mt-1">
                        <option value="">Select</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </Select>
                      {err(`g${i}.gender`) && <span className="mt-1 block text-xs text-red-600">{err(`g${i}.gender`)}</span>}
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Age
                      <Input type="number" min={0} max={120} value={g.age} onChange={(e) => setGuest(i, { age: e.target.value })} className="mt-1" />
                    </label>
                  </div>
                </div>
                {i > 0 && g.name && (
                  <button type="button" onClick={() => setGuest(i, blank())} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear
                  </button>
                )}
              </fieldset>
            ))}
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Special requests (optional)
            <textarea value={special} onChange={(e) => setSpecial(e.target.value)} maxLength={500} placeholder="Early arrival, dietary needs, lower bunk…" className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </label>
        </section>

        {/* ID proof */}
        {(needsId || idFile) && (
          <section className="card p-5" aria-labelledby="id-h">
            <h2 id="id-h" className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden /> ID proof
            </h2>
            <p className="mt-1 text-sm text-slate-600">This property requires a government ID (Aadhaar, passport, driving licence or voter ID). It&apos;s stored privately and shared only with the property for check-in.</p>
            {idFile ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {idFile.name} uploaded
                <button type="button" className="ml-2 text-xs underline" onClick={() => setIdFile(null)}>
                  Replace
                </button>
              </p>
            ) : (
              <label className={cn("mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center text-sm", err("id") ? "border-red-300 bg-red-50" : "border-slate-300 hover:border-brand-400")}>
                {uploading ? <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> : <FileUp className="h-6 w-6 text-slate-400" aria-hidden />}
                <span className="font-medium text-slate-700">{uploading ? "Uploading…" : "Upload ID (JPG, PNG or PDF)"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => onIdFile(e.target.files?.[0])} disabled={uploading} />
                {err("id") && <span className="text-xs text-red-600">{err("id")}</span>}
              </label>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Tip: save an ID in <Link href="/account/documents" className="underline">My documents</Link> to skip this step next time.
            </p>
          </section>
        )}

        {/* payment option */}
        <section className="card p-5" aria-labelledby="payopt-h">
          <h2 id="payopt-h" className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-5 w-5 text-brand-600" aria-hidden /> How would you like to pay?
          </h2>
          <div className="mt-4 space-y-2" role="radiogroup" aria-labelledby="payopt-h">
            {[
              { v: "FULL" as const, t: "Pay in full now", d: "UPI, card, net banking or wallet", icon: CreditCard, show: true, amt: total },
              { v: "PARTIAL" as const, t: `Pay ${props.payment.partialBps / 100}% advance now`, d: "Pay the rest at or before check-in", icon: Landmark, show: props.payment.allowPartial, amt: partialAmount },
              { v: "PAY_AT_PROPERTY" as const, t: "Pay at property", d: "Your booking is confirmed now; pay the full amount at check-in", icon: Wallet, show: property.allowCashAtProperty, amt: 0 },
            ]
              .filter((o) => o.show)
              .map((o) => (
                <label key={o.v} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3", option === o.v ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-200" : "border-slate-200 hover:border-slate-300")}>
                  <input type="radio" name="payopt" checked={option === o.v} onChange={() => setOption(o.v)} className="h-4 w-4 accent-brand-600" />
                  <o.icon className="h-5 w-5 text-slate-500" aria-hidden />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{o.t}</span>
                    <span className="block text-xs text-slate-500">{o.d}</span>
                  </span>
                  {quote && o.v !== "PAY_AT_PROPERTY" && <span className="text-sm font-semibold tabular-nums">{formatINR(o.amt)}</span>}
                </label>
              ))}
          </div>
        </section>

        {/* terms */}
        <section className="card p-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" aria-invalid={Boolean(err("accept")) || undefined} />
            <span>
              I agree to StayShare&apos;s{" "}
              <Link href="/pages/terms" target="_blank" className="font-medium text-brand-700 underline">
                terms & conditions
              </Link>
              , the property&apos;s{" "}
              <Link href={`/property/${property.slug}#rules-h`} target="_blank" className="font-medium text-brand-700 underline">
                house rules
              </Link>{" "}
              and the{" "}
              <Link href="/pages/cancellation-policy" target="_blank" className="font-medium text-brand-700 underline">
                cancellation & refund policy
              </Link>
              .{err("accept") && <span className="block text-xs text-red-600">{err("accept")}</span>}
            </span>
          </label>
        </section>
      </div>

      {/* summary */}
      <aside aria-label="Booking summary">
        <div className="sticky top-20 space-y-4">
          <div className="card overflow-hidden">
            <div className="flex gap-3 border-b border-slate-100 p-4">
              <Img src={property.image} alt="" fallback="/images/placeholder-building.svg" className="h-20 w-24 shrink-0 rounded-xl" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{property.name}</p>
                <p className="text-xs text-slate-500">{property.city}</p>
                <p className="mt-1 text-sm text-slate-700">{roomTitle}</p>
                <p className="text-xs text-slate-500">
                  {room.isAC ? "AC" : "Non-AC"} · {room.bathroom === "ATTACHED" ? "Attached bath" : "Common bath"}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 text-sm">
              <div>
                <dt className="flex items-center gap-1 text-xs text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Check-in
                </dt>
                <dd className="font-medium">{fmtDate(rq.checkIn)}</dd>
                <dd className="text-xs text-slate-500">from {property.checkInTime}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Check-out
                </dt>
                <dd className="font-medium">{fmtDate(rq.checkOut)}</dd>
                <dd className="text-xs text-slate-500">by {property.checkOutTime}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-slate-500">
                  <BedDouble className="h-3.5 w-3.5" aria-hidden /> Booking
                </dt>
                <dd className="font-medium">{rq.unit === "ROOM" ? "Entire room" : `${Math.max(rq.beds, rq.adults)} bed${Math.max(rq.beds, rq.adults) > 1 ? "s" : ""}`}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" aria-hidden /> Guests
                </dt>
                <dd className="font-medium">
                  {rq.adults} adult{rq.adults > 1 ? "s" : ""}
                  {rq.children ? `, ${rq.children} child${rq.children > 1 ? "ren" : ""}` : ""}
                </dd>
              </div>
              {rq.services.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Add-ons</dt>
                  <dd className="font-medium">{rq.services.map((s) => (s === "FOOD" ? "Meals" : "Laundry")).join(", ")}</dd>
                </div>
              )}
            </dl>
            <div className="border-b border-slate-100 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <BadgePercent className="h-4 w-4 text-brand-600" aria-hidden /> Coupon
              </p>
              {coupon ? (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-emerald-800">{coupon} applied</span>
                  <button type="button" onClick={removeCoupon} className="text-xs font-medium text-slate-600 underline">
                    Remove
                  </button>
                </div>
              ) : (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void applyCoupon();
                  }}
                >
                  <label className="sr-only" htmlFor="coupon">
                    Coupon code
                  </label>
                  <Input id="coupon" value={couponInput} onChange={(e) => (setCouponInput(e.target.value.toUpperCase()), setCouponErr(null))} placeholder="Enter code" className="uppercase" aria-invalid={Boolean(couponErr) || undefined} aria-describedby={couponErr ? "coupon-err" : undefined} />
                  <Button type="submit" variant="outline" loading={quoting && Boolean(couponInput)} disabled={!couponInput.trim()}>
                    Apply
                  </Button>
                </form>
              )}
              {couponErr && (
                <p id="coupon-err" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                  {couponErr}
                </p>
              )}
              {!coupon && props.offers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {props.offers.map((o) => (
                    <button key={o.code} type="button" onClick={() => applyCoupon(o.code)} title={o.title} className="rounded-full border border-dashed border-brand-300 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800 hover:bg-brand-100">
                      {o.code}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4" aria-live="polite">
              {quoteErr ? (
                <Alert tone="error" title="We can't price this stay">
                  {quoteErr}
                </Alert>
              ) : !quote ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculating price…
                </div>
              ) : (
                <div className={cn(quoting && "opacity-60")}>
                  <p className="mb-2 text-xs font-medium text-brand-700">
                    {quote.nights} night{quote.nights > 1 ? "s" : ""} · {quote.tierLabel} rate
                  </p>
                  <PriceBreakdown lines={quote.lines} total={quote.totalAmount} />
                  {quote.securityDeposit > 0 && <p className="mt-2 text-xs text-slate-500">Includes a refundable security deposit of {formatINR(quote.securityDeposit)}, returned after check-out.</p>}
                  {quote.nonRefundable && <p className="mt-2 text-xs font-medium text-amber-700">This rate is non-refundable.</p>}
                  {option === "PARTIAL" && <p className="mt-2 text-sm font-medium">Pay now: {formatINR(partialAmount)} · Balance {formatINR(total - partialAmount)} later</p>}
                </div>
              )}
            </div>
          </div>
          {!pending && (
            <Button size="lg" variant="accent" className="w-full" loading={submitting} disabled={!quote || Boolean(quoteErr)} onClick={submit}>
              <Lock className="h-4 w-4" aria-hidden />
              {option === "PAY_AT_PROPERTY" ? "Confirm booking" : quote ? `Pay ${formatINR(payNow)}` : "Pay"}
            </Button>
          )}
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Secure payment · Beds are held for {props.payment.holdMinutes} minutes while you pay
          </p>
          <Link href={`/property/${property.slug}?checkIn=${rq.checkIn}&checkOut=${rq.checkOut}`} className="flex items-center justify-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            <Plus className="h-4 w-4 rotate-45" aria-hidden /> Change room or dates
          </Link>
        </div>
      </aside>
    </div>
  );
}
