import Link from "next/link";
import { MapPin, Snowflake, UtensilsCrossed, Zap } from "lucide-react";
import { Img } from "@/components/ui/img";
import { formatINR } from "@/lib/money";
import { CATEGORY_LABEL, GENDER_LABEL } from "@/lib/site/labels";
import type { ListingCard } from "@/lib/site/search";
import { FavouriteButton } from "./favourite-button";
import { RatingPill } from "./stars";

export function PropertyCard({ p, fav, query, compact }: { p: ListingCard; fav?: boolean; query?: string; compact?: boolean }) {
  const href = `/property/${p.slug}${query ? `?${query}` : ""}`;
  const genderTone = p.gender === "FEMALE_ONLY" ? "bg-pink-50 text-pink-700" : p.gender === "MALE_ONLY" ? "bg-sky-50 text-sky-700" : p.gender === "FAMILY" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-700";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-slate-100" tabIndex={-1} aria-hidden>
        <Img src={p.image} alt="" fallback="/images/placeholder-building.svg" className="h-full w-full transition duration-500 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {p.isFeatured && <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow">Featured</span>}
          {p.availableBeds !== null && p.availableBeds <= 5 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow">{p.availableBeds} bed{p.availableBeds === 1 ? "" : "s"} left</span>}
        </div>
      </Link>
      {fav !== undefined && <FavouriteButton propertyId={p.id} initial={fav} className="absolute right-3 top-3 z-10" />}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">{p.propertyType}</p>
          <RatingPill value={p.ratingAvg} />
        </div>
        <h3 className="mt-1 line-clamp-1 text-base font-semibold text-slate-900">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus:outline-none">
            {p.name}
          </Link>
        </h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-1">
            {[p.locality, p.city].filter(Boolean).join(", ")}
            {p.distanceKm !== null && ` · ${p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`} away`}
          </span>
        </p>
        {!compact && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium">
            <span className={`rounded-full px-2 py-0.5 ${genderTone}`}>{GENDER_LABEL[p.gender] ?? p.gender}</span>
            {p.categories.slice(0, 2).map((c) => (
              <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                {CATEGORY_LABEL[c] ?? c}
              </span>
            ))}
            {p.hasAC && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
                <Snowflake className="h-3 w-3" aria-hidden /> AC
              </span>
            )}
            {p.foodIncluded && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
                <UtensilsCrossed className="h-3 w-3" aria-hidden /> Food
              </span>
            )}
            {p.instantBooking && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                <Zap className="h-3 w-3" aria-hidden /> Instant
              </span>
            )}
          </div>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            {p.fromNightly !== null ? (
              <p className="text-slate-900">
                <span className="text-xs text-slate-500">from </span>
                <span className="text-lg font-bold tabular-nums">{formatINR(p.fromNightly)}</span>
                <span className="text-xs text-slate-500">/night</span>
              </p>
            ) : p.fromMonthly !== null ? (
              <p className="text-slate-900">
                <span className="text-xs text-slate-500">from </span>
                <span className="text-lg font-bold tabular-nums">{formatINR(p.fromMonthly)}</span>
                <span className="text-xs text-slate-500">/month</span>
              </p>
            ) : null}
            {p.fromNightly !== null && p.fromMonthly !== null && <p className="text-xs font-medium text-brand-700">{formatINR(p.fromMonthly)}/month</p>}
          </div>
          {p.reviewCount > 0 && <p className="text-xs text-slate-500">{p.reviewCount} reviews</p>}
        </div>
      </div>
    </article>
  );
}
