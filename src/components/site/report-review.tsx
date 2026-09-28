"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiClientError } from "@/lib/client-api";
import { Dialog } from "@/components/ui/dialog";
import { Button, Select, Textarea } from "@/components/ui";

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Inappropriate or offensive");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await apiFetch(`/api/reviews/${reviewId}/report`, { method: "POST", json: { reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason } });
      toast.success("Thanks — our moderation team will review this.");
      setDone(true);
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" disabled={done} onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50">
        <Flag className="h-3.5 w-3.5" aria-hidden /> {done ? "Reported" : "Report"}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report this review"
        description="Tell us what's wrong. Reports are confidential."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={submit}>
              Report review
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Reason
            <Select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1">
              <option>Inappropriate or offensive</option>
              <option>Spam or advertising</option>
              <option>Fake or not a real stay</option>
              <option>Contains personal information</option>
              <option>Other</option>
            </Select>
          </label>
          <label className="block text-sm font-medium">
            Details (optional)
            <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={400} className="mt-1" />
          </label>
        </div>
      </Dialog>
    </>
  );
}
