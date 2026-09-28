import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, BarChart3, Building2, Camera, IndianRupee, QrCode, ShieldCheck, Users, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current";
import { listPlans } from "@/services/subscriptions";
import { PlanCard } from "@/components/site/plan-card";
import { LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner with StayShare", description: "List your hotel, hostel, PG or co-living space on StayShare." };

export default async function PartnerPage() {
  const [user, plans] = await Promise.all([getCurrentUser(), listPlans("OWNER")]);
  const cta = user?.isOwner ? { href: "/owner", label: "Go to owner portal" } : { href: "/register?type=owner", label: "Register as a partner" };
  return (
    <>
      <section className="bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 text-white">
        <div className="container-page grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
              <Building2 className="h-4 w-4 text-accent-400" aria-hidden /> For hotels, hostels, PGs & co-living
            </p>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-5xl">Fill every bed. We&apos;ll handle the rest.</h1>
            <p className="mt-4 max-w-xl text-lg text-white/85">StayShare brings verified guests for nightly and monthly stays — you focus on hospitality while we manage pricing, payments and support.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={cta.href} variant="accent" size="lg">
                {cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </LinkButton>
              <a href="#how" className="inline-flex h-12 items-center rounded-xl px-6 font-medium text-white ring-1 ring-white/30 hover:bg-white/10">
                How it works
              </a>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {[
              { icon: Users, t: "Bed-level bookings", d: "Sell single beds, rooms or the entire property" },
              { icon: Wallet, t: "Reliable payouts", d: "Transparent settlements with every deduction shown" },
              { icon: QrCode, t: "QR check-in", d: "Staff app for check-in, check-out & housekeeping" },
              { icon: BarChart3, t: "Live dashboard", d: "Occupancy, earnings and reviews in one place" },
            ].map((x) => (
              <li key={x.t} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                <x.icon className="h-6 w-6 text-accent-400" aria-hidden />
                <p className="mt-2 font-semibold">{x.t}</p>
                <p className="text-sm text-white/75">{x.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how" className="container-page scroll-mt-20 py-14">
        <h2 className="text-2xl font-bold sm:text-3xl">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            { icon: BadgeCheck, t: "Register", d: "Create your partner account and complete KYC with your business and bank details." },
            { icon: Camera, t: "Add building, rooms & photos", d: "Add floors, rooms and beds, facilities, house rules and great photos." },
            { icon: ShieldCheck, t: "StayShare verifies & sets pricing", d: "Our team verifies your property and sets fair, competitive customer prices." },
            { icon: IndianRupee, t: "Go live & earn", d: "Your property appears in search. Accept bookings and receive regular payouts." },
          ].map((s, i) => (
            <li key={s.t} className="card relative p-5">
              <span className="absolute right-4 top-4 text-4xl font-extrabold text-slate-100" aria-hidden>
                {i + 1}
              </span>
              <s.icon className="h-7 w-7 text-brand-600" aria-hidden />
              <p className="mt-3 font-semibold">{s.t}</p>
              <p className="mt-1 text-sm text-slate-600">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {plans.length > 0 && (
        <section className="container-page pb-14" aria-labelledby="plans-h">
          <h2 id="plans-h" className="text-2xl font-bold sm:text-3xl">
            Partner plans
          </h2>
          <p className="mt-1 text-slate-600">Start free. Upgrade for lower commission, featured listings and priority support.</p>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p}>
                <LinkButton href={user?.isOwner ? "/owner" : "/register?type=owner"} variant={p.isPopular ? "accent" : "outline"} className="w-full">
                  {user?.isOwner ? "Manage in owner portal" : p.price === 0 ? "Start free" : "Get started"}
                </LinkButton>
              </PlanCard>
            ))}
          </div>
        </section>
      )}

      <section className="container-page pb-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-brand-50 p-6 ring-1 ring-brand-100 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="text-xl font-bold">Questions about partnering?</h2>
            <p className="text-slate-600">Our partner team is happy to walk you through onboarding.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/contact" className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-5 font-medium hover:bg-slate-50">
              Contact us
            </Link>
            <LinkButton href={cta.href} size="lg">
              {cta.label}
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
