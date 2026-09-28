import Link from "next/link";
import { and, asc, count, desc, eq, gte, isNull } from "drizzle-orm";
import { ArrowRight, BadgeCheck, BedDouble, Crown, Headset, IndianRupee, MapPin, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { db } from "@/db";
import { banners, cities, faqs, properties, reviews, subscriptionPlans, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { formatINR } from "@/lib/money";
import { listingRail } from "@/lib/site/search";
import { HeroSearch } from "@/components/site/search-form";
import { Rail } from "@/components/site/rail";
import { FaqList } from "@/components/site/faq-list";
import { InstallApp } from "@/components/site/install-app";
import { Stars } from "@/components/site/stars";
import { favouriteSet } from "@/components/site/favs";
import { Img } from "@/components/ui/img";

export const dynamic = "force-dynamic";

const CITY_GRADIENTS = ["from-brand-500 to-brand-800", "from-accent-400 to-accent-600", "from-sky-500 to-indigo-700", "from-rose-400 to-fuchsia-700", "from-emerald-500 to-teal-700", "from-violet-500 to-purple-800"];

export default async function HomePage() {
  const user = await getCurrentUser();
  const [cityRows, bannerRows, faqRows, reviewRows, plusPlans, favs, featured, privateRooms, sharedRooms, familyRooms, acRooms, nonAc, monthly, students, professionals] = await Promise.all([
    db
      .select({ name: cities.name, slug: cities.slug, state: cities.state, imageUrl: cities.imageUrl, isPopular: cities.isPopular, n: count(properties.id) })
      .from(cities)
      .leftJoin(properties, and(eq(properties.cityId, cities.id), eq(properties.approvalStatus, "APPROVED"), eq(properties.active, true), eq(properties.blocked, false), isNull(properties.deletedAt)))
      .where(eq(cities.active, true))
      .groupBy(cities.id)
      .orderBy(desc(cities.isPopular), asc(cities.name)),
    db.select().from(banners).where(and(eq(banners.active, true), eq(banners.placement, "HOME_HERO"))).orderBy(asc(banners.sortOrder)),
    db.select().from(faqs).where(eq(faqs.active, true)).orderBy(asc(faqs.sortOrder)).limit(6),
    db
      .select({ id: reviews.id, overall: reviews.overall, title: reviews.title, text: reviews.text, createdAt: reviews.createdAt, author: users.name, property: properties.name, slug: properties.slug })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.customerId))
      .innerJoin(properties, eq(properties.id, reviews.propertyId))
      .where(and(eq(reviews.status, "PUBLISHED"), gte(reviews.overall, 4)))
      .orderBy(desc(reviews.createdAt))
      .limit(6),
    db.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.audience, "CUSTOMER"), eq(subscriptionPlans.active, true))).orderBy(asc(subscriptionPlans.price)),
    favouriteSet(user?.id),
    listingRail({ featured: "1" }),
    listingRail({ type: "PRIVATE" }),
    listingRail({ type: "SHARED" }),
    listingRail({ type: "FAMILY" }),
    listingRail({ ac: "1" }),
    listingRail({ ac: "0" }),
    listingRail({ stay: "monthly" }),
    listingRail({ audience: "STUDENTS" }),
    listingRail({ audience: "WORKING_PROFESSIONALS" }),
  ]);
  const recommended = featured.length >= 4 ? featured : [...featured, ...privateRooms, ...sharedRooms].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).slice(0, 8);
  const plus = plusPlans[0];
  const plusDiscount = plus?.benefits.bookingDiscountBps;

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent-400/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-400/30 blur-3xl" aria-hidden />
        <div className="container-page relative py-12 sm:py-16 lg:py-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
            <BadgeCheck className="h-4 w-4 text-accent-400" aria-hidden /> Verified stays · Transparent prices · Real support
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Flexible stays. Affordable sharing. <span className="text-accent-400">Comfortable living.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">Hotels, hostels, PGs and co-living — book a single bed, a private room or a family room, for a night or for months.</p>
          <div className="mt-8 max-w-6xl">
            <HeroSearch cities={cityRows.map((c) => ({ name: c.name, slug: c.slug }))} />
          </div>
          {bannerRows.length > 0 && (
            <div className="scrollbar-none mt-6 flex gap-3 overflow-x-auto">
              {bannerRows.map((b) => (
                <Link key={b.id} href={b.linkUrl || "/search"} className="group flex min-w-[16rem] shrink-0 items-center gap-3 rounded-2xl bg-white/10 p-3 pr-5 ring-1 ring-white/20 backdrop-blur hover:bg-white/15">
                  {b.imageUrl ? (
                    <Img src={b.imageUrl} alt="" className="h-12 w-12 rounded-xl" />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-500 text-white">
                      <Sparkles className="h-5 w-5" aria-hidden />
                    </span>
                  )}
                  <span>
                    <span className="block text-sm font-semibold">{b.title}</span>
                    {b.subtitle && <span className="block text-xs text-white/75">{b.subtitle}</span>}
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 opacity-60 transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Popular cities ── */}
      <section className="container-page mt-12" aria-labelledby="cities-h">
        <h2 id="cities-h" className="text-xl font-bold sm:text-2xl">
          Popular cities
        </h2>
        <p className="mt-1 text-sm text-slate-500">Hand-picked, verified stays across India.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cityRows.slice(0, 6).map((c, i) => (
            <Link key={c.slug} href={`/search?city=${c.slug}`} className={`group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-sm ${CITY_GRADIENTS[i % CITY_GRADIENTS.length]}`}>
              {c.imageUrl && <Img src={c.imageUrl} alt="" className="absolute inset-0 h-full w-full opacity-60 transition group-hover:scale-105" />}
              <MapPin className="absolute right-3 top-3 h-5 w-5 opacity-60" aria-hidden />
              <span className="relative text-lg font-bold drop-shadow">{c.name}</span>
              <span className="relative text-xs text-white/85">
                {c.n} stay{Number(c.n) === 1 ? "" : "s"} · {c.state}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Rail title="Recommended for you" subtitle="Top-rated and featured stays our guests love" href="/search?sort=recommended" items={recommended} favs={favs} />
      <Rail title="Private rooms" subtitle="Your own space, with attached bathrooms in most stays" href="/search?type=PRIVATE" items={privateRooms} favs={favs} />
      <Rail title="Shared rooms" subtitle="Book just a bed — the most affordable way to stay" href="/search?type=SHARED" items={sharedRooms} favs={favs} />
      <Rail title="Family rooms" subtitle="Spacious rooms for families and groups" href="/search?type=FAMILY" items={familyRooms} favs={favs} />

      {/* ── Why StayShare ── */}
      <section className="container-page mt-16" aria-labelledby="why-h">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
          <h2 id="why-h" className="text-xl font-bold sm:text-2xl">
            Why StayShare
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Verified properties", text: "Every property, room and photo is checked by the StayShare team before it goes live." },
              { icon: IndianRupee, title: "Transparent pricing", text: "Prices are set by StayShare with a full breakdown — taxes, deposit and fees shown before you pay." },
              { icon: BedDouble, title: "Book a bed or a room", text: "Pay only for what you need: a single bed in a shared room, a private room or the whole family room." },
              { icon: QrCode, title: "QR check-in", text: "Get a QR code with your booking for quick, contact-free check-in at the property." },
              { icon: Sparkles, title: "Nightly to monthly", text: "Stay a night, a week or several months — longer stays get better rates automatically." },
              { icon: Headset, title: "Real support", text: "Live chat with our team, raise tickets and track refunds from your account." },
            ].map((f) => (
              <div key={f.title} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Rail title="AC rooms" subtitle="Stay cool — air-conditioned rooms and beds" href="/search?ac=1" items={acRooms} favs={favs} />
      <Rail title="Non-AC rooms" subtitle="Budget-friendly stays with great value" href="/search?ac=0" items={nonAc} favs={favs} />
      <Rail title="Monthly stays" subtitle="PGs and co-living with monthly rent — ideal for long stays" href="/search?stay=monthly" items={monthly} favs={favs} />
      <Rail title="Student accommodation" subtitle="Safe hostels and PGs close to colleges" href="/search?audience=STUDENTS" items={students} favs={favs} />
      <Rail title="For working professionals" subtitle="Near tech parks and business districts, with Wi-Fi and meals" href="/search?audience=WORKING_PROFESSIONALS" items={professionals} favs={favs} />

      {/* ── Reviews ── */}
      {reviewRows.length > 0 && (
        <section className="container-page mt-16" aria-labelledby="reviews-h">
          <h2 id="reviews-h" className="text-xl font-bold sm:text-2xl">
            What our guests say
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviewRows.map((r) => (
              <figure key={r.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Stars value={r.overall} />
                {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                <blockquote className="mt-1 line-clamp-4 text-sm leading-6 text-slate-600">“{r.text}”</blockquote>
                <figcaption className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm">
                  <span className="font-medium text-slate-800">{r.author.split(" ")[0]}</span>
                  <Link href={`/property/${r.slug}`} className="truncate text-xs text-brand-700 hover:underline">
                    {r.property}
                  </Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ── Plus teaser ── */}
      {plus && (
        <section className="container-page mt-16">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-brand-900 p-6 text-white sm:p-10">
            <Crown className="absolute -right-6 -top-6 h-40 w-40 text-accent-400/10" aria-hidden />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent-400">
                  <Crown className="h-4 w-4" aria-hidden /> StayShare Plus
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  {plusDiscount ? `Save ${plusDiscount / 100}% on every booking` : "Member-only savings on every stay"}
                </h2>
                <p className="mt-2 max-w-xl text-white/80">{plus.description ?? "Exclusive discounts, waived convenience fees and priority support."}</p>
                <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                  {plus.features.slice(0, 4).map((f) => (
                    <li key={f} className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="shrink-0 text-left md:text-right">
                <p className="text-sm text-white/70">Starting at</p>
                <p className="text-3xl font-extrabold">
                  {formatINR(plus.price)}
                  <span className="text-base font-medium text-white/70"> / {plus.durationDays >= 360 ? "year" : `${plus.durationDays} days`}</span>
                </p>
                <Link href="/plus" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent-500 px-5 py-3 font-semibold text-white hover:bg-accent-600">
                  Explore Plus <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── App download ── */}
      <section id="get-app" className="container-page mt-16 scroll-mt-24">
        <div className="grid items-center gap-6 rounded-3xl bg-brand-50 p-6 ring-1 ring-brand-100 sm:p-10 md:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Take StayShare with you</h2>
            <p className="mt-2 text-slate-600">Manage bookings, show your QR at check-in, extend your stay and chat with support — right from your phone.</p>
            <div className="mt-5">
              <InstallApp />
            </div>
          </div>
          <div className="hidden justify-center md:flex" aria-hidden>
            <div className="w-48 rounded-[2rem] border-8 border-slate-900 bg-white p-3 shadow-2xl">
              <div className="h-3 w-16 rounded-full bg-slate-200" />
              <div className="mt-3 h-20 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700" />
              <div className="mt-2 h-3 w-3/4 rounded bg-slate-200" />
              <div className="mt-1 h-3 w-1/2 rounded bg-slate-200" />
              <div className="mt-3 grid place-items-center rounded-xl bg-slate-50 py-4">
                <QrCode className="h-14 w-14 text-slate-800" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      {faqRows.length > 0 && (
        <section className="container-page mt-16" aria-labelledby="faq-h">
          <div className="flex items-end justify-between">
            <h2 id="faq-h" className="text-xl font-bold sm:text-2xl">
              Frequently asked questions
            </h2>
            <Link href="/faq" className="text-sm font-semibold text-brand-700 hover:underline">
              All FAQs
            </Link>
          </div>
          <div className="mt-4">
            <FaqList items={faqRows} />
          </div>
        </section>
      )}

      {/* ── Partner CTA ── */}
      <section className="container-page mt-16">
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="text-xl font-bold">Own a hotel, hostel or PG?</h2>
            <p className="mt-1 text-slate-600">List it on StayShare — we verify, price and market it, you focus on hospitality.</p>
          </div>
          <Link href="/partner" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
            Partner with us <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
