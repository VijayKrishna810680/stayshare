import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationTemplates, notifications, users } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Notification service. Each event key (e.g. "booking.confirmed") can have one template per channel,
 * editable in Admin → Notification templates. Channels without a template are skipped.
 * Drivers default to "console" (logged + stored) until provider credentials are configured.
 */
export type NotifyEvent =
  | "otp"
  | "password.reset"
  | "user.registered"
  | "owner.approved"
  | "owner.rejected"
  | "property.approved"
  | "property.rejected"
  | "booking.confirmed"
  | "payment.success"
  | "payment.failed"
  | "checkin.upcoming"
  | "checkin.completed"
  | "checkout.upcoming"
  | "checkout.completed"
  | "booking.cancelled"
  | "refund.initiated"
  | "refund.completed"
  | "extension.approved"
  | "modification.update"
  | "ticket.updated"
  | "payout.updated"
  | "promo.offer";

export function render(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ""));
}

type Driver = (to: string, subject: string, body: string) => Promise<{ provider: string }>;

const emailDriver: Driver = async (to, subject, body) => {
  if (env.emailProvider === "resend" && process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "StayShare <no-reply@stayshare.demo>", to, subject, text: body }),
    });
    if (!res.ok) throw new Error(`Email provider error ${res.status}`);
    return { provider: "resend" };
  }
  logger.info("notify.email", { to, subject });
  return { provider: "console" };
};

const smsDriver: Driver = async (to, _s, body) => {
  if (env.smsProvider === "msg91" && process.env.MSG91_AUTH_KEY) {
    // Placeholder: MSG91 Flow API — configure template ids per DLT rules in India.
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: process.env.MSG91_AUTH_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID, recipients: [{ mobiles: to.replace(/\D/g, ""), message: body }] }),
    });
    if (!res.ok) throw new Error(`SMS provider error ${res.status}`);
    return { provider: "msg91" };
  }
  logger.info("notify.sms", { to, body });
  return { provider: "console" };
};

const whatsappDriver: Driver = async (to, _s, body) => {
  if (env.whatsappProvider === "meta" && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "text", text: { body } }),
    });
    if (!res.ok) throw new Error(`WhatsApp provider error ${res.status}`);
    return { provider: "meta" };
  }
  logger.info("notify.whatsapp", { to, body });
  return { provider: "console" };
};

const pushDriver: Driver = async (to, subject) => {
  // Placeholder for FCM (Android) — see docs/INTEGRATIONS.md
  logger.info("notify.push", { to, subject });
  return { provider: "console" };
};

export async function notify(event: NotifyEvent, opts: { userId?: string | null; to?: { email?: string | null; phone?: string | null }; vars: Record<string, string | number | null | undefined>; data?: Record<string, unknown> }) {
  try {
    const tpls = await db.select().from(notificationTemplates).where(and(eq(notificationTemplates.key, event), eq(notificationTemplates.active, true)));
    if (!tpls.length) return;
    let email = opts.to?.email ?? null;
    let phone = opts.to?.phone ?? null;
    if (opts.userId && (!email || !phone)) {
      const [u] = await db.select({ email: users.email, phone: users.phone }).from(users).where(eq(users.id, opts.userId));
      email ??= u?.email ?? null;
      phone ??= u?.phone ?? null;
    }
    for (const t of tpls) {
      const title = render(t.subject ?? "StayShare", opts.vars);
      const body = render(t.body, opts.vars);
      let recipient: string | null = null;
      let status = "SENT";
      let provider = "in-app";
      let error: string | null = null;
      try {
        if (t.channel === "EMAIL") {
          if (!email) continue;
          recipient = email;
          provider = (await emailDriver(email, title, body)).provider;
        } else if (t.channel === "SMS") {
          if (!phone) continue;
          recipient = phone;
          provider = (await smsDriver(phone, title, body)).provider;
        } else if (t.channel === "WHATSAPP") {
          if (!phone) continue;
          recipient = phone;
          provider = (await whatsappDriver(phone, title, body)).provider;
        } else if (t.channel === "PUSH") {
          if (!opts.userId) continue;
          recipient = opts.userId;
          provider = (await pushDriver(opts.userId, title, body)).provider;
        } else if (!opts.userId) continue;
      } catch (e) {
        status = "FAILED";
        error = e instanceof Error ? e.message : String(e);
      }
      await db.insert(notifications).values({
        userId: opts.userId ?? null,
        channel: t.channel,
        template: event,
        recipient,
        title,
        body,
        data: opts.data ?? {},
        status,
        provider,
        error,
      });
    }
  } catch (e) {
    // Notifications must never break a business transaction.
    logger.error("notify.failed", { event, err: e instanceof Error ? e.message : String(e) });
  }
}
