import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { CalendarDays, CheckCircle2, Download, MapPin, XCircle } from "lucide-react";
import { pageUser } from "@/lib/auth/page";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { AppError } from "@/lib/errors";
import { getBookingDetail } from "@/lib/site/bookings";
import { CATEGORY_LABEL } from "@/lib/site/labels";
import { EmptyState, LinkButton } from "@/components/ui";
import { PriceBreakdown } from "@/components/site/price-breakdown";
import { HoldCountdown } from "@/components/site/countdown";
import { RetryPaymentButton, StatusPoller } from "@/components/site/booking-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Booking status", robots: { index: false } };

const PENDING = ["DRAFT", "INVENTORY_LOCKED", "PAYMENT_PENDING"];
const OK = ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT", "COMPLETED"];

export default async function BookingStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser({ next: `/booking/${id}/status` });
  let d;
  try {
    d = await getBookingDetail(id, user.id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) {
      return (
        <div className="container-page py-12">
          <EmptyState title="Booking not found" action={<LinkButton href="/account/bookings">My bookings</LinkButton>} />
        </div>
      );
    }
    throw e;
  }
  const b = d.booking;
  const lastPay = d.payments.find((p) => p.purpose === "BOOKING") ?? null;
  const holdValid = Boolean(b.lockExpiresAt && new Date(b.lockExpiresAt) > new Date());
  const failed = (PENDING.includes(b.status) && lastPay?.status === "FAILED") || b.status === "REJECTED" || (b.status === "CANCELLED" && b.paidAmount === 0 && !d.cancellation);
  const ok = OK.includes(b.status);
  const qr = ok && b.qrToken ? await QRCode.toDataURL(b.qrToken, { margin: 1, width: 240, color: { dark: "#13201e", light: "#ffffff" } }) : null;
  const roomTitle = d.room ? (d.room.name ?? `${CATEGORY_LABEL[d.room.category]} · Room ${d.room.roomNumber}`) : "";

  return (
    <div className="container-page max-w-3xl py-8">
      {ok ? (
        <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-emerald-500 to-brand-700 p-6 text-center text-white sm:p-8">
            <CheckCircle2 className="mx-auto h-14 w-14" aria-hidden />
            <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">Booking confirmed!</h1>
            <p className="mt-1 text-white/90">
              Booking number <span className="font-mono font-bold">{b.bookingNumber}</span>
            </p>
            <p className="mt-1 text-sm text-white/80">We&apos;ve sent the details to your email/phone and notifications.</p>
          </div>
          <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8">
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold">{d.property?.name}</p>
                <p className="flex items-start gap-1 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {d.property?.addressLine}, {d.property?.city}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {roomTitle} · {b.unit === "ROOM" ? "Entire room" : `${b.bedsCount} bed${b.bedsCount > 1 ? "s" : ""}`}
                  {d.beds.length > 0 && b.unit === "BED" && ` (Bed ${d.beds.map((x) => x.bedNumber).join(", ")})`}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
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
                  <dt className="text-xs text-slate-500">Guests</dt>
                  <dd className="font-semibold">
                    {b.adults + b.children} · {b.nights} night{b.nights > 1 ? "s" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{b.payAtProperty ? "Pay at property" : "Paid"}</dt>
                  <dd className="font-semibold">{formatINR(b.payAtProperty ? b.totalAmount : b.paidAmount)}</dd>
                  {!b.payAtProperty && b.totalAmount > b.paidAmount && <dd className="text-xs text-amber-700">Balance {formatINR(b.totalAmount - b.paidAmount)}</dd>}
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/account/bookings/${b.id}`}>View booking</LinkButton>
                <a href={`/api/bookings/${b.id}/invoice`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
                  <Download className="h-4 w-4" aria-hidden /> Invoice (PDF)
                </a>
              </div>
            </div>
            {qr && (
              <figure className="flex flex-col items-center rounded-2xl border border-slate-200 p-4 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={`Check-in QR code for booking ${b.bookingNumber}`} width={180} height={180} />
                <figcaption className="mt-2 max-w-[11rem] text-xs text-slate-500">Show this QR code at the front desk for a quick check-in</figcaption>
              </figure>
            )}
          </div>
          <div className="border-t border-slate-100 p-6 sm:p-8">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">Price breakdown</summary>
              <PriceBreakdown className="mt-3" lines={b.priceBreakdown.lines} total={b.totalAmount} paid={b.paidAmount} />
            </details>
          </div>
        </div>
      ) : failed ? (
        <div className="rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm sm:p-10">
          <XCircle className="mx-auto h-14 w-14 text-red-500" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold">Payment {b.status === "REJECTED" ? "couldn't be applied" : "failed"}</h1>
          <p className="mt-2 text-slate-600">
            {b.status === "REJECTED"
              ? "Your payment arrived after the beds were released, so we couldn't confirm this booking. A full refund has been started automatically."
              : lastPay?.failureReason ?? "Your payment did not go through. No money was taken — or, if it was, it will be refunded automatically."}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Booking {b.bookingNumber} · {d.property?.name}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {PENDING.includes(b.status) && holdValid ? (
              <>
                <HoldCountdown until={b.lockExpiresAt} />
                <RetryPaymentButton bookingId={b.id} />
              </>
            ) : (
              <LinkButton href={d.property ? `/property/${d.property.slug}?checkIn=${b.checkIn}&checkOut=${b.checkOut}` : "/search"} variant="accent" size="lg">
                Start a new booking
              </LinkButton>
            )}
            <Link href="/account/bookings" className="text-sm font-medium text-brand-700 hover:underline">
              Go to my bookings
            </Link>
          </div>
        </div>
      ) : PENDING.includes(b.status) ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <StatusPoller bookingId={b.id} status={b.status} lastPaymentStatus={lastPay?.status ?? null} />
          <div className="mt-6 flex flex-col items-center gap-3">
            <HoldCountdown until={b.lockExpiresAt} />
            {lastPay && ["CREATED", "PENDING"].includes(lastPay.status) && holdValid && <RetryPaymentButton bookingId={b.id} label="Open payment again" />}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Booking {b.bookingNumber}</h1>
          <p className="mt-2 text-slate-600">This booking is {b.status.replace(/_/g, " ").toLowerCase()}{b.cancelledAt ? ` since ${prettyDateTime(b.cancelledAt)}` : ""}.</p>
          <div className="mt-4">
            <LinkButton href={`/account/bookings/${b.id}`}>View details</LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}
