import Link from "next/link";
import { and, asc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cities, ownerProfiles, pricePlans, properties, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { getSettings } from "@/lib/settings";
import { prettyDate } from "@/lib/dates";
import { Badge, Card, CardBody, CardHeader, EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar, FormDialogButton, Toggle } from "@/components/admin/widgets";
import { cityOptions, one, pageArgs, propertyOptions, type SearchParams } from "../_lib/query";
import { PricingTabs } from "./tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: SearchParams }) {
  await pageUser({ perm: "pricing.manage" });
  const sp = await searchParams;
  const { page, pageSize, offset } = pageArgs(sp, 30);
  const q = one(sp.q);
  const conds: SQL[] = [isNull(rooms.deletedAt)];
  if (q) conds.push(or(ilike(properties.name, `%${q}%`), ilike(properties.code, `%${q}%`), ilike(rooms.roomNumber, `%${q}%`))!);
  if (one(sp.city)) conds.push(eq(properties.cityId, one(sp.city)));
  if (one(sp.property)) conds.push(eq(properties.id, one(sp.property)));
  if (one(sp.status)) conds.push(eq(rooms.approvalStatus, one(sp.status) as "APPROVED"));
  if (one(sp.priced) === "no") conds.push(isNull(pricePlans.id));
  if (one(sp.priced) === "yes") conds.push(sql`${pricePlans.id} is not null`);
  if (one(sp.ac)) conds.push(eq(rooms.isAC, one(sp.ac) === "ac"));
  const where = and(...conds);
  const base = db
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      name: rooms.name,
      category: rooms.category,
      sharing: rooms.sharingCapacity,
      isAC: rooms.isAC,
      status: rooms.approvalStatus,
      sugBed: rooms.suggestedNightlyBed,
      sugRoom: rooms.suggestedNightlyRoom,
      propertyId: properties.id,
      propertyName: properties.name,
      propertyCode: properties.code,
      city: cities.name,
      planId: pricePlans.id,
      nightlyBed: pricePlans.nightlyBed,
      nightlyRoom: pricePlans.nightlyRoom,
      monthlyBed: pricePlans.monthlyBed,
      monthlyRoom: pricePlans.monthlyRoom,
      depositBed: pricePlans.securityDepositBed,
      updatedAt: pricePlans.updatedAt,
    })
    .from(rooms)
    .innerJoin(properties, eq(properties.id, rooms.propertyId))
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .leftJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true)));
  const [rows, total, cityOpts, propOpts, settings, owners, unpriced] = await Promise.all([
    base.where(where).orderBy(asc(properties.name), asc(rooms.roomNumber)).limit(pageSize).offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(rooms)
      .innerJoin(properties, eq(properties.id, rooms.propertyId))
      .leftJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true)))
      .where(where)
      .then((r) => r[0]?.total ?? 0),
    cityOptions(),
    propertyOptions(),
    getSettings(["owner.allowPriceSuggestion"]),
    db.select({ id: users.id, name: users.name, business: ownerProfiles.businessName, canSet: ownerProfiles.canSetFinalPrice }).from(ownerProfiles).innerJoin(users, eq(users.id, ownerProfiles.userId)).orderBy(asc(users.name)),
    db
      .select({ unpriced: sql<number>`count(*)::int` })
      .from(rooms)
      .leftJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true)))
      .where(and(isNull(rooms.deletedAt), isNull(pricePlans.id)))
      .then((r) => r[0]?.unpriced ?? 0),
  ]);
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader
        title="Pricing"
        description="All customer-facing prices are set by the StayShare team. Owners never enter prices unless price suggestions are enabled below."
        actions={
          <>
            <FormDialogButton
              url="/api/admin/pricing/adjust"
              label="Adjust property prices by %"
              title="Bulk adjust a property"
              description="Scales nightly, weekly, monthly and package prices of every priced room in the property. Creates new plans and price-history rows."
              fields={[
                { name: "scope", label: "Scope", type: "select", options: [{ value: "PROPERTY", label: "Property" }], required: true, defaultValue: "PROPERTY" },
                { name: "scopeId", label: "Property", type: "select", options: propOpts, required: true },
                { name: "percentBps", label: "Change", type: "percent", required: true, hint: "e.g. 10 for +10%, -5 for −5%" },
                { name: "includeExtras", label: "Also scale extras (food, laundry, AC, cleaning…)", type: "checkbox" },
                { name: "reason", label: "Reason", type: "textarea", required: true },
              ]}
              submitText="Apply adjustment"
              success="Prices adjusted"
            />
            <FormDialogButton
              url="/api/admin/pricing/adjust"
              label="Adjust city prices by %"
              title="Bulk adjust a city"
              description="Scales base prices of every priced room in all properties of the city."
              fields={[
                { name: "scope", label: "Scope", type: "select", options: [{ value: "CITY", label: "City" }], required: true, defaultValue: "CITY" },
                { name: "scopeId", label: "City", type: "select", options: cityOpts, required: true },
                { name: "percentBps", label: "Change", type: "percent", required: true },
                { name: "includeExtras", label: "Also scale extras", type: "checkbox" },
                { name: "reason", label: "Reason", type: "textarea", required: true },
              ]}
              submitText="Apply adjustment"
              success="Prices adjusted"
            />
          </>
        }
      />
      <PricingTabs active="rooms" />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Owner price input" description="Global setting owner.allowPriceSuggestion" />
          <CardBody className="space-y-3 text-sm">
            <Toggle url="/api/admin/settings" method="PUT" field="owner.allowPriceSuggestion" value={Boolean(settings["owner.allowPriceSuggestion"])} label="Let owners submit suggested prices" />
            <p className="text-xs text-slate-500">Suggestions are never shown to customers. They appear next to the editor for your team to review. {unpriced > 0 && <strong className="text-amber-700">{unpriced} room(s) have no price plan yet.</strong>}</p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Owners allowed to set final prices" description="ownerProfiles.canSetFinalPrice — off by default; only grant to trusted partners." />
          <CardBody className="max-h-48 space-y-2 overflow-y-auto">
            {owners.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/admin/users/owners/${o.id}`} className="truncate hover:underline">
                  {o.name} <span className="text-slate-500">· {o.business}</span>
                </Link>
                <Toggle url={`/api/admin/owners/${o.id}`} field="canSetFinalPrice" value={o.canSet} label="Can set final price" />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
      <FilterBar
        fields={[
          { name: "q", label: "Search", type: "text", placeholder: "Property, code or room no." },
          { name: "city", label: "City", type: "select", options: cityOpts },
          { name: "property", label: "Property", type: "select", options: propOpts },
          { name: "status", label: "Room status", type: "select", options: ["APPROVED", "PENDING", "DRAFT", "REJECTED", "CHANGES_REQUESTED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) },
          { name: "priced", label: "Price plan", type: "select", options: [{ value: "no", label: "Missing" }, { value: "yes", label: "Priced" }] },
          { name: "ac", label: "AC", type: "select", options: [{ value: "ac", label: "AC" }, { value: "nonac", label: "Non-AC" }] },
        ]}
      />
      {!rows.length ? (
        <EmptyState title="No rooms match" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Property / room</TH>
              <TH>Type</TH>
              <TH>Status</TH>
              <TH className="text-right">Nightly bed</TH>
              <TH className="text-right">Nightly room</TH>
              <TH className="text-right">Monthly bed</TH>
              <TH className="text-right">Monthly room</TH>
              <TH>Owner suggested</TH>
              <TH>Updated</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <p className="font-medium">{r.propertyName}</p>
                  <p className="text-xs text-slate-500">
                    {r.city} · Room {r.roomNumber}
                    {r.name ? ` · ${r.name}` : ""}
                  </p>
                </TD>
                <TD className="text-xs">
                  {r.category.toLowerCase()} · {r.sharing}-share · {r.isAC ? "AC" : "Non-AC"}
                </TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD className="text-right">{r.planId ? r.nightlyBed != null ? <Money paise={r.nightlyBed} /> : "—" : <Badge tone="amber">No plan</Badge>}</TD>
                <TD className="text-right">{r.nightlyRoom != null ? <Money paise={r.nightlyRoom} /> : "—"}</TD>
                <TD className="text-right">{r.monthlyBed != null ? <Money paise={r.monthlyBed} /> : "—"}</TD>
                <TD className="text-right">{r.monthlyRoom != null ? <Money paise={r.monthlyRoom} /> : "—"}</TD>
                <TD className="text-xs text-slate-600">{r.sugBed != null || r.sugRoom != null ? `${r.sugBed != null ? `bed ₹${r.sugBed / 100}` : ""} ${r.sugRoom != null ? `room ₹${r.sugRoom / 100}` : ""}` : "—"}</TD>
                <TD className="whitespace-nowrap text-xs">{r.updatedAt ? prettyDate(r.updatedAt) : "—"}</TD>
                <TD className="text-right">
                  <Link href={`/admin/pricing/rooms/${r.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                    {r.planId ? "Edit prices" : "Set prices"}
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/pricing" query={query} />
    </>
  );
}
