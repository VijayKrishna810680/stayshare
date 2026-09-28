import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ListingCard } from "@/lib/site/search";
import { PropertyCard } from "./property-card";

export function Rail({ title, subtitle, href, items, favs }: { title: string; subtitle?: string; href: string; items: ListingCard[]; favs?: Set<string> | null }) {
  if (!items.length) return null;
  return (
    <section className="container-page mt-14" aria-labelledby={`rail-${href}`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id={`rail-${href}`} className="text-xl font-bold sm:text-2xl">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
          View all <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {items.slice(0, 4).map((p) => (
          <div key={p.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
            <PropertyCard p={p} fav={favs ? favs.has(p.id) : undefined} compact />
          </div>
        ))}
      </div>
    </section>
  );
}
