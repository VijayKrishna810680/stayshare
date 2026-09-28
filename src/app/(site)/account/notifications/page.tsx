import type { Metadata } from "next";
import { pageUser } from "@/lib/auth/page";
import { PageHeader } from "@/components/ui";
import { NotificationsList } from "@/components/site/notifications-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await pageUser({ next: "/account/notifications" });
  return (
    <div>
      <PageHeader title="Notifications" breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Notifications" }]} />
      <NotificationsList />
    </div>
  );
}
