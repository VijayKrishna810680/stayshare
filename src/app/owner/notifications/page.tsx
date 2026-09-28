import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Bell } from "lucide-react";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { EmptyState, PageHeader, Pagination } from "@/components/ui";
import { MarkAllRead, MarkRead } from "@/components/owner/misc-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };
const PAGE = 30;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const where = and(eq(notifications.userId, u.id), eq(notifications.channel, "IN_APP"));
  const [{ total }] = (await db.select({ total: count(notifications.id) }).from(notifications).where(where)) as [{ total: number }];
  const [{ unread }] = (await db.select({ unread: count(notifications.id) }).from(notifications).where(and(where, isNull(notifications.readAt)))) as [{ unread: number }];
  const rows = await db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  return (
    <>
      <PageHeader title="Notifications" description={`${unread} unread`} actions={<MarkAllRead disabled={!Number(unread)} />} />
      {rows.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications" description="Approvals, payouts and booking updates appear here." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {rows.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.readAt && "bg-brand-50/50")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} aria-label={n.readAt ? undefined : "Unread"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-slate-600">{n.body}</p>
                <p className="mt-0.5 text-xs text-slate-400">{prettyDateTime(n.createdAt)}</p>
              </div>
              {!n.readAt && <MarkRead id={n.id} />}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={PAGE} total={Number(total)} basePath="/owner/notifications" />
    </>
  );
}
