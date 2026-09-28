"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Button, Textarea } from "@/components/ui";
import { useAdminAction } from "./step-up";

/** Reply to a support ticket, or add an internal note (not visible to the customer). */
export function TicketReply({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const { exec, busy } = useAdminAction();
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    const out = await exec(() => apiFetch(`/api/admin/support/${ticketId}/messages`, { method: "POST", json: { body, isInternal: internal } }), { success: internal ? "Internal note added" : "Reply sent" });
    if (out !== undefined) setBody("");
  };
  return (
    <form onSubmit={send} className={internal ? "rounded-2xl border border-amber-200 bg-amber-50 p-3" : "rounded-2xl border border-slate-200 bg-white p-3"}>
      <label htmlFor="tr-body" className="sr-only">
        Message
      </label>
      <Textarea id="tr-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? "Internal note — only visible to the StayShare team" : "Write a reply to the customer…"} className="min-h-24 bg-white" />
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note
        </label>
        <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
          <Send className="h-4 w-4" /> {internal ? "Add note" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
