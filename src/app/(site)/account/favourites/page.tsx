import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Heart } from "lucide-react";
import { db } from "@/db";
import { favourites } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { searchProperties } from "@/lib/site/search";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PropertyCard } from "@/components/site/property-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved properties" };

export default async function FavouritesPage() {
  const user = await pageUser({ next: "/account/favourites" });
  const favRows = await db.select({ id: favourites.propertyId }).from(favourites).where(eq(favourites.userId, user.id)).orderBy(desc(favourites.createdAt));
  const ids = favRows.map((f) => f.id);
  const { items } = ids.length ? await searchProperties({ pageSize: 48 }, { ids }) : { items: [] };
  const byId = new Map(items.map((i) => [i.id, i]));
  const cards = ids.map((id) => byId.get(id)).filter(Boolean) as typeof items;
  const unavailable = ids.length - cards.length;
  return (
    <div>
      <PageHeader title="Saved properties" description="Places you've saved for later." breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Saved" }]} />
      {cards.length === 0 ? (
        <EmptyState icon={<Heart className="h-6 w-6" />} title="No saved properties yet" description="Tap the heart on any property to save it here." action={<LinkButton href="/search">Explore stays</LinkButton>} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((p) => (
            <PropertyCard key={p.id} p={p} fav />
          ))}
        </div>
      )}
      {unavailable > 0 && <p className="mt-4 text-sm text-slate-500">{unavailable} saved propert{unavailable === 1 ? "y is" : "ies are"} currently unavailable.</p>}
    </div>
  );
}
