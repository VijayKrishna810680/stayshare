import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CalendarDays, Download, MapPin, Navigation, Phone, Users } from "lucide-react";
import { pageUser } from "@/lib/auth/page";
import { prettyDate, prettyDateTime, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { AppError } from "@/lib/errors";
import { getBookingDetail } from "@/lib/site/bookings";
import { CATEGORY_LABEL, MOD_LABEL, humanize } from "@/lib/site/labels";
import { Alert, Card, CardBody, CardHeader, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { Img } from "@/components/ui/img";
import { PriceBreakdown } from "@/components/site/price-breakdown";
import { PolicyTiers } from "@/components/site/policy";
import { BookingTicketButton, CancelBookingButton, ModifyBookingButton, PayModificationButton, RefundRequestButton, ReviewForm } from "@/components/site/booking-actions";
import { HoldCountdown } from "@/components/site/countdown";
import { RetryPaymentButton } from "@/components/site/booking-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Booking details" };

const PENDING = ["DRAFT", "INVENTORY_LOCKED", "PAYMENT_PENDING"];

export default async function BookingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { id } = await params;
  const { payment } = await searchParams;
  const user = await pageUser({ next: `/account/bookings/${id}` });
  let d;
  try {
    d = await getBookingDetail(id, user.id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const b = d.booking;
  const today = todayIST();
  const qr = b.qrToken ? await QRCode.toDataURL(b.qrToken, { margin: 1, width: 220 }) : null;
  const cancellable = [...PENDING, "CONFIRMED", "CHECK_IN_PENDING"].includes(b.status);
  const modifiable = ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN"].includes(b.status) && b.checkOut >= today;
  const canReview = ["CHECKED_OUT", "COMPLETED"].includes(b.status) && !d.review;
  const refundable = b.paidAmount - b.refundedAmount;
  const openRefundRequest = d.refunds.some((r) => r.status === "REQUESTED");
  const canRequestRefund = refundable > 0 && !openRefundRequest && !PENDING.includes(b.status);
  const roomTitle = d.room ? (d.room.name ?? `${CATEGORY_LABEL[d.room.category]} · Room ${d.room.roomNumber}`) : "Room";
  const pendingMods = d.modifications.filter((m) => ["REQUESTED", "AWAITING_PAYMENT", "APPROVED"].includes(m.status));
  const holdValid = Boolean(b.lockExpiresAt && new Date(b.lockExpiresAt) > new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Booking ${b.bookingNumber}`}
        description={`Booked on ${prettyDateTime(b.createdAt)}`}
        breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Bookings", href: "/account/bookings" }, { label: b.bookingNumber }]}
        actions={<StatusBadge status={b.status} className="text-sm" />}
      />
      {payment === "success" && <Alert tone="success" title="Payment received">Your change will be applied as soon as the payment is confirmed by the gateway.</Alert>}
      {payment === "failure" && <Alert tone="error" title="Payment failed">No money was taken. You can try again below.</Alert>}
      {PENDING.includes(b.status) && (
        <Alert tone="warn" title="Payment pending">
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {holdValid ? (
              <>
                <HoldCountdown until={b.lockExpiresAt} />
                <RetryPaymentButton bookingId={b.id} label="Complete payment" />
              </>
            ) : (
              <span>The payment window has expired. Please make a new booking.</span>
            )}
          </div>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col gap-4 p-5 sm:flex-row">
              <Img src={d.property?.image} alt="" fallback="/images/placeholder-building.svg" className="h-32 w-full shrink-0 rounded-xl sm:w-44" />
              <div className="min-w-0 flex-1">
                <Link href={`/property/${d.property?.slug}`} className="text-lg font-semibold hover:text-brand-700">
                  {d.property?.name}
                </Link>
                <p className="mt-0.5 flex items-start gap-1 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {d.property?.addressLine}
                  {d.property?.landmark ? `, near ${d.property.landmark}` : ""}, {d.property?.city} {d.property?.postalCode}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {roomTitle} · {d.room?.isAC ? "AC" : "Non-AC"} · {b.unit === "ROOM" ? "Entire room" : `${b.bedsCount} bed${b.bedsCount > 1 ? "s" : ""}`}
                  {d.beds.length > 0 && b.unit === "BED" && ` (Bed ${d.beds.map((x) => x.bedNumber).join(", ")})`}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {d.property?.latitude != null && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${d.property.latitude},${d.property.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                      <Navigation className="h-4 w-4" aria-hidden /> Directions
                    </a>
                  )}
                  {d.property?.contactPhone && (
                    <a href={`tel:${d.property.contactPhone}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                      <Phone className="h-4 w-4" aria-hidden /> Call property
                    </a>
                  )}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-slate-100 p-5 text-sm sm:grid-cols-4">
              <div>
                <dt className="flex items-center gap-1 text-xs text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Check-in
                </dt>
                <dd className="font-semibold">{prettyDate(b.checkIn)}</dd>
                <dd className="text-xs text-slate-500">from {d.property?.checkInTime}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Check-out
                </dt>
                <dd className="font-semibold">{prettyDate(b.checkOut)}</dd>
                <dd className="text-xs text-slate-500">by {d.property?.checkOutTime}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Duration</dt>
                <dd className="font-semibold">
                  {b.nights} night{b.nights > 1 ? "s" : ""}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" aria-hidden /> Guests
                </dt>
                <dd className="font-semibold">
                  {b.adults} adult{b.adults > 1 ? "s" : ""}
                  {b.children ? `, ${b.children} child${b.children > 1 ? "ren" : ""}` : ""}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 p-5">
              {modifiable && (
                <ModifyBookingButton
                  booking={{ id: b.id, unit: b.unit, checkIn: b.checkIn, checkOut: b.checkOut, roomId: d.room?.id ?? "", bedsCount: b.bedsCount, adults: b.adults, children: b.children, services: b.selectedServices, isAC: Boolean(d.room?.isAC), category: d.room?.category ?? "SHARED" }}
                  guests={d.guests.map((g) => ({ id: g.id, name: g.name, isPrimary: g.isPrimary }))}
                  canPreCheckIn={b.status !== "CHECKED_IN"}
                />
              )}
              {cancellable && <CancelBookingButton bookingId={b.id} />}
              {canReview && d.property && <ReviewForm bookingId={b.id} propertyName={d.property.name} />}
              {canRequestRefund && <RefundRequestButton bookingId={b.id} max={refundable} />}
              {(d.latestInvoice || ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT", "COMPLETED"].includes(b.status)) && (
                <a href={`/api/bookings/${b.id}/invoice`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
                  <Download className="h-4 w-4" aria-hidden /> Invoice (PDF)
                </a>
              )}
              <BookingTicketButton bookingId={b.id} />
            </div>
          </Card>

          {pendingMods.length > 0 && (
            <Card>
              <CardHeader title="Pending changes" />
              <CardBody className="space-y-3">
                {pendingMods.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <div>
                      <p className="font-semibold">{MOD_LABEL[m.type]}</p>
                      <p className="text-xs text-slate-500">
                        {m.type === "EXTEND_STAY" && `New check-out ${String((m.payload as { newCheckOut?: string }).newCheckOut ?? "")} · `}
                        {m.priceDiff > 0 ? `Extra ${formatINR(m.priceDiff)}` : m.priceDiff < 0 ? `Refund ${formatINR(-m.priceDiff)}` : "No price change"} · requested {prettyDateTime(m.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={m.status} />
                      {m.status === "AWAITING_PAYMENT" && m.priceDiff > 0 && <PayModificationButton bookingId={b.id} modificationId={m.id} amount={m.priceDiff} />}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Guests" />
            <CardBody>
              <ul className="divide-y divide-slate-100">
                {d.guests.map((g) => (
                  <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-medium">{g.name}</span> {g.isPrimary && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">Primary</span>}
                    </span>
                    <span className="text-xs text-slate-500">{[g.gender ? humanize(g.gender) : null, g.age ? `${g.age} yrs` : null, g.phone].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
              {b.specialRequests && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Special requests: {b.specialRequests}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Price breakdown" />
            <CardBody>
              <PriceBreakdown lines={b.priceBreakdown.lines} total={b.totalAmount} paid={b.paidAmount} refunded={b.refundedAmount} />
              {b.couponCode && <p className="mt-3 text-xs text-emerald-700">Coupon {b.couponCode} applied</p>}
              {b.payAtProperty && <p className="mt-3 text-xs text-amber-700">Pay at property — settle the balance at check-in.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payments & refunds" />
            <CardBody>
              {d.payments.length === 0 && d.refunds.length === 0 ? (
                <p className="text-sm text-slate-500">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {d.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span>
                        <span className="font-medium">{humanize(p.purpose)}</span>
                        <span className="block text-xs text-slate-500">
                          {p.method !== "UNKNOWN" ? humanize(p.method) : p.provider} · {prettyDateTime(p.capturedAt ?? p.createdAt)}
                          {p.providerPaymentId ? ` · ${p.providerPaymentId}` : ""}
                          {p.failureReason ? ` · ${p.failureReason}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{formatINR(p.amount)}</span>
                        <StatusBadge status={p.status} />
                      </span>
                    </li>
                  ))}
                  {d.refunds.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span>
                        <span className="font-medium">Refund · {humanize(r.kind)}</span>
                        <span className="block text-xs text-slate-500">
                          {r.reason} · {prettyDateTime(r.createdAt)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-violet-700">{formatINR(r.amount)}</span>
                        <StatusBadge status={r.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Cancellation policy" />
            <CardBody>
              {b.cancellationPolicy?.tiers?.length ? <PolicyTiers tiers={b.cancellationPolicy.tiers} name={b.cancellationPolicy.name} description={b.cancellationPolicy.description} /> : <p className="text-sm text-slate-500">Standard policy applies.</p>}
              {b.nonRefundable && <p className="mt-2 text-sm font-medium text-amber-700">This booking was made at a non-refundable rate.</p>}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {qr && (
            <Card className="text-center">
              <CardBody>
                <p className="font-semibold">Check-in QR</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={`Check-in QR code for booking ${b.bookingNumber}`} width={200} height={200} className="mx-auto mt-2" />
                <p className="mt-2 text-xs text-slate-500">Show this at the front desk. Carry a government ID.</p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Status timeline" />
            <CardBody>
              <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
                {d.statusHistory.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-2 ring-brand-100" aria-hidden />
                    <p className="text-sm font-semibold">{humanize(h.toStatus)}</p>
                    {h.note && <p className="text-xs text-slate-500">{h.note}</p>}
                    <p className="text-[11px] text-slate-400">{prettyDateTime(h.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
          {d.invoices.length > 0 && (
            <Card>
              <CardHeader title="Invoices" />
              <CardBody className="space-y-2 text-sm">
                {d.invoices.map((i) => (
                  <p key={i.id} className="flex justify-between">
                    <span>
                      {i.invoiceNumber} <span className="text-xs text-slate-400">· {humanize(i.kind)}</span>
                    </span>
                    <span className="tabular-nums">{formatINR(i.total)}</span>
                  </p>
                ))}
                <a href={`/api/bookings/${b.id}/invoice`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                  <Download className="h-4 w-4" aria-hidden /> Download latest
                </a>
              </CardBody>
            </Card>
          )}
          {d.review && (
            <Card>
              <CardBody className="text-sm">
                <p className="font-semibold">Your review</p>
                <p className="mt-1 text-slate-600">
                  {d.review.overall}/5 · <StatusBadge status={d.review.status} />
                </p>
                <Link href="/account/reviews" className="mt-2 inline-block font-medium text-brand-700 hover:underline">
                  See my reviews
                </Link>
              </CardBody>
            </Card>
          )}
          {d.tickets.length > 0 && (
            <Card>
              <CardHeader title="Support tickets" />
              <CardBody className="space-y-2 text-sm">
                {d.tickets.map((t) => (
                  <Link key={t.id} href={`/account/support/${t.id}`} className="flex items-center justify-between gap-2 hover:text-brand-700">
                    <span className="truncate">
                      {t.ticketNumber} · {t.subject}
                    </span>
                    <StatusBadge status={t.status} />
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
          <LinkButton href="/account/bookings" variant="outline" className="w-full">
            Back to bookings
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
