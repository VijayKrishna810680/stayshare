"use client";
import Link from "next/link";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { OPEN_CHAT_EVENT } from "./mobile-nav";
import { TicketForm } from "./ticket-form";

export function OpenChatButton() {
  return (
    <Button onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))}>
      <MessageCircle className="h-4 w-4" aria-hidden /> Start live chat
    </Button>
  );
}

/** Logged-in → support ticket. Visitors → starts a live-chat conversation with their message. */
export function ContactForm({ loggedIn, bookings, chatEnabled }: { loggedIn: boolean; bookings: { id: string; bookingNumber: string; propertyName: string }[]; chatEnabled: boolean }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (loggedIn) return <TicketForm bookings={bookings} defaultCategory="OTHER" />;
  if (!chatEnabled)
    return (
      <Alert tone="info">
        Please <Link href="/login?next=/contact" className="font-semibold underline">log in</Link> to raise a support ticket.
      </Alert>
    );
  if (sent)
    return (
      <Alert tone="success" title="Message sent">
        Our team will reply shortly. Keep an eye on the chat window (bottom-right) — you can continue the conversation there.
      </Alert>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await apiFetch("/api/chat", { method: "POST", json: { name: name.trim(), contact: contact.trim() } });
          await apiFetch("/api/chat/messages", { method: "POST", json: { body: msg.trim() } });
          setSent(true);
          toast.success("Message sent to StayShare support");
          window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ct-name">Your name</Label>
          <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="ct-contact">Phone or email</Label>
          <Input id="ct-contact" value={contact} onChange={(e) => setContact(e.target.value)} required minLength={5} maxLength={120} />
        </div>
      </div>
      <div>
        <Label htmlFor="ct-msg">How can we help?</Label>
        <Textarea id="ct-msg" value={msg} onChange={(e) => setMsg(e.target.value)} required minLength={5} maxLength={4000} rows={5} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          Send message
        </Button>
      </div>
    </form>
  );
}
