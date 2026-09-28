import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { applicationSettings, auditLogs, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { hasStepUp } from "@/lib/auth/step-up";
import { prettyDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { getAllSettings, STEP_UP_SETTING_PREFIXES } from "@/lib/settings";
import { Alert, Badge, Card, CardBody, CardHeader, DescList, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LinkTabs } from "@/components/admin/ui";
import { LogoutAllButton } from "@/components/admin/widgets";
import { SettingsForm, type SettingField } from "@/components/admin/settings-form";
import { one, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

const TABS: { key: string; label: string; fields: SettingField[]; description: string; askReason?: boolean }[] = [
  {
    key: "contact",
    label: "Contact & support",
    description: "Shown to customers and partners on the site, booking pages and emails. Contact buttons stay hidden until you fill these in.",
    fields: [
      { key: "platform.supportEmail", label: "Support email", type: "email", placeholder: "support@yourdomain.in" },
      { key: "platform.supportPhone", label: "Support phone (calls)", type: "tel", placeholder: "+91 98xxxxxxxx" },
      { key: "platform.whatsapp", label: "WhatsApp number", type: "tel", placeholder: "+91 98xxxxxxxx", hint: "Used for the WhatsApp chat button (wa.me link)" },
      { key: "platform.supportHours", label: "Support hours", type: "text", placeholder: "Mon–Sun, 8 AM – 10 PM IST" },
      { key: "platform.liveChatEnabled", label: "Live chat enabled", type: "bool", hint: "Shows the chat widget; conversations arrive in Admin → Live chat" },
    ],
  },
  {
    key: "platform",
    label: "Platform & invoice",
    description: "Business details printed on customer invoices and receipts.",
    fields: [
      { key: "platform.name", label: "Platform / brand name", type: "text" },
      { key: "platform.legalName", label: "Legal entity name", type: "text" },
      { key: "platform.gstin", label: "GSTIN", type: "text", placeholder: "36AAAAA0000A1Z5" },
      { key: "platform.address", label: "Registered address", type: "textarea" },
    ],
  },
  {
    key: "fees",
    label: "Fees & booking",
    askReason: true,
    description: "Customer-facing fees and booking rules. Fee changes apply to new quotes immediately and are recorded in price history.",
    fields: [
      { key: "fees.convenienceType", label: "Convenience fee type", type: "select", options: [{ value: "FLAT", label: "Flat amount per booking" }, { value: "PERCENT", label: "Percentage of taxable value" }] },
      { key: "fees.convenienceValue", label: "Convenience fee", type: "convenience" },
      { key: "fees.convenienceTaxBps", label: "GST on convenience fee", type: "percent" },
      { key: "fees.gatewayFeeBps", label: "Estimated gateway fee", type: "percent", hint: "Used when the provider does not report the actual fee" },
      { key: "fees.gatewayFeeBorneBy", label: "Gateway fee borne by", type: "select", options: [{ value: "OWNER", label: "Owner (deducted from payout)" }, { value: "PLATFORM", label: "Platform (StayShare absorbs)" }] },
      { key: "booking.holdMinutes", label: "Inventory hold during payment (minutes)", type: "int" },
      { key: "booking.maxAdvanceDays", label: "Max days bookable in advance", type: "int" },
      { key: "booking.partialPaymentBps", label: "Minimum advance for partial payment", type: "percent" },
      { key: "booking.allowPartialPayment", label: "Allow partial payment", type: "bool" },
      { key: "booking.allowCashAtProperty", label: "Allow pay-at-property (where the property allows it)", type: "bool" },
      { key: "booking.extensionNeedsApproval", label: "Stay extensions need approval", type: "bool" },
      { key: "booking.modificationNeedsApproval", label: "Booking modifications need approval", type: "bool" },
      { key: "reviews.autoPublish", label: "Auto-publish reviews", type: "bool" },
      { key: "owner.allowPriceSuggestion", label: "Owners may suggest prices", type: "bool", hint: "Suggestions are never customer-facing" },
      { key: "owner.canSetFinalPriceDefault", label: "New owners can set final prices by default", type: "bool", hint: "Keep off unless you trust all partners" },
    ],
  },
  {
    key: "payouts",
    label: "Payouts",
    askReason: true,
    description: "Owner settlement rules. Per-owner settlement cycles and payout holds are set on the owner's profile.",
    fields: [
      { key: "payout.settlementDaysAfterCheckout", label: "Earnings become eligible N days after check-out", type: "int" },
      { key: "payout.minPayout", label: "Minimum payout an owner can request", type: "money" },
    ],
  },
];

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: "settings.manage" });
  const sp = await searchParams;
  const canIntegrations = u.has("integrations.manage");
  const tab = one(sp.tab) || "contact";
  const tabs = [...TABS.map((t) => ({ key: t.key, label: t.label, href: `?tab=${t.key}` })), ...(canIntegrations ? [{ key: "integrations", label: "Integrations", href: "?tab=integrations" }] : []), { key: "security", label: "Security", href: "?tab=security" }];
  const current = TABS.find((t) => t.key === tab);
  const values = await getAllSettings();
  const meta = current ? await db.select({ key: applicationSettings.key, updatedAt: applicationSettings.updatedAt, by: users.name }).from(applicationSettings).leftJoin(users, eq(users.id, applicationSettings.updatedBy)).where(inArray(applicationSettings.key, current.fields.map((f) => f.key))) : [];
  return (
    <>
      <PageHeader title="Settings" description="Platform-wide configuration. Contact details, invoice details, fees and payout rules require OTP verification to change." />
      <LinkTabs tabs={tabs} active={tab} />
      {current && (
        <Card>
          <CardHeader title={current.label} description={current.description} />
          <CardBody>
            {current.key === "contact" && !values["platform.supportEmail"] && !values["platform.supportPhone"] && !values["platform.whatsapp"] && (
              <div className="mb-4">
                <Alert tone="warn" title="Support contacts not configured">
                  Customers currently see no email/phone/WhatsApp buttons. Enter the app owner&apos;s official support details below.
                </Alert>
              </div>
            )}
            <SettingsForm key={current.key} fields={current.fields} values={values} protectedPrefixes={STEP_UP_SETTING_PREFIXES} askReason={current.askReason} />
            {meta.length > 0 && (
              <p className="mt-4 text-xs text-slate-500">
                Last changed: {meta
                  .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
                  .slice(0, 1)
                  .map((m) => `${m.key} by ${m.by ?? "system"} on ${prettyDateTime(m.updatedAt)}`)}
              </p>
            )}
          </CardBody>
        </Card>
      )}
      {tab === "integrations" && canIntegrations && <Integrations />}
      {tab === "security" && <Security userId={u.id} sessionId={u.sessionId} target={u.phone ? `phone ending ${u.phone.slice(-4)}` : (u.email ?? "")} />}
    </>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return <Badge tone={ok ? "green" : "amber"}>{label}</Badge>;
}

function Integrations() {
  const rz = Boolean(env.razorpayKeyId && env.razorpayKeySecret);
  const items = [
    { name: "Payment gateway", provider: env.paymentProvider, ok: env.paymentProvider !== "mock" && (env.paymentProvider !== "razorpay" || rz), detail: env.paymentProvider === "mock" ? "Mock gateway (development) — set PAYMENT_PROVIDER=razorpay and keys for live payments" : env.paymentProvider === "razorpay" ? `Key id ${env.razorpayKeyId ? env.razorpayKeyId.slice(0, 8) + "…" : "missing"} · webhook secret ${env.razorpayWebhookSecret ? "set" : "missing"}` : "Configured via environment" },
    { name: "Maps", provider: env.mapsProvider, ok: env.mapsProvider === "google-embed" || Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_MAPBOX_TOKEN), detail: env.mapsProvider === "google-embed" ? "Keyless Google Maps embeds" : "API key from environment" },
    { name: "Email", provider: env.emailProvider, ok: env.emailProvider !== "console" && Boolean(process.env.RESEND_API_KEY), detail: env.emailProvider === "console" ? "Console driver — emails are logged, not sent" : `From ${process.env.EMAIL_FROM ?? "default sender"}` },
    { name: "SMS", provider: env.smsProvider, ok: env.smsProvider !== "console" && Boolean(process.env.MSG91_AUTH_KEY), detail: env.smsProvider === "console" ? "Console driver — SMS/OTP logged (dev codes shown in UI)" : "MSG91 (DLT templates required in India)" },
    { name: "WhatsApp", provider: env.whatsappProvider, ok: env.whatsappProvider !== "console" && Boolean(process.env.WHATSAPP_TOKEN), detail: env.whatsappProvider === "console" ? "Console driver" : "Meta WhatsApp Cloud API" },
    { name: "Google sign-in", provider: env.googleClientId ? "google" : "not configured", ok: Boolean(env.googleClientId && env.googleClientSecret), detail: env.googleClientId ? "OAuth client configured" : "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" },
    { name: "File storage", provider: env.storageDriver, ok: true, detail: env.storageDriver === "local" ? `Local disk (${env.storageDir})` : "S3-compatible bucket" },
  ];
  return (
    <Card>
      <CardHeader title="Integrations" description="Read-only status of providers configured through server environment variables. Secrets are never displayed; change them in your deployment's environment and restart." />
      <Table className="rounded-none border-0 shadow-none">
        <THead>
          <tr>
            <TH>Service</TH>
            <TH>Provider</TH>
            <TH>Status</TH>
            <TH>Details</TH>
          </tr>
        </THead>
        <TBody>
          {items.map((i) => (
            <TR key={i.name}>
              <TD className="font-medium">{i.name}</TD>
              <TD>
                <code className="text-xs">{i.provider}</code>
              </TD>
              <TD>
                <Status ok={i.ok} label={i.ok ? "Live" : "Dev / not configured"} />
              </TD>
              <TD className="text-xs text-slate-600">{i.detail}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

async function Security({ userId, sessionId, target }: { userId: string; sessionId: string; target: string }) {
  const active = await hasStepUp({ id: userId, sessionId });
  const events = await db
    .select({ id: auditLogs.id, action: auditLogs.action, at: auditLogs.createdAt, ip: auditLogs.ip, actor: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(inArray(auditLogs.action, ["auth.step_up", "settings.update", "admin.create", "admin.roles_update", "role.create", "role.update", "role.delete"]))
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="OTP step-up" />
        <CardBody className="space-y-3 text-sm">
          <DescList
            className="sm:grid-cols-1"
            items={[
              { label: "Status for this session", value: active ? <Badge tone="green">Verified (valid up to 10 minutes)</Badge> : <Badge>Not verified</Badge> },
              { label: "OTP goes to", value: target || "—" },
              { label: "Protected settings", value: STEP_UP_SETTING_PREFIXES.map((p) => `${p}*`).join(", ") },
              { label: "Also protected", value: "Creating administrators, changing admin roles and role permissions" },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Your sessions" />
        <CardBody className="space-y-3 text-sm">
          <p className="text-slate-600">If you suspect your account was used elsewhere, sign out of every device. You will need to log in again.</p>
          <LogoutAllButton />
        </CardBody>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Recent security events" />
        <Table className="rounded-none border-0 shadow-none">
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Event</TH>
              <TH>By</TH>
              <TH>IP</TH>
            </tr>
          </THead>
          <TBody>
            {events.map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap text-xs">{prettyDateTime(e.at)}</TD>
                <TD>
                  <code className="text-xs">{e.action}</code>
                </TD>
                <TD>{e.actor ?? "—"}</TD>
                <TD className="text-xs">{e.ip ?? "—"}</TD>
              </TR>
            ))}
            {!events.length && (
              <TR>
                <TD colSpan={4} className="text-center text-sm text-slate-500">
                  No events yet.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
