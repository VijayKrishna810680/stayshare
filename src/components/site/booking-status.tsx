"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { Button } from "@/components/ui";
import { startPayment, type Checkout } from "./pay";

const PENDING = ["DRAFT", "INVENTORY_LOCKED", "PAYMENT_PENDING"];

/** Polls the booking until payment is confirmed or fails, then re-renders the server page. */
export function StatusPoller({ bookingId, status, lastPaymentStatus }: { bookingId: string; status: string; lastPaymentStatus: string | null }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const d = await apiFetch<{ booking: { status: string }; payments: { purpose: string; status: string }[] }>(`/api/bookings/${bookingId}`);
        const lp = d.payments.find((p) => p.purpose === "BOOKING")?.status ?? null;
        if (d.booking.status !== status || lp !== lastPaymentStatus) {
          clearInterval(t);
          router.refresh();
        }
      } catch {}
      if (Date.now() - started.current > 45_000) setSlow(true);
      if (Date.now() - started.current > 180_000) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [bookingId, status, lastPaymentStatus, router]);
  return (
    <div className="flex flex-col items-center gap-2 text-center" aria-live="polite">
      <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden />
      <p className="font-semibold">Confirming your payment…</p>
      <p className="text-sm text-slate-500">{slow ? "This is taking longer than usual. You can safely leave this page — we'll notify you as soon as it's confirmed." : "This usually takes a few seconds. Please don't close this page."}</p>
      {PENDING.includes(status) && slow && (
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          Check again
        </Button>
      )}
    </div>
  );
}

export function RetryPaymentButton({ bookingId, label = "Retry payment" }: { bookingId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="accent"
      size="lg"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await apiFetch<{ checkout: Checkout }>(`/api/bookings/${bookingId}/pay`, { method: "POST" });
          const res = await startPayment(r.checkout, { doneUrl: `/booking/${bookingId}/status` });
          if (res === "dismissed") toast.info("Payment was not completed");
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!busy && <RotateCcw className="h-4 w-4" aria-hidden />} {label}
    </Button>
  );
}
