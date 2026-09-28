"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { formatINR } from "@/lib/money";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { useAdminAction } from "./step-up";

type Calc = { refundBps: number; refundableBase: number; stayRefund: number; depositRefund: number; convenienceRefund: number; totalRefund: number; retained: number };

/** Admin cancellation with live refund preview and optional refund-percentage override. */
export function CancelBookingButton({ bookingId, bookingNumber }: { bookingId: string; bookingNumber: string }) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [data, setData] = useState<{ policy: Calc; preview: Calc; paidAmount: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { exec, busy } = useAdminAction();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const bps = override === "" ? "" : String(Math.round(Number(override) * 100));
      apiFetch<{ policy: Calc; preview: Calc; paidAmount: number }>(`/api/admin/bookings/${bookingId}/cancel?overrideBps=${bps}`)
        .then((d) => {
          setData(d);
          setErr(null);
        })
        .catch((e) => setErr((e as Error).message));
    }, 250);
    return () => clearTimeout(t);
  }, [open, override, bookingId]);
  const submit = async () => {
    const out = await exec(() => apiFetch(`/api/admin/bookings/${bookingId}/cancel`, { method: "POST", json: { reason, adminNotes: notes || null, overrideRefundBps: override === "" ? null : Math.round(Number(override) * 100) } }), { success: "Booking cancelled — refund initiated where applicable" });
    if (out !== undefined) setOpen(false);
  };
  const c = data?.preview;
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel ${bookingNumber}`}
        description="Cancels as administrator, releases inventory and refunds per policy or your override."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button variant="danger" onClick={submit} loading={busy} disabled={reason.trim().length < 3}>
              Cancel & refund {c ? formatINR(c.totalRefund) : ""}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <Alert tone="error">{err}</Alert>}
          {c && (
            <dl className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <dt className="text-slate-500">Paid</dt>
              <dd className="text-right tabular-nums">{formatINR(data!.paidAmount)}</dd>
              <dt className="text-slate-500">Policy refund</dt>
              <dd className="text-right tabular-nums">
                {data!.policy.refundBps / 100}% → {formatINR(data!.policy.totalRefund)}
              </dd>
              <dt className="text-slate-500">Stay refund ({c.refundBps / 100}%)</dt>
              <dd className="text-right tabular-nums">{formatINR(c.stayRefund)}</dd>
              <dt className="text-slate-500">Deposit refund</dt>
              <dd className="text-right tabular-nums">{formatINR(c.depositRefund)}</dd>
              <dt className="text-slate-500">Convenience fee refund</dt>
              <dd className="text-right tabular-nums">{formatINR(c.convenienceRefund)}</dd>
              <dt className="font-semibold">Total refund</dt>
              <dd className="text-right font-semibold tabular-nums">{formatINR(c.totalRefund)}</dd>
              <dt className="text-slate-500">Retained</dt>
              <dd className="text-right tabular-nums">{formatINR(c.retained)}</dd>
            </dl>
          )}
          <div>
            <Label htmlFor="cb-ov">Override refund % of stay amount (optional)</Label>
            <Input id="cb-ov" type="number" min={0} max={100} step="1" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Leave blank to apply the policy" />
          </div>
          <div>
            <Label htmlFor="cb-r">
              Reason <span className="text-red-600">*</span>
            </Label>
            <Input id="cb-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Property unavailable — relocated guest" />
          </div>
          <div>
            <Label htmlFor="cb-n">Internal notes</Label>
            <Textarea id="cb-n" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
          </div>
        </div>
      </Dialog>
    </>
  );
}
