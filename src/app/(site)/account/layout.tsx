import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { AccountBack, AccountSidebar } from "@/components/site/account-nav";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser({ next: "/account" });
  const [row] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.channel, "IN_APP"), isNull(notifications.readAt)));
  return (
    <div className="container-page py-6">
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside>
          <AccountSidebar name={user.name} unread={Number(row?.n ?? 0)} />
        </aside>
        <div className="min-w-0">
          <AccountBack />
          {children}
        </div>
      </div>
    </div>
  );
}
