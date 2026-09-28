"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { call, useAction } from "./common";
import { humanize } from "./format";
import { Uploader } from "./property-assets";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const { run, pending } = useAction();
  return (
    <Button variant="outline" disabled={disabled} loading={pending === "all"} onClick={() => run("all", () => call("/api/owner/notifications", "POST", { all: true }), { success: "All caught up" })}>
      <CheckCheck className="h-4 w-4" /> Mark all read
    </Button>
  );
}

export function MarkRead({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <button type="button" disabled={pending === id} onClick={() => run(id, () => call("/api/owner/notifications", "POST", { ids: [id] }))} className="text-xs font-medium text-brand-700 hover:underline">
      Mark read
    </button>
  );
}

const CATEGORIES = ["OWNER_PAYOUT", "PAYMENT", "BOOKING", "CHECK_IN", "PROPERTY_ISSUE", "ROOM_ISSUE", "REFUND", "SAFETY", "TECHNICAL", "OTHER"];

export function NewTicketButton({ properties }: { properties: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ category: "OWNER_PAYOUT", subject: "", description: "", priority: "MEDIUM", propertyId: "", bookingNumber: "" });
  const [files, setFiles] = useState<{ id: string; fileName: string }[]>([]);
  const { run, pending } = useAction();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New ticket
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Contact StayShare partner support"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending === "t"}
              onClick={async () => {
                if (v.subject.trim().length < 5) return toast.error("Subject must be at least 5 characters");
                if (v.description.trim().length < 10) return toast.error("Describe the issue (at least 10 characters)");
                const r = await run("t", () => call<{ id: string; ticketNumber: string }>("/api/owner/tickets", "POST", { ...v, attachments: files.map((f) => f.id) }), { refresh: false });
                if (r) {
                  toast.success(`Ticket ${r.ticketNumber} created`);
                  setOpen(false);
                  router.push(`/owner/support/${r.id}`);
                }
              }}
            >
              Submit ticket
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            {(p) => (
              <Select {...p} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Priority">
            {(p) => (
              <Select {...p} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Property (optional)">
            {(p) => (
              <Select {...p} value={v.propertyId} onChange={(e) => setV({ ...v, propertyId: e.target.value })}>
                <option value="">—</option>
                {properties.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Booking number (optional)">
            {(p) => <Input {...p} value={v.bookingNumber} onChange={(e) => setV({ ...v, bookingNumber: e.target.value.toUpperCase() })} placeholder="SS-HYD-2026-000001" />}
          </Field>
          <Field label="Subject" required className="sm:col-span-2">
            {(p) => <Input {...p} value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} maxLength={150} />}
          </Field>
          <Field label="Description" required className="sm:col-span-2">
            {(p) => <Textarea {...p} rows={5} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={5000} />}
          </Field>
          <div className="sm:col-span-2">
            <Uploader purpose="TICKET_ATTACHMENT" accept="image/jpeg,image/png,image/webp,application/pdf" label="Attach files" disabled={files.length >= 5} onUploaded={(f) => setFiles((x) => [...x, f])} />
            {files.length > 0 && <p className="mt-2 text-xs text-slate-600">Attached: {files.map((f) => f.fileName).join(", ")}</p>}
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function TicketReply({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const [body, setBody] = useState("");
  const { run, pending } = useAction();
  if (closed) return <p className="text-sm text-slate-500">This ticket is closed. Raise a new ticket if you need more help.</p>;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("m", () => call(`/api/owner/tickets/${ticketId}/messages`, "POST", { body }), { success: "Message sent" });
        if (r) setBody("");
      }}
    >
      <label htmlFor="ticket-reply" className="text-sm font-medium text-slate-700">
        Reply
      </label>
      <Textarea id="ticket-reply" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending === "m"} disabled={!body.trim()}>
          <Send className="h-4 w-4" /> Send
        </Button>
      </div>
    </form>
  );
}

export function ProfileForm({ name, phone, email }: { name: string; phone: string | null; email: string | null }) {
  const [v, setV] = useState({ name, phone: phone ?? "" });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const { run, pending } = useAction();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-4 text-base font-semibold">Profile</h2>
        <div className="space-y-3">
          <Field label="Full name" required>
            {(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} />}
          </Field>
          <Field label="Mobile" hint="Changing your number requires re-verification">
            {(p) => <Input {...p} type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />}
          </Field>
          <Field label="Email" hint="Contact support to change your login email">
            {(p) => <Input {...p} value={email ?? ""} disabled />}
          </Field>
          <div className="flex justify-end">
            <Button loading={pending === "p"} onClick={() => (v.name.trim().length < 2 ? toast.error("Enter your name") : run("p", () => call("/api/owner/profile", "PATCH", v), { success: "Profile saved" }))}>
              Save profile
            </Button>
          </div>
        </div>
      </section>
      <section className="card p-5">
        <h2 className="mb-4 text-base font-semibold">Change password</h2>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.newPassword !== pw.confirm) return toast.error("New passwords don't match");
            const r = await run("pw", () => call("/api/owner/profile/password", "POST", { currentPassword: pw.currentPassword, newPassword: pw.newPassword }), { success: "Password changed — other devices were signed out" });
            if (r) setPw({ currentPassword: "", newPassword: "", confirm: "" });
          }}
        >
          <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}</Field>
          <Field label="New password" hint="At least 8 characters with upper & lower case letters, a number and a symbol.">
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}
          </Field>
          <Field label="Confirm new password">{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}</Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending === "pw"} disabled={!pw.currentPassword || !pw.newPassword}>
              Change password
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function LogoutAllButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await call("/api/auth/logout-all");
          window.location.href = "/login";
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed");
          setBusy(false);
        }
      }}
    >
      Sign out of all devices
    </Button>
  );
}
