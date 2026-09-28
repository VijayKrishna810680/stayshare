"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Headset, Loader2, Mail, MessageCircle, Phone, Send, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { WhatsAppIcon } from "./icons";
import { OPEN_CHAT_EVENT } from "./mobile-nav";

type Msg = { id: string; body: string; fromAgent: boolean; createdAt: string; authorName: string | null };
type Contacts = { email: string | null; phone: string | null; whatsapp: string | null; liveChat: boolean; hours: string | null };

/**
 * Floating support cluster: live chat (polling every 4s) plus WhatsApp / call / email shortcuts that
 * only render when the admin has configured those contacts.
 */
export function SupportWidget({ contacts, loggedIn }: { contacts: Contacts; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [conv, setConv] = useState<{ id: string; status: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<string | null>(null);
  const hasExtras = Boolean(contacts.whatsapp || contacts.phone || contacts.email);

  const merge = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMsgs((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !ids.has(m.id))];
      lastRef.current = next[next.length - 1]?.createdAt ?? lastRef.current;
      return next;
    });
  }, []);

  // open from the mobile bottom nav
  useEffect(() => {
    const h = () => {
      setMenu(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, h);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, h);
  }, []);

  // load existing conversation when opened
  useEffect(() => {
    if (!open || conv) return;
    let cancel = false;
    setLoading(true);
    apiFetch<{ conversation: { id: string; status: string } | null; messages: Msg[] }>("/api/chat")
      .then((d) => {
        if (cancel) return;
        if (d.conversation) {
          setConv(d.conversation);
          setMsgs([]);
          lastRef.current = null;
          merge(d.messages);
        }
      })
      .catch(() => {})
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [open, conv, merge]);

  // poll for new messages while open
  useEffect(() => {
    if (!open || !conv) return;
    const t = setInterval(async () => {
      try {
        const q = lastRef.current ? `?after=${encodeURIComponent(lastRef.current)}` : "";
        const d = await apiFetch<{ conversation: { id: string; status: string } | null; messages: Msg[] }>(`/api/chat${q}`);
        if (!d.conversation) setConv(null);
        else merge(d.messages);
      } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [open, conv, merge]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, open]);

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    if (!loggedIn && (name.trim().length < 2 || contact.trim().length < 5)) {
      toast.error("Please share your name and a phone number or email so we can reach you");
      return;
    }
    setStarting(true);
    try {
      const d = await apiFetch<{ conversation: { id: string; status: string }; messages: Msg[] }>("/api/chat", { method: "POST", json: loggedIn ? {} : { name: name.trim(), contact: contact.trim() } });
      setConv(d.conversation);
      setMsgs([]);
      lastRef.current = null;
      merge(d.messages);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const m = await apiFetch<{ id: string; body: string; fromAgent: boolean; createdAt: string }>("/api/chat/messages", { method: "POST", json: { body } });
      merge([{ ...m, authorName: null }]);
      setText("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!contacts.liveChat && !hasExtras) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 lg:bottom-6 lg:right-6">
      {open && contacts.liveChat && (
        <section role="dialog" aria-label="Live chat with StayShare support" className="flex h-[min(34rem,calc(100vh-10rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center gap-3 bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15">
              <Headset className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">StayShare support</p>
              <p className="text-xs text-white/80">{contacts.hours ? `Available ${contacts.hours}` : "We usually reply in a few minutes"}</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/10" aria-label="Close chat">
              <X className="h-5 w-5" />
            </button>
          </header>
          {loading ? (
            <div className="grid flex-1 place-items-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading chat" />
            </div>
          ) : !conv ? (
            <form onSubmit={start} className="flex flex-1 flex-col justify-center gap-3 p-5">
              <p className="text-sm text-slate-600">Hi there! Start a chat and a StayShare support specialist will help you with bookings, payments or anything else.</p>
              {!loggedIn && (
                <>
                  <label className="text-sm font-medium text-slate-700">
                    Your name
                    <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Phone or email
                    <input value={contact} onChange={(e) => setContact(e.target.value)} required minLength={5} maxLength={120} className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
                  </label>
                </>
              )}
              <button type="submit" disabled={starting} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {starting && <Loader2 className="h-4 w-4 animate-spin" />} Start chat
              </button>
            </form>
          ) : (
            <>
              <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
                {msgs.map((m) => (
                  <div key={m.id} className={cn("flex", m.fromAgent ? "justify-start" : "justify-end")}>
                    <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm", m.fromAgent ? "rounded-bl-md bg-white text-slate-800" : "rounded-br-md bg-brand-600 text-white")}>
                      {m.fromAgent && m.authorName && <p className="mb-0.5 text-[11px] font-semibold text-brand-700">{m.authorName}</p>}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={cn("mt-0.5 text-[10px]", m.fromAgent ? "text-slate-400" : "text-white/70")}>{new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 p-2">
                <label className="sr-only" htmlFor="chat-input">
                  Message
                </label>
                <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Type your message…" className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
                <button type="submit" disabled={sending || !text.trim()} className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50" aria-label="Send message">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {menu && !open && hasExtras && (
        <div className="flex flex-col items-end gap-2">
          {contacts.whatsapp && (
            <a href={`https://wa.me/${contacts.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-full bg-white py-2 pl-3 pr-4 text-sm font-medium text-slate-800 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#25D366] text-white">
                <WhatsAppIcon className="h-4 w-4" />
              </span>
              WhatsApp
            </a>
          )}
          {contacts.phone && (
            <a href={`tel:${contacts.phone}`} className="flex items-center gap-2 rounded-full bg-white py-2 pl-3 pr-4 text-sm font-medium text-slate-800 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white">
                <Phone className="h-4 w-4" aria-hidden />
              </span>
              Call support
            </a>
          )}
          {contacts.email && (
            <a href={`mailto:${contacts.email}`} className="flex items-center gap-2 rounded-full bg-white py-2 pl-3 pr-4 text-sm font-medium text-slate-800 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-500 text-white">
                <Mail className="h-4 w-4" aria-hidden />
              </span>
              Email
            </a>
          )}
          {contacts.liveChat && (
            <button onClick={() => (setMenu(false), setOpen(true))} className="flex items-center gap-2 rounded-full bg-white py-2 pl-3 pr-4 text-sm font-medium text-slate-800 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-800 text-white">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </span>
              Live chat
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => {
          if (open) return setOpen(false);
          if (hasExtras) return setMenu((m) => !m);
          setOpen(true);
        }}
        aria-label={open || menu ? "Close support" : "Get help"}
        aria-expanded={open || menu}
        className="grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-900/20 transition hover:scale-105 hover:bg-brand-700"
      >
        {open || menu ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
