"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquare, Send, Ticket, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { Badge, Button, EmptyState, Input, Label, Select, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

type Conv = { id: string; status: string; visitorName: string | null; visitorContact: string | null; userName: string | null; userEmail: string | null; lastMessageAt: string; unread: number };
type Msg = { id: string; body: string; fromAgent: boolean; createdAt: string; authorName: string | null };

const who = (c: Conv) => c.userName ?? c.visitorName ?? "Visitor";
const time = (s: string) => new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Support inbox: conversation list (refreshes every 10 s) + thread polling every 4 s via ?after=. */
export function ChatInbox({ canTicket }: { canTicket: boolean }) {
  const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [tk, setTk] = useState({ subject: "", category: "OTHER", priority: "MEDIUM" });
  const lastRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      setConvs(await apiFetch<Conv[]>(`/api/admin/chat?status=${status}`));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [status]);
  useEffect(() => {
    void loadList();
    const t = setInterval(loadList, 10_000);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    lastRef.current = null;
    setMsgs([]);
    const poll = async () => {
      try {
        const after = lastRef.current ? `?after=${encodeURIComponent(lastRef.current)}` : "";
        const out = await apiFetch<Msg[]>(`/api/admin/chat/${active}${after}`);
        if (stop || !out.length) return;
        lastRef.current = out[out.length - 1]!.createdAt;
        setMsgs((m) => {
          const seen = new Set(m.map((x) => x.id));
          return [...m, ...out.filter((x) => !seen.has(x.id))];
        });
        setConvs((cs) => cs?.map((c) => (c.id === active ? { ...c, unread: 0 } : c)) ?? cs);
      } catch {
        /* transient */
      }
    };
    void poll();
    const t = setInterval(poll, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [active]);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [msgs.length]);

  const conv = convs?.find((c) => c.id === active) ?? null;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    setSending(true);
    try {
      const m = await apiFetch<Msg>(`/api/admin/chat/${active}`, { method: "POST", json: { body: text } });
      setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
      lastRef.current = m.createdAt;
      setText("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  const setConvStatus = async (s: "OPEN" | "CLOSED") => {
    if (!active) return;
    try {
      await apiFetch(`/api/admin/chat/${active}`, { method: "PATCH", json: { status: s } });
      toast.success(s === "CLOSED" ? "Conversation closed" : "Conversation reopened");
      setActive(null);
      void loadList();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const toTicket = async () => {
    try {
      const t = await apiFetch<{ id: string; ticketNumber: string }>(`/api/admin/chat/${active}/ticket`, { method: "POST", json: tk });
      toast.success(`Ticket ${t.ticketNumber} created`);
      setTicketOpen(false);
      window.location.href = `/admin/support/${t.id}`;
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="grid h-[calc(100vh-13rem)] min-h-[480px] gap-4 lg:grid-cols-[320px_1fr]">
      <div className={cn("card flex flex-col overflow-hidden", active && "hidden lg:flex")}>
        <div className="flex gap-1 border-b border-slate-100 p-2" role="tablist">
          {(["OPEN", "CLOSED"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)} className={cn("flex-1 rounded-lg px-3 py-1.5 text-sm", status === s ? "bg-slate-900 text-white" : "hover:bg-slate-100")}>
              {s === "OPEN" ? "Open" : "Closed"}
            </button>
          ))}
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {convs === null && <li className="p-4 text-sm text-slate-500">Loading…</li>}
          {convs?.length === 0 && <li className="p-4 text-sm text-slate-500">No {status.toLowerCase()} conversations.</li>}
          {convs?.map((c) => (
            <li key={c.id}>
              <button onClick={() => setActive(c.id)} className={cn("flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-slate-50", active === c.id && "bg-slate-100")}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">{who(c).charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{who(c)}</span>
                    {c.unread > 0 && <span className="rounded-full bg-accent-500 px-1.5 text-xs font-semibold text-white">{c.unread}</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{c.userEmail ?? c.visitorContact ?? (c.userName ? "Registered user" : "Anonymous visitor")}</span>
                  <span className="block text-[11px] text-slate-400">{time(c.lastMessageAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("card flex min-h-0 flex-col overflow-hidden", !active && "hidden lg:flex")}>
        {!active || !conv ? (
          <div className="grid flex-1 place-items-center p-6">
            <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Select a conversation" description="New messages appear automatically. Replies are delivered to the customer's chat widget." className="border-0" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <button className="rounded-lg p-1 hover:bg-slate-100 lg:hidden" onClick={() => setActive(null)} aria-label="Back to list">
                <X className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{who(conv)}</p>
                <p className="truncate text-xs text-slate-500">{conv.userEmail ?? conv.visitorContact ?? ""}</p>
              </div>
              <Badge tone={conv.status === "OPEN" ? "green" : "slate"}>{conv.status.toLowerCase()}</Badge>
              {canTicket && (
                <Button size="sm" variant="outline" onClick={() => setTicketOpen(true)}>
                  <Ticket className="h-4 w-4" /> Convert to ticket
                </Button>
              )}
              {conv.status === "OPEN" ? (
                <Button size="sm" variant="outline" onClick={() => setConvStatus("CLOSED")}>
                  Close
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConvStatus("OPEN")}>
                  Reopen
                </Button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
              {msgs.map((m) => (
                <div key={m.id} className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.fromAgent ? "ml-auto bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200")}>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className={cn("mt-1 text-[10px]", m.fromAgent ? "text-white/60" : "text-slate-400")}>
                    {m.fromAgent ? (m.authorName ?? "StayShare") : who(conv)} · {time(m.createdAt)}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-100 p-3">
              <label htmlFor="chat-reply" className="sr-only">
                Reply
              </label>
              <Textarea
                id="chat-reply"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                className="min-h-12 flex-1"
              />
              <Button type="submit" loading={sending} disabled={!text.trim()} aria-label="Send reply">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        )}
      </div>
      <Dialog
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        title="Convert chat to ticket"
        description="Creates a support ticket for this user with the full chat transcript."
        footer={
          <>
            <Button variant="outline" onClick={() => setTicketOpen(false)}>
              Cancel
            </Button>
            <Button onClick={toTicket} disabled={tk.subject.trim().length < 3}>
              Create ticket
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="ct-s">Subject</Label>
            <Input id="ct-s" value={tk.subject} onChange={(e) => setTk({ ...tk, subject: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ct-c">Category</Label>
              <Select id="ct-c" value={tk.category} onChange={(e) => setTk({ ...tk, category: e.target.value })}>
                {["BOOKING", "PAYMENT", "REFUND", "CHECK_IN", "PROPERTY_ISSUE", "SAFETY", "ROOM_ISSUE", "OWNER_PAYOUT", "TECHNICAL", "OTHER"].map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ").toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ct-p">Priority</Label>
              <Select id="ct-p" value={tk.priority} onChange={(e) => setTk({ ...tk, priority: e.target.value })}>
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((c) => (
                  <option key={c} value={c}>
                    {c.toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Existing tickets: <Link href="/admin/support" className="underline">Support tickets</Link>
          </p>
        </div>
      </Dialog>
    </div>
  );
}
