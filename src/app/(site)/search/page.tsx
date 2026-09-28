import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { SearchX } from "lucide-react";
import { db } from "@/db";
import { cities, propertyTypes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { prettyDate } from "@/lib/dates";
import { parseSearchParams, searchProperties } from "@/lib/site/search";
import { CATEGORY_LABEL } from "@/lib/site/labels";
import { Breadcrumbs, EmptyState, LinkButton, Pagination } from "@/components/ui";
import { PropertyCard } from "@/components/site/property-card";
import { FilterPanel, MobileFilterButton, SearchBar, SortSelect } from "@/components/site/search-filters";
import { favouriteSet } from "@/components/site/favs";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const p = parseSearchParams(await searchParams);
  const [c] = p.city ? await db.select({ name: cities.name }).from(cities).where(eq(cities.slug, p.city)) : [];
  return { title: c ? `Stays in ${c.name}` : p.q ? `Stays matching “${p.q}”` : "Search stays" };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const params = parseSearchParams(raw);
  const user = await getCurrentUser();
  const [result, types, cityRow, favs] = await Promise.all([
    searchProperties(params),
    db.select({ key: propertyTypes.key, name: propertyTypes.name }).from(propertyTypes).where(eq(propertyTypes.active, true)).orderBy(asc(propertyTypes.sortOrder)),
    params.city ? db.select({ name: cities.name }).from(cities).where(eq(cities.slug, params.city)).then((r) => r[0] ?? null) : Promise.resolve(null),
    favouriteSet(user?.id),
  ]);
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) flat[k] = v === undefined ? undefined : String(v);
  const carry = new URLSearchParams(
    Object.entries({ checkIn: flat.checkIn, checkOut: flat.checkOut, guests: flat.guests }).filter(([, v]) => v) as [string, string][],
  ).toString();
  const title = cityRow ? `Stays in ${cityRow.name}` : params.q ? `Results for “${params.q}”` : params.lat ? "Stays near you" : params.stay === "monthly" ? "Monthly stays" : params.type ? `${CATEGORY_LABEL[params.type]}s` : "All stays";

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Search", href: "/search" }, ...(cityRow ? [{ label: cityRow.name }] : [])]} />
      <SearchBar params={flat} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <FilterPanel params={flat} propertyTypes={types} />
          </div>
        </aside>
        <section aria-labelledby="results-h">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 id="results-h" className="text-xl font-bold sm:text-2xl">
                {title}
              </h1>
              <p className="text-sm text-slate-500">
                {result.total} propert{result.total === 1 ? "y" : "ies"}
                {result.datesApplied && ` available ${prettyDate(params.checkIn!)} – ${prettyDate(params.checkOut!)}`}
                {params.guests ? ` · ${params.guests} guest${params.guests > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <MobileFilterButton params={flat} propertyTypes={types} />
              <SortSelect params={flat} />
            </div>
          </div>
          {result.items.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title="No stays match your search"
              description={result.datesApplied ? "Everything matching these filters is fully booked for your dates. Try different dates or fewer filters." : "Try removing a few filters, searching a nearby locality or another city."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <LinkButton href="/search" variant="outline">
                    Clear all filters
                  </LinkButton>
                  <LinkButton href="/">Back to home</LinkButton>
                </div>
              }
            />
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((p) => (
                  <PropertyCard key={p.id} p={p} fav={favs ? favs.has(p.id) : undefined} query={carry} />
                ))}
              </div>
              <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath="/search" query={flat} />
            </>
          )}
          <p className="mt-8 text-xs text-slate-500">
            Prices are set by StayShare and shown before taxes & fees; you&apos;ll see the full breakdown before paying. <Link href="/pages/cancellation-policy" className="underline">Cancellation policy</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
