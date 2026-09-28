import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, IdCard, MapPin, Navigation, Phone, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current";
import { getPublicProperty, getPropertyReviews } from "@/lib/site/property";
import { searchProperties } from "@/lib/site/search";
import { AUDIENCE_LABEL, GENDER_LABEL, REVIEW_CATEGORIES } from "@/lib/site/labels";
import { prettyDate } from "@/lib/dates";
import { Breadcrumbs } from "@/components/ui";
import { Img } from "@/components/ui/img";
import { Gallery } from "@/components/site/gallery";
import { BookingExperience } from "@/components/site/booking-experience";
import { FacilityIcon } from "@/components/site/facility-icon";
import { FavouriteButton } from "@/components/site/favourite-button";
import { PolicyTiers } from "@/components/site/policy";
import { PropertyCard } from "@/components/site/property-card";
import { RatingPill, Stars } from "@/components/site/stars";
import { ReportReviewButton } from "@/components/site/report-review";
import { favouriteSet } from "@/components/site/favs";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dateOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublicProperty(slug);
  if (!p) return { title: "Property not found" };
  return { title: `${p.name}, ${p.locality?.name ? p.locality.name + ", " : ""}${p.city.name}`, description: p.description.slice(0, 160), openGraph: { images: p.images[0] ? [p.images[0].url] : [] } };
}

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const checkIn = dateOk(one(sp.checkIn));
  const checkOut = dateOk(one(sp.checkOut));
  const guests = Number(one(sp.guests) ?? 1) || 1;
  const p = await getPublicProperty(slug, { checkIn, checkOut });
  if (!p) notFound();
  const user = await getCurrentUser();
  const [reviews, similar, favs] = await Promise.all([getPropertyReviews(p.id), searchProperties({ city: p.city.slug, pageSize: 5, sort: "rating" }), favouriteSet(user?.id)]);
  const similarItems = similar.items.filter((x) => x.id !== p.id).slice(0, 4);
  const hasCoords = p.latitude != null && p.longitude != null;
  const mapSrc = hasCoords ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}&z=15&output=embed` : `https://www.google.com/maps?q=${encodeURIComponent(`${p.addressLine}, ${p.city.name} ${p.postalCode}`)}&z=15&output=embed`;
  const facilityGroups = p.facilities.reduce<Record<string, typeof p.facilities>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});
  const groupLabel: Record<string, string> = { GENERAL: "General", ROOM: "In the room", SAFETY: "Safety & security", FOOD: "Food" };

  const overview = (
    <section aria-labelledby="about-h" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Clock, label: "Check-in", value: `From ${p.checkInTime}` },
          { icon: Clock, label: "Check-out", value: `By ${p.checkOutTime}` },
          { icon: ShieldCheck, label: "Who can stay", value: GENDER_LABEL[p.gender] ?? p.gender },
          { icon: IdCard, label: "ID at check-in", value: p.idProofRequired ? "Govt. ID required" : "Not required" },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl border border-slate-200 bg-white p-3">
            <x.icon className="h-4 w-4 text-brand-600" aria-hidden />
            <p className="mt-1 text-xs text-slate-500">{x.label}</p>
            <p className="text-sm font-semibold">{x.value}</p>
          </div>
        ))}
      </div>
      <div>
        <h2 id="about-h" className="text-xl font-bold">
          About this {p.propertyType.toLowerCase()}
        </h2>
        <p className="mt-2 whitespace-pre-line leading-7 text-slate-700">{p.description}</p>
        {p.targetAudience.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="text-slate-500">Great for:</span>
            {p.targetAudience.map((a) => (
              <span key={a} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800">
                {AUDIENCE_LABEL[a] ?? a}
              </span>
            ))}
          </p>
        )}
      </div>
      {p.facilities.length > 0 && (
        <div>
          <h2 className="text-xl font-bold">Facilities</h2>
          <div className="mt-3 space-y-4">
            {Object.entries(facilityGroups).map(([g, list]) => (
              <div key={g}>
                <h3 className="text-sm font-semibold text-slate-500">{groupLabel[g] ?? g}</h3>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {list.map((f) => (
                    <li key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
                      <FacilityIcon name={f.icon} className="h-5 w-5 text-brand-600" />
                      {f.name}
                      {f.note && <span className="text-xs text-slate-400">({f.note})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );

  const details = (
    <>
      <section aria-labelledby="location-h">
        <h2 id="location-h" className="text-xl font-bold">
          Location
        </h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {p.addressLine}
          {p.landmark ? `, near ${p.landmark}` : ""}, {p.locality?.name ? `${p.locality.name}, ` : ""}
          {p.city.name}, {p.state} {p.postalCode}
        </p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
          <iframe title={`Map showing ${p.name}`} src={mapSrc} className="h-72 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
        {hasCoords && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            <Navigation className="h-4 w-4" aria-hidden /> Get directions
          </a>
        )}
        {p.nearbyPlaces.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold">What&apos;s nearby</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {p.nearbyPlaces.map((n, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                  <span>
                    {n.name} <span className="text-xs text-slate-400">· {n.type.toLowerCase().replace(/_/g, " ")}</span>
                  </span>
                  <span className="font-medium text-slate-600">{n.distanceKm} km</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {p.rules.length > 0 && (
        <section aria-labelledby="rules-h">
          <h2 id="rules-h" className="text-xl font-bold">
            House rules
          </h2>
          <ul className="mt-3 space-y-2">
            {p.rules.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="policy-h" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 id="policy-h" className="text-xl font-bold">
          Cancellation & refunds
        </h2>
        <div className="mt-3">{p.policy ? <PolicyTiers tiers={p.policy.tiers} name={p.policy.name} description={p.policy.description} /> : <PolicyTiers tiers={[{ hoursBeforeCheckIn: 24, refundBps: 10000 }, { hoursBeforeCheckIn: 0, refundBps: 0 }]} name="Standard" />}</div>
        {p.refundPolicyText && <p className="mt-3 text-sm text-slate-600">{p.refundPolicyText}</p>}
        <p className="mt-3 text-xs text-slate-500">
          Read the full <Link href="/pages/cancellation-policy" className="underline">cancellation policy</Link> and <Link href="/pages/refund-policy" className="underline">refund policy</Link>.
        </p>
      </section>

      <section aria-labelledby="contact-h" className="rounded-2xl bg-brand-50 p-5 ring-1 ring-brand-100">
        <h2 id="contact-h" className="font-semibold">
          Contacting the property
        </h2>
        {p.contactPhone ? (
          <a href={`tel:${p.contactPhone}`} className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-brand-800">
            <Phone className="h-4 w-4" aria-hidden /> {p.contactPhone}
          </a>
        ) : (
          <p className="mt-1 text-sm text-slate-600">For your safety, property contact details are shared after your booking is confirmed. Questions before booking? Chat with StayShare support — we&apos;re happy to help.</p>
        )}
      </section>

      <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-24">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="reviews-h" className="text-xl font-bold">
            Guest reviews
          </h2>
          <RatingPill value={p.ratingAvg} count={p.reviewCount} />
        </div>
        {reviews.breakdown && (
          <div className="mt-4 grid gap-x-8 gap-y-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
            {REVIEW_CATEGORIES.map((c) => {
              const v = (reviews.breakdown as Record<string, number | null>)[c.key];
              if (v == null) return null;
              return (
                <div key={c.key}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{c.label}</span>
                    <span className="font-semibold tabular-nums">{v.toFixed(1)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(v / 5) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {reviews.items.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No reviews yet. Guests can review after their stay.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {reviews.items.map((r) => (
              <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{r.author[0]}</span>
                    <div>
                      <p className="text-sm font-semibold">{r.author.split(" ")[0]}</p>
                      <p className="text-xs text-slate-500">{prettyDate(r.createdAt)}</p>
                    </div>
                  </div>
                  <Stars value={r.overall} />
                </div>
                {r.title && <p className="mt-3 font-semibold">{r.title}</p>}
                {r.text && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{r.text}</p>}
                {r.images.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {r.images.slice(0, 4).map((u) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="h-16 w-16 overflow-hidden rounded-lg">
                        <Img src={u} alt="Guest photo" className="h-full w-full" />
                      </a>
                    ))}
                  </div>
                )}
                {r.replies.map((rep, i) => (
                  <div key={i} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs font-semibold text-slate-600">Response from the property</p>
                    <p className="mt-1 text-slate-700">{rep.text}</p>
                  </div>
                ))}
                <div className="mt-3 flex justify-end">
                  <ReportReviewButton reviewId={r.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );

  return (
    <div className="container-page py-6">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: p.city.name, href: `/search?city=${p.city.slug}` },
          ...(p.locality ? [{ label: p.locality.name, href: `/search?city=${p.city.slug}&q=${encodeURIComponent(p.locality.name)}` }] : []),
          { label: p.name },
        ]}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-brand-700">{p.propertyType}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <RatingPill value={p.ratingAvg} count={p.reviewCount} />
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" aria-hidden />
              {[p.locality?.name, p.city.name].filter(Boolean).join(", ")}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{GENDER_LABEL[p.gender]}</span>
            {p.instantBooking && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Zap className="h-3 w-3" aria-hidden /> Instant booking
              </span>
            )}
            {p.isFeatured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-600">
                <Sparkles className="h-3 w-3" aria-hidden /> Featured
              </span>
            )}
          </div>
        </div>
        <FavouriteButton propertyId={p.id} initial={Boolean(favs?.has(p.id))} withLabel />
      </div>
      <Gallery images={p.images} name={p.name} />
      <div className="mt-8">
        <BookingExperience
          slug={p.slug}
          minStay={p.minStayNights}
          maxStay={p.maxStayNights}
          checkInTime={p.checkInTime}
          checkOutTime={p.checkOutTime}
          rooms={p.rooms}
          initial={{ checkIn, checkOut, guests, roomId: p.rooms.some((r) => r.id === one(sp.room)) ? one(sp.room) : undefined }}
          overview={overview}
          details={details}
        />
      </div>
      {similarItems.length > 0 && (
        <section className="mt-14" aria-labelledby="similar-h">
          <h2 id="similar-h" className="text-xl font-bold">
            Similar stays in {p.city.name}
          </h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {similarItems.map((s) => (
              <PropertyCard key={s.id} p={s} fav={favs ? favs.has(s.id) : undefined} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
