import Link from "next/link";
import { Mail, Phone, Smartphone } from "lucide-react";
import { Logo } from "./header";
import { WhatsAppIcon } from "./icons";

export function SiteFooter({ cities, contacts }: { cities: { name: string; slug: string }[]; contacts: { email: string | null; phone: string | null; whatsapp: string | null; hours: string | null } }) {
  const cols = [
    {
      title: "StayShare",
      links: [
        { href: "/pages/about", label: "About us" },
        { href: "/partner", label: "Partner with us" },
        { href: "/plus", label: "StayShare Plus" },
        { href: "/contact", label: "Contact" },
        { href: "/faq", label: "FAQs" },
      ],
    },
    {
      title: "Policies",
      links: [
        { href: "/pages/terms", label: "Terms & conditions" },
        { href: "/pages/privacy", label: "Privacy policy" },
        { href: "/pages/cancellation-policy", label: "Cancellation policy" },
        { href: "/pages/refund-policy", label: "Refund policy" },
      ],
    },
    { title: "Popular cities", links: cities.slice(0, 8).map((c) => ({ href: `/search?city=${c.slug}`, label: `Stays in ${c.name}` })) },
  ];
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-page grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">Flexible stays. Affordable sharing. Comfortable living. Verified hotels, hostels, PGs and co-living spaces with transparent pricing.</p>
          {(contacts.email || contacts.phone || contacts.whatsapp) && (
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {contacts.phone && (
                <li>
                  <a href={`tel:${contacts.phone}`} className="inline-flex items-center gap-2 hover:text-brand-700">
                    <Phone className="h-4 w-4" aria-hidden /> {contacts.phone}
                  </a>
                </li>
              )}
              {contacts.email && (
                <li>
                  <a href={`mailto:${contacts.email}`} className="inline-flex items-center gap-2 hover:text-brand-700">
                    <Mail className="h-4 w-4" aria-hidden /> {contacts.email}
                  </a>
                </li>
              )}
              {contacts.whatsapp && (
                <li>
                  <a href={`https://wa.me/${contacts.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-brand-700">
                    <WhatsAppIcon className="h-4 w-4" /> WhatsApp us
                  </a>
                </li>
              )}
              {contacts.hours && <li className="text-xs text-slate-500">Support hours: {contacts.hours}</li>}
            </ul>
          )}
          <div id="download-app" className="mt-6 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
            <p className="flex items-center gap-2 font-semibold">
              <Smartphone className="h-4 w-4" aria-hidden /> Get the StayShare app
            </p>
            <p className="mt-1 text-sm text-white/80">Book, pay, check in with QR and chat with support on the go.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/#get-app" className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-800">Android app</a>
              <a href="/#get-app" className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium ring-1 ring-white/30">Add to home screen</a>
            </div>
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h2 className="text-sm font-semibold text-slate-900">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-slate-600 hover:text-brand-700">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} StayShare. All rights reserved.</p>
          <p>Prices shown are set by StayShare and include a full breakdown before you pay.</p>
        </div>
      </div>
    </footer>
  );
}
