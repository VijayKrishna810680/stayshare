import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Alert, Badge, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LinkTabs } from "@/components/admin/ui";
import { ResourceManager } from "@/components/admin/resource-manager";
import { FormDialogButton } from "@/components/admin/widgets";
import { loadRows } from "../_lib/resource-page";
import { cityOptions, one, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

const VARS: Record<string, string> = {
  otp: "code, minutes",
  "password.reset": "name, link, minutes",
  "booking.confirmed": "name, bookingNumber, propertyName, checkIn, checkOut, amount, link",
  "booking.cancelled": "name, bookingNumber, refundAmount",
  "payment.success / payment.failed": "bookingNumber, amount, reason",
  "refund.initiated / refund.completed": "bookingNumber, amount, refundId",
  "property.approved / property.rejected": "propertyName, notes, status",
  "owner.approved / owner.rejected": "name, reason",
  "ticket.updated": "ticketNumber, message",
  "payout.updated": "payoutNumber, status, amount",
  "modification.update": "bookingNumber, status, type",
  "promo.offer": "title, message",
};

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  await pageUser({ perm: "content.manage" });
  const sp = await searchParams;
  const tab = one(sp.tab) || "templates";
  const cities = await cityOptions();
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Message templates for every event and channel, promotional campaigns and the delivery log."
        actions={
          <FormDialogButton
            url="/api/admin/notifications/promo"
            label="Send promotion"
            variant="primary"
            title="Send promotional notification"
            description="Delivered through the active promo.offer templates (push / in-app, plus any other channel you enable). Only active accounts receive it."
            fields={[
              { name: "segment", label: "Audience", type: "select", required: true, defaultValue: "ALL_CUSTOMERS", options: [{ value: "ALL_CUSTOMERS", label: "All customers" }, { value: "CITY", label: "Customers in a city" }, { value: "MEMBERS", label: "Active StayShare members" }, { value: "OWNERS", label: "Property owners" }] },
              { name: "cityId", label: "City (for city audience)", type: "select", options: cities },
              { name: "title", label: "Title", required: true, placeholder: "Monsoon offer: 15% off monthly stays" },
              { name: "message", label: "Message", type: "textarea", required: true },
              { name: "link", label: "Link (optional)", placeholder: "/search?city=hyderabad" },
            ]}
            submitText="Send now"
            success="Promotion sent"
          />
        }
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "templates", label: "Templates", href: "?tab=templates" },
          { key: "log", label: "Delivery log", href: "?tab=log" },
        ]}
      />
      {tab === "log" ? <Log /> : <Templates />}
    </>
  );
}

async function Templates() {
  const rows = await loadRows("notification-templates");
  return (
    <>
      <div className="mb-4">
        <Alert tone="info" title="Template variables">
          <p className="mb-1">Write variables as {"{{name}}"}. Unknown variables render empty. A channel without an active template is skipped for that event.</p>
          <ul className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
            {Object.entries(VARS).map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>: {v}
              </li>
            ))}
          </ul>
        </Alert>
      </div>
      <ResourceManager resource="notification-templates" rows={rows} title="Templates" pageSize={50} />
    </>
  );
}

async function Log() {
  const rows = await db.select({ n: notifications, user: users.name }).from(notifications).leftJoin(users, eq(users.id, notifications.userId)).orderBy(desc(notifications.createdAt)).limit(200);
  return (
    <Table>
      <THead>
        <tr>
          <TH>When</TH>
          <TH>Event</TH>
          <TH>Channel</TH>
          <TH>Recipient</TH>
          <TH>Title</TH>
          <TH>Status</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map(({ n, user }) => (
          <TR key={n.id}>
            <TD className="whitespace-nowrap text-xs">{prettyDateTime(n.createdAt)}</TD>
            <TD>
              <code className="text-xs">{n.template}</code>
            </TD>
            <TD>
              <Badge>{n.channel.toLowerCase()}</Badge>
            </TD>
            <TD className="text-xs">
              {user ?? "—"}
              <p className="text-slate-500">{n.recipient}</p>
            </TD>
            <TD className="max-w-xs text-xs">
              <p className="font-medium">{n.title}</p>
              <p className="line-clamp-2 text-slate-500">{n.body}</p>
            </TD>
            <TD>
              <StatusBadge status={n.status === "SENT" ? "COMPLETED" : n.status} />
              <p className="text-[11px] text-slate-500">{n.provider}</p>
              {n.error && <p className="text-[11px] text-red-600">{n.error}</p>}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
