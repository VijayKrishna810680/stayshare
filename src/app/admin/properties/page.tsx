import Link from "next/link";
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cities, properties, propertyTypes, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { Badge, EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar, Toggle } from "@/components/admin/widgets";
import { cityOptions, one, ownerOptions, pageArgs, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Properties" };

export default async function PropertiesPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: ["properties.view", "properties.manage"] });
  const sp = await searchParams;
  const { page, pageSize, offset } = pageArgs(sp, 25);
  const conds: SQL[] = [isNull(properties.deletedAt)];
  const q = one(sp.q).trim();
  if (q) conds.push(or(ilike(properties.name, `%${q}%`), ilike(properties.code, `%${q}%`))!);
  if (one(sp.city)) conds.push(eq(properties.cityId, one(sp.city)));
  if (one(sp.owner)) conds.push(eq(properties.ownerId, one(sp.owner)));
  if (one(sp.status)) conds.push(eq(properties.approvalStatus, one(sp.status) as "APPROVED"));
  if (one(sp.flag) === "blocked") conds.push(eq(properties.blocked, true));
  if (one(sp.flag) === "inactive") conds.push(eq(properties.active, false));
  if (one(sp.flag) === "featured") conds.push(eq(properties.isFeatured, true));
  const where = and(...conds);
  const [rows, total, cityOpts, owners] = await Promise.all([
    db
      .select({ p: properties, city: cities.name, type: propertyTypes.name, owner: users.name, rooms: sql<number>`(select count(*)::int from rooms r where r.property_id = ${properties.id} and r.deleted_at is null)`, beds: sql<number>`(select count(*)::int from beds b join rooms r on r.id = b.room_id where r.property_id = ${properties.id} and b.deleted_at is null and b.active)` })
      .from(properties)
      .innerJoin(cities, eq(cities.id, properties.cityId))
      .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
      .innerJoin(users, eq(users.id, properties.ownerId))
      .where(where)
      .orderBy(desc(properties.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(properties)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    cityOptions(),
    ownerOptions(),
  ]);
  const canManage = u.has("properties.manage");
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader title="Properties" description="Every listing on the platform. Block a property to hide it from search and stop new bookings immediately." />
      <FilterBar
        fields={[
          { name: "q", label: "Search", type: "text", placeholder: "Name or code" },
          { name: "city", label: "City", type: "select", options: cityOpts },
          { name: "owner", label: "Owner", type: "select", options: owners },
          { name: "status", label: "Approval", type: "select", options: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) },
          { name: "flag", label: "Flag", type: "select", options: [{ value: "blocked", label: "Blocked" }, { value: "inactive", label: "Inactive" }, { value: "featured", label: "Featured" }] },
        ]}
      />
      {!rows.length ? (
        <EmptyState title="No properties found" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Property</TH>
              <TH>Owner</TH>
              <TH>Inventory</TH>
              <TH>Approval</TH>
              <TH className="text-right">From / night</TH>
              <TH>Rating</TH>
              {canManage && <TH>Active</TH>}
              {canManage && <TH>Blocked</TH>}
              {canManage && <TH>Featured</TH>}
            </tr>
          </THead>
          <TBody>
            {rows.map(({ p, city, type, owner, rooms, beds }) => (
              <TR key={p.id}>
                <TD>
                  <Link href={`/admin/properties/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {p.code} · {type} · {city}
                  </p>
                </TD>
                <TD className="text-sm">{owner}</TD>
                <TD className="text-xs">
                  {rooms} rooms · {beds} beds
                </TD>
                <TD>
                  <StatusBadge status={p.approvalStatus} />
                </TD>
                <TD className="text-right">{p.startingPrice ? <Money paise={p.startingPrice} /> : <Badge tone="amber">Unpriced</Badge>}</TD>
                <TD className="text-xs">{p.reviewCount ? `★ ${p.ratingAvg.toFixed(1)} (${p.reviewCount})` : "—"}</TD>
                {canManage && (
                  <TD>
                    <Toggle url={`/api/admin/properties/${p.id}`} field="active" value={p.active} label={`Active: ${p.name}`} />
                  </TD>
                )}
                {canManage && (
                  <TD>
                    <Toggle url={`/api/admin/properties/${p.id}`} field="blocked" value={p.blocked} label={`Blocked: ${p.name}`} />
                  </TD>
                )}
                {canManage && (
                  <TD>
                    <Toggle url={`/api/admin/properties/${p.id}`} field="isFeatured" value={p.isFeatured} label={`Featured: ${p.name}`} />
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/properties" query={query} />
    </>
  );
}
