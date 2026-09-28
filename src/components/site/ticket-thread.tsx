"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, uploadFile } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Alert, Button, Textarea } from "@/components/ui";

type M = { id: string; body: string; attachments: string[]; createdAt: string; mine: boolean; author: string };

export function TicketThread({ ticketId, messages, closed }: { ticketId: string; messages: M[]; closed: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  async function addFile(f?: File) {
    if (!f) return;
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
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/support/tickets/${ticketId}`, { method: "POST", json: { body: body.trim(), attachmentIds: files.map((f) => f.id) } });
      setBody("");
      setFiles([]);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card overflow-hidden">
      <ol className="space-y-4 bg-slate-50 p-4 sm:p-6" aria-label="Conversation">
        {messages.map((m) => (
          <li key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 shadow-sm", m.mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-slate-800")}>
              <p className={cn("text-xs font-semibold", m.mine ? "text-white/80" : "text-brand-700")}>{m.author}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.body}</p>
              {m.attachments.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {m.attachments.map((a, i) => (
                    <li key={a}>
                      <a href={a} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs underline", m.mine ? "bg-white/15" : "bg-slate-100")}>
                        <Paperclip className="h-3 w-3" aria-hidden /> Attachment {i + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <p className={cn("mt-1 text-[11px]", m.mine ? "text-white/70" : "text-slate-400")}>{new Date(m.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
          </li>
        ))}
      </ol>
      {closed ? (
        <div className="p-4">
          <Alert tone="info">This ticket is closed. If you still need help, please raise a new ticket.</Alert>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-2 border-t border-slate-200 p-4">
          <label htmlFor="reply" className="sr-only">
            Reply
          </label>
          <Textarea id="reply" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" rows={3} maxLength={5000} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {files.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {f.name}
                  <button type="button" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} aria-label={`Remove ${f.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-600 hover:text-brand-700">
                <Paperclip className="h-4 w-4" aria-hidden /> {uploading ? "Uploading…" : "Attach"}
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" disabled={uploading} onChange={(e) => (addFile(e.target.files?.[0]), (e.target.value = ""))} />
              </label>
            </div>
            <Button type="submit" loading={busy} disabled={!body.trim() || uploading}>
              <Send className="h-4 w-4" aria-hidden /> Send
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
