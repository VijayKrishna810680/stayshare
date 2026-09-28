"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Button, EmptyState, ErrorState, TableSkeleton } from "@/components/ui";

type N = { id: string; title: string; body: string; template: string; data: Record<string, unknown>; readAt: string | null; createdAt: string };
type Res = { items: N[]; unread: number; total: number; page: number; pageSize: number };

export function NotificationsList() {
  const router = useRouter();
  const [data, setData] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setErr(null);
      setData(await apiFetch<Res>(`/api/notifications?page=${page}${unreadOnly ? "&unread=1" : ""}`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [page, unreadOnly]);
  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(ids?: string[]) {
    setBusy(true);
    try {
      await apiFetch("/api/notifications/read", { method: "POST", json: ids ? { ids } : { all: true } });
      await load();
      router.refresh();
      if (!ids) toast.success("All notifications marked as read");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (err) return <ErrorState description={err} action={<Button onClick={load}>Retry</Button>} />;
  if (!data) return <TableSkeleton rows={5} />;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="tablist">
          {[
            [false, "All"],
            [true, `Unread (${data.unread})`],
          ].map(([v, l]) => (
            <button key={String(v)} role="tab" aria-selected={unreadOnly === v} onClick={() => (setUnreadOnly(v as boolean), setPage(1))} className={cn("rounded-full px-4 py-1.5 text-sm font-medium", unreadOnly === v ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>
              {l as string}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => markRead()} loading={busy} disabled={data.unread === 0}>
          <CheckCheck className="h-4 w-4" aria-hidden /> Mark all as read
        </Button>
      </div>
      {data.items.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={unreadOnly ? "No unread notifications" : "No notifications yet"} description="Booking confirmations, payment updates and offers will appear here." />
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {data.items.map((n) => {
            const bookingId = typeof n.data?.bookingId === "string" && !n.data.owner ? (n.data.bookingId as string) : null;
            return (
              <li key={n.id} className={cn("flex gap-3 p-4", !n.readAt && "bg-brand-50/40")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-500")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", n.readAt ? "text-slate-700" : "font-semibold text-slate-900")}>{n.title}</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{n.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>{new Date(n.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                    {bookingId && (
                      <Link href={`/account/bookings/${bookingId}`} className="font-medium text-brand-700 hover:underline">
                        View booking
                      </Link>
                    )}
                    {!n.readAt && (
                      <button onClick={() => markRead([n.id])} className="font-medium text-slate-600 hover:underline">
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
