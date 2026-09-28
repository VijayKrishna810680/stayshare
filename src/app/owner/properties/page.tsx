import Link from "next/link";
import { and, asc, count, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { BedDouble, Building2, MapPin, Plus } from "lucide-react";
import { db } from "@/db";
import { beds, cities, localities, properties, propertyImages, propertyTypes, rooms } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { ownerPropertyLimit } from "@/services/subscriptions";
import { Alert, EmptyState, Input, LinkButton, PageHeader, Select, StatusBadge } from "@/components/ui";
import { Img } from "@/components/ui/img";

export const dynamic = "force-dynamic";
export const metadata = { title: "Properties" };

const STATUSES = ["DRAFT", "PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"] as const;

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const rows = await db
    .select({
      id: properties.id,
      code: properties.code,
      name: properties.name,
      approvalStatus: properties.approvalStatus,
      approvalNotes: properties.approvalNotes,
      active: properties.active,
      blocked: properties.blocked,
      city: cities.name,
      locality: localities.name,
      type: propertyTypes.name,
      rating: properties.ratingAvg,
      reviewCount: properties.reviewCount,
      cover: sql<string | null>`(SELECT url FROM ${propertyImages} pi WHERE pi.property_id = ${properties.id} ORDER BY pi.is_cover DESC, pi.sort_order ASC LIMIT 1)`,
      rooms: sql<number>`(SELECT count(*)::int FROM ${rooms} r WHERE r.property_id = ${properties.id} AND r.deleted_at IS NULL)`,
      beds: sql<number>`(SELECT count(*)::int FROM ${beds} b JOIN ${rooms} r ON r.id = b.room_id WHERE r.property_id = ${properties.id} AND b.deleted_at IS NULL AND b.active AND r.deleted_at IS NULL)`,
    })
    .from(properties)
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .leftJoin(localities, eq(localities.id, properties.localityId))
    .where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt), status ? eq(properties.approvalStatus, status) : undefined, sp.q ? ilike(properties.name, `%${sp.q}%`) : undefined))
    .orderBy(desc(properties.createdAt), asc(properties.name));
  const [{ total }] = (await db.select({ total: count(properties.id) }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt)))) as [{ total: number }];
  const limit = await ownerPropertyLimit(u.id);
  const atLimit = Number(total) >= limit;

  return (
    <>
      <PageHeader
        title="Properties"
        description={`${total} of ${limit} properties used on your partner plan`}
        actions={
          atLimit ? (
            <LinkButton href="/owner/subscription" variant="accent">
              Upgrade plan to add more
            </LinkButton>
          ) : (
            <LinkButton href="/owner/properties/new">
              <Plus className="h-4 w-4" /> Add property
            </LinkButton>
          )
        }
      />
      {atLimit && (
        <div className="mb-4">
          <Alert tone="warn" title="Property limit reached">
            Your current plan allows {limit} properties. <Link className="font-semibold underline" href="/owner/subscription">Upgrade your partner plan</Link> to list more buildings.
          </Alert>
        </div>
      )}
      <form className="mb-5 flex flex-col gap-2 sm:flex-row" role="search">
        <Input name="q" defaultValue={sp.q} placeholder="Search by name" aria-label="Search properties" className="sm:max-w-xs" />
        <Select name="status" defaultValue={status ?? ""} aria-label="Filter by status" className="sm:max-w-[200px]">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </Select>
        <button className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">Filter</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title={sp.q || status ? "No properties match" : "List your first property"}
          description="Add your building, floors, rooms and beds. The StayShare team reviews it and sets prices — you focus on hosting."
          action={!atLimit && <LinkButton href="/owner/properties/new">Add property</LinkButton>}
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id} className="card flex flex-col overflow-hidden">
              <Link href={`/owner/properties/${p.id}`} className="relative block">
                <Img src={p.cover} alt={p.name} className="h-40 w-full" fallback="/images/placeholder-building.svg" />
                <div className="absolute left-3 top-3 flex gap-1">
                  <StatusBadge status={p.approvalStatus} />
                  {p.blocked && <StatusBadge status="BLOCKED" />}
                </div>
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-xs text-slate-500">
                  {p.code} · {p.type}
                </p>
                <Link href={`/owner/properties/${p.id}`} className="mt-0.5 font-semibold hover:text-brand-700">
                  {p.name}
                </Link>
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> {[p.locality, p.city].filter(Boolean).join(", ")}
                </p>
                <p className="mt-2 flex items-center gap-1 text-sm text-slate-600">
                  <BedDouble className="h-4 w-4" /> {p.rooms} rooms · {p.beds} beds {p.reviewCount > 0 && <span className="ml-auto">★ {p.rating.toFixed(1)} ({p.reviewCount})</span>}
                </p>
                {p.approvalNotes && ["CHANGES_REQUESTED", "REJECTED"].includes(p.approvalStatus) && <p className="mt-2 rounded-lg bg-purple-50 p-2 text-xs text-purple-800">StayShare: {p.approvalNotes}</p>}
                <div className="mt-auto flex gap-2 pt-4">
                  <LinkButton href={`/owner/properties/${p.id}`} size="sm" variant="secondary" className="flex-1">
                    Manage
                  </LinkButton>
                  {["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(p.approvalStatus) && (
                    <LinkButton href={`/owner/properties/${p.id}/setup?step=basic`} size="sm" variant="outline" className="flex-1">
                      Continue setup
                    </LinkButton>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
