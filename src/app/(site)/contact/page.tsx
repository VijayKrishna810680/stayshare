import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Clock, Mail, MessageCircle, Phone } from "lucide-react";
import { db } from "@/db";
import { bookings, contentPages, properties } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { getSupportContacts } from "@/lib/contact";
import { Breadcrumbs } from "@/components/ui";
import { Markdown } from "@/components/site/markdown";
import { WhatsAppIcon } from "@/components/site/icons";
import { ContactForm, OpenChatButton } from "@/components/site/contact-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact us" };

export default async function ContactPage() {
  const [user, c, page] = await Promise.all([getCurrentUser(), getSupportContacts(), db.select().from(contentPages).where(eq(contentPages.slug, "contact")).then((r) => r[0] ?? null)]);
  const myBookings = user
    ? await db.select({ id: bookings.id, bookingNumber: bookings.bookingNumber, propertyName: properties.name }).from(bookings).innerJoin(properties, eq(properties.id, bookings.propertyId)).where(eq(bookings.customerId, user.id)).orderBy(desc(bookings.createdAt)).limit(20)
    : [];
  const channels = [
    c.phone && { href: `tel:${c.phone}`, label: "Call support", value: c.phone, icon: Phone, tone: "bg-brand-50 text-brand-700" },
    c.whatsapp && { href: `https://wa.me/${c.whatsapp.replace(/\D/g, "")}`, label: "WhatsApp", value: c.whatsapp, icon: WhatsAppIcon, tone: "bg-emerald-50 text-emerald-700", external: true },
    c.email && { href: `mailto:${c.email}`, label: "Email", value: c.email, icon: Mail, tone: "bg-accent-50 text-accent-600" },
  ].filter(Boolean) as { href: string; label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone: string; external?: boolean }[];
  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Contact" }]} />
      <h1 className="text-3xl font-bold">We&apos;re here to help</h1>
      {page?.body ? <Markdown source={page.body} className="mt-2 max-w-2xl space-y-2" /> : <p className="mt-2 max-w-2xl text-slate-600">Questions about a booking, payment or a property? Reach out and our support team will help.</p>}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          {c.liveChat && (
            <div className="card flex items-start gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
                <MessageCircle className="h-5 w-5" aria-hidden />
              </span>
              <div className="flex-1">
                <p className="font-semibold">Live chat</p>
                <p className="text-sm text-slate-600">The fastest way to reach us. Chat with a StayShare specialist right now.</p>
                <div className="mt-3">
                  <OpenChatButton />
                </div>
              </div>
            </div>
          )}
          {channels.map((ch) => (
            <a key={ch.label} href={ch.href} {...(ch.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="card flex items-center gap-4 p-5 hover:shadow-md">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${ch.tone}`}>
                <ch.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold">{ch.label}</span>
                <span className="block text-sm text-slate-600">{ch.value}</span>
              </span>
            </a>
          ))}
          {c.hours && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Clock className="h-4 w-4" aria-hidden /> Support hours: {c.hours}
            </p>
          )}
          <p className="text-sm text-slate-600">
            Many questions are answered in our <Link href="/faq" className="font-medium text-brand-700 underline">FAQs</Link>.
          </p>
        </div>
        <section className="card p-5 sm:p-6" aria-labelledby="cf-h">
          <h2 id="cf-h" className="text-lg font-semibold">
            {user ? "Raise a support ticket" : "Send us a message"}
          </h2>
          <p className="mb-4 text-sm text-slate-600">{user ? "Track replies in Account → Help & support." : "We'll reply in the live chat and on the contact details you share. Logged-in users can raise tracked tickets."}</p>
          <ContactForm loggedIn={Boolean(user)} bookings={myBookings} chatEnabled={c.liveChat} />
        </section>
      </div>
    </div>
  );
}
