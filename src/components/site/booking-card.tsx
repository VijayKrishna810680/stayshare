import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { Img } from "@/components/ui/img";
import { prettyDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { CATEGORY_LABEL } from "@/lib/site/labels";
import type { MyBooking } from "@/lib/site/bookings";

export function BookingCard({ b }: { b: MyBooking }) {
  const pendingPay = ["INVENTORY_LOCKED", "PAYMENT_PENDING", "DRAFT"].includes(b.status);
  return (
    <Link href={pendingPay ? `/booking/${b.id}/status` : `/account/bookings/${b.id}`} className="card group flex gap-4 p-3 transition hover:shadow-md sm:p-4">
      <Img src={b.image} alt="" fallback="/images/placeholder-building.svg" className="h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-36" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{b.propertyName}</p>
            <p className="truncate text-xs text-slate-500">
              {b.city} · {b.roomName ?? `${CATEGORY_LABEL[b.category]} · Room ${b.roomNumber}`} · {b.unit === "ROOM" ? "Entire room" : `${b.bedsCount} bed${b.bedsCount > 1 ? "s" : ""}`}
            </p>
          </div>
          <StatusBadge status={b.status} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
          <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden />
          {prettyDate(b.checkIn)} → {prettyDate(b.checkOut)} · {b.nights} night{b.nights > 1 ? "s" : ""}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="text-xs text-slate-500">
            #{b.bookingNumber} · <span className="font-semibold text-slate-800">{formatINR(b.totalAmount)}</span>
            {b.refundedAmount > 0 && <span className="text-violet-700"> · refunded {formatINR(b.refundedAmount)}</span>}
          </p>
          <span className="inline-flex items-center text-sm font-medium text-brand-700">
            {pendingPay ? "Complete payment" : ["CHECKED_OUT", "COMPLETED"].includes(b.status) && !b.reviewed ? "Write a review" : "Details"}
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
