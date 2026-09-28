"use client";
import { useState } from "react";
import { AlertTriangle, Landmark } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { call, useAction } from "./common";

export function RequestPayoutButton({ eligible, minPayout, canPay, eligibleLabel }: { eligible: number; minPayout: number; canPay: boolean; eligibleLabel: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { run, pending } = useAction();
  const disabled = !canPay || eligible <= 0 || eligible < minPayout;
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled} title={!canPay ? "Add bank or UPI details first" : eligible < minPayout ? "Below minimum payout" : undefined}>
        <Landmark className="h-4 w-4" /> Request payout
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Request payout of ${eligibleLabel}?`}
        description="All earnings that are eligible for settlement are bundled into one payout. The StayShare finance team approves and transfers it to your verified account."
        confirmText="Request payout"
        loading={pending === "po"}
        onConfirm={async () => {
          const r = await run("po", () => call("/api/owner/payouts", "POST", { note: note || undefined }), { success: "Payout requested" });
          if (r) setOpen(false);
        }}
      >
        <label htmlFor="po-note" className="mb-1 block text-sm font-medium text-slate-700">
          Note (optional)
        </label>
        <Textarea id="po-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </ConfirmDialog>
    </>
  );
}

export function DisputeButton({ payoutId, payoutNumber, existing }: { payoutId: string; payoutNumber: string; existing: string | null }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(existing ?? "");
  const { run, pending } = useAction();
  return (
    <>
      <Button size="sm" variant="ghost" className="text-amber-700" onClick={() => setOpen(true)}>
        <AlertTriangle className="h-4 w-4" /> {existing ? "Update dispute" : "Dispute"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Dispute payout ${payoutNumber}`}
        description="Tell the finance team what looks wrong — missing bookings, wrong deductions, amount not received…"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending === "d"}
              disabled={note.trim().length < 10}
              onClick={async () => {
                const r = await run("d", () => call(`/api/owner/payouts/${payoutId}/dispute`, "POST", { note }), { success: "Dispute sent to StayShare finance" });
                if (r) setOpen(false);
              }}
            >
              Send
            </Button>
          </>
        }
      >
        <label htmlFor={`dispute-${payoutId}`} className="sr-only">
          Describe the issue
        </label>
        <Textarea id={`dispute-${payoutId}`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="At least 10 characters" />
      </Dialog>
    </>
  );
}
