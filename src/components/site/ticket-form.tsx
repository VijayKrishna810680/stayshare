"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, uploadFile } from "@/lib/client-api";
import { TICKET_CATEGORIES } from "@/lib/site/labels";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";

/** Create a support ticket (optionally for a booking) with up to 5 attachments. */
export function TicketForm({ bookings = [], defaultBookingId, defaultCategory = "BOOKING", onDone, redirectToTicket = true }: { bookings?: { id: string; bookingNumber: string; propertyName: string }[]; defaultBookingId?: string; defaultCategory?: string; onDone?: () => void; redirectToTicket?: boolean }) {
  const router = useRouter();
  const [category, setCategory] = useState(defaultCategory);
  const [priority, setPriority] = useState("MEDIUM");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [bookingId, setBookingId] = useState(defaultBookingId ?? "");
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addFile(f: File | undefined) {
    if (!f) return;
    if (files.length >= 5) return toast.error("You can attach up to 5 files");
    setUploading(true);
    try {
      const up = await uploadFile(f, "TICKET_ATTACHMENT");
      setFiles((x) => [...x, { id: up.id, name: up.fileName }]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await apiFetch<{ id: string; ticketNumber: string }>("/api/support/tickets", {
        method: "POST",
        json: { category, priority, subject: subject.trim(), description: description.trim(), bookingId: bookingId || null, attachmentIds: files.map((f) => f.id) },
      });
      toast.success(`Ticket ${t.ticketNumber} created — we'll get back to you soon`);
      onDone?.();
      if (redirectToTicket) router.push(`/account/support/${t.id}`);
      else router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tk-cat">Category</Label>
          <Select id="tk-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="tk-pri">Priority</Label>
          <Select id="tk-pri" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent (safety / can&apos;t check in)</option>
          </Select>
        </div>
      </div>
      {bookings.length > 0 && !defaultBookingId && (
        <div>
          <Label htmlFor="tk-bk">Related booking (optional)</Label>
          <Select id="tk-bk" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
            <option value="">Not about a specific booking</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bookingNumber} · {b.propertyName}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <Label htmlFor="tk-sub">Subject</Label>
        <Input id="tk-sub" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={5} maxLength={140} placeholder="Short summary of the issue" />
      </div>
      <div>
        <Label htmlFor="tk-desc">Describe the issue</Label>
        <Textarea id="tk-desc" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} maxLength={5000} rows={5} placeholder="What happened? Include dates, room numbers or payment references if relevant." />
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {files.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
              <Paperclip className="h-3 w-3" aria-hidden /> {f.name}
              <button type="button" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} aria-label={`Remove ${f.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-400">
            <Paperclip className="h-3.5 w-3.5" aria-hidden /> {uploading ? "Uploading…" : "Attach photo or PDF"}
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" disabled={uploading} onChange={(e) => (addFile(e.target.files?.[0]), (e.target.value = ""))} />
          </label>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={busy} disabled={uploading}>
          Submit ticket
        </Button>
      </div>
    </form>
  );
}
