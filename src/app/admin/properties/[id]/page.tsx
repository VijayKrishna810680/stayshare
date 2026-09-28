import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { beds, cancellationPolicies, cities, localities, pricePlans, properties, propertyTypes, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { Badge, Card, CardBody, CardHeader, DescList, LinkButton, Money, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FormDialogButton, SelectAction, Toggle } from "@/components/admin/widgets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Property" };

const GENDER = ["MALE_ONLY", "FEMALE_ONLY", "MIXED", "FAMILY", "ANY"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase() }));

export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await pageUser({ perm: ["properties.view", "properties.manage"] });
  const { id } = await params;
  const [row] = await db
    .select({ p: properties, city: cities.name, type: propertyTypes.name, owner: users.name, ownerId: users.id })
    .from(properties)
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .innerJoin(users, eq(users.id, properties.ownerId))
    .where(eq(properties.id, id));
  if (!row) notFound();
  const { p } = row;
  const [roomRows, bedRows, policies, locs] = await Promise.all([
    db.select({ r: rooms, planId: pricePlans.id, nightlyBed: pricePlans.nightlyBed, nightlyRoom: pricePlans.nightlyRoom }).from(rooms).leftJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true))).where(and(eq(rooms.propertyId, id), isNull(rooms.deletedAt))).orderBy(asc(rooms.roomNumber)),
    db.select({ b: beds }).from(beds).innerJoin(rooms, eq(rooms.id, beds.roomId)).where(and(eq(rooms.propertyId, id), isNull(beds.deletedAt))).orderBy(asc(beds.code)),
    db.select({ id: cancellationPolicies.id, name: cancellationPolicies.name }).from(cancellationPolicies).where(eq(cancellationPolicies.active, true)),
    db.select({ id: localities.id, name: localities.name }).from(localities).where(eq(localities.cityId, p.cityId)).orderBy(asc(localities.name)),
  ]);
  const m = u.has("properties.manage");
  const flags: [string, string, boolean][] = [
    ["active", "Active (listed)", p.active],
    ["blocked", "Blocked by admin", p.blocked],
    ["isFeatured", "Featured", p.isFeatured],
    ["showOwnerPhone", "Show owner/property phone to guests", p.showOwnerPhone],
    ["allowCashAtProperty", "Allow pay at property", p.allowCashAtProperty],
    ["instantBooking", "Instant booking", p.instantBooking],
    ["idProofRequired", "ID proof required", p.idProofRequired],
    ["foodIncluded", "Food included", p.foodIncluded],
  ];
  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.code} · ${row.type} · ${row.city}`}
        breadcrumbs={[{ label: "Properties", href: "/admin/properties" }, { label: p.name }]}
        actions={
          <>
            {u.has("properties.approve") && (
              <LinkButton href={`/admin/approvals/${p.id}`} variant="outline" size="sm">
                Review & media
              </LinkButton>
            )}
            {m && (
              <FormDialogButton
                url={`/api/admin/properties/${p.id}`}
                method="PATCH"
                label="Edit details"
                variant="primary"
                title="Edit property"
                fields={[
                  { name: "name", label: "Name", required: true, defaultValue: p.name },
                  { name: "description", label: "Description", type: "textarea", required: true, defaultValue: p.description },
                  { name: "addressLine", label: "Address", required: true, defaultValue: p.addressLine },
                  { name: "landmark", label: "Landmark", defaultValue: p.landmark ?? "" },
                  { name: "localityId", label: "Locality", type: "select", options: locs.map((l) => ({ value: l.id, label: l.name })), defaultValue: p.localityId ?? "" },
                  { name: "postalCode", label: "PIN code", required: true, defaultValue: p.postalCode },
                  { name: "genderEligibility", label: "Guests", type: "select", options: GENDER, required: true, defaultValue: p.genderEligibility },
                  { name: "minStayNights", label: "Min stay (nights)", type: "number", required: true, defaultValue: p.minStayNights },
                  { name: "maxStayNights", label: "Max stay (nights)", type: "number", required: true, defaultValue: p.maxStayNights },
                  { name: "checkInTime", label: "Check-in time (HH:MM)", required: true, defaultValue: p.checkInTime },
                  { name: "checkOutTime", label: "Check-out time (HH:MM)", required: true, defaultValue: p.checkOutTime },
                  { name: "contactPhone", label: "Property contact phone", defaultValue: p.contactPhone ?? "" },
                ]}
                success="Property updated"
              />
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" action={<StatusBadge status={p.approvalStatus} />} />
          <CardBody>
            <DescList
              items={[
                { label: "Owner", value: <Link href={`/admin/users/owners/${row.ownerId}`} className="text-brand-700 hover:underline">{row.owner}</Link> },
                { label: "Address", value: `${p.addressLine}, ${p.state} ${p.postalCode}` },
                { label: "Guests", value: p.genderEligibility.replace("_", " ").toLowerCase() },
                { label: "Stay", value: `${p.minStayNights}–${p.maxStayNights} nights · in ${p.checkInTime} / out ${p.checkOutTime}` },
                { label: "Starting price", value: p.startingPrice ? <Money paise={p.startingPrice} /> : "Unpriced" },
                { label: "Rating", value: p.reviewCount ? `★ ${p.ratingAvg.toFixed(2)} from ${p.reviewCount} reviews` : "No reviews" },
                { label: "Bookings", value: p.bookingCount },
                {
                  label: "Cancellation policy",
                  value: m || u.has("policies.manage") ? <SelectAction url={`/api/admin/properties/${p.id}/policy`} method="POST" field="cancellationPolicyId" value={p.cancellationPolicyId} options={policies.map((x) => ({ value: x.id, label: x.name }))} label="Cancellation policy" allowEmpty="— Not set —" /> : (policies.find((x) => x.id === p.cancellationPolicyId)?.name ?? "—"),
                },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Controls" />
          <CardBody className="space-y-3">
            {flags.map(([k, l, v]) => (m ? <div key={k}><Toggle url={`/api/admin/properties/${p.id}`} field={k} value={v} label={l} /></div> : <p key={k} className="text-sm">{l}: {v ? "Yes" : "No"}</p>))}
          </CardBody>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Rooms</h2>
      <Table>
        <THead>
          <tr>
            <TH>Room</TH>
            <TH>Type</TH>
            <TH>Approval</TH>
            <TH>Price</TH>
            <TH>Maintenance</TH>
            <TH>Cleaning</TH>
            <TH>Active</TH>
          </tr>
        </THead>
        <TBody>
          {roomRows.map(({ r, planId, nightlyBed, nightlyRoom }) => (
            <TR key={r.id}>
              <TD>
                <p className="font-medium">Room {r.roomNumber}</p>
                <p className="text-xs text-slate-500">{r.name}</p>
              </TD>
              <TD className="text-xs">
                {r.category.toLowerCase()} · {r.sharingCapacity}-share · {r.isAC ? "AC" : "Non-AC"} · max {r.maxOccupancy}
              </TD>
              <TD>
                <StatusBadge status={r.approvalStatus} />
              </TD>
              <TD className="text-xs">
                {planId ? (
                  <>
                    {nightlyBed != null && <>bed <Money paise={nightlyBed} /> </>}
                    {nightlyRoom != null && <>room <Money paise={nightlyRoom} /></>}
                  </>
                ) : (
                  <Badge tone="amber">No plan</Badge>
                )}
                {u.has("pricing.manage") && (
                  <Link href={`/admin/pricing/rooms/${r.id}`} className="ml-2 text-brand-700 hover:underline">
                    Prices
                  </Link>
                )}
              </TD>
              <TD>{m ? <SelectAction url={`/api/admin/rooms/${r.id}`} field="maintenanceStatus" value={r.maintenanceStatus} options={[{ value: "OK", label: "OK" }, { value: "UNDER_MAINTENANCE", label: "Under maintenance" }]} label="Maintenance" /> : <StatusBadge status={r.maintenanceStatus} />}</TD>
              <TD>{m ? <SelectAction url={`/api/admin/rooms/${r.id}`} field="cleaningStatus" value={r.cleaningStatus} options={[{ value: "CLEAN", label: "Clean" }, { value: "NEEDS_CLEANING", label: "Needs cleaning" }, { value: "IN_PROGRESS", label: "In progress" }]} label="Cleaning" /> : <StatusBadge status={r.cleaningStatus} />}</TD>
              <TD>{m ? <Toggle url={`/api/admin/rooms/${r.id}`} field="active" value={r.active} label={`Room ${r.roomNumber} active`} /> : r.active ? "Yes" : "No"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Beds ({bedRows.length})</h2>
      <Table>
        <THead>
          <tr>
            <TH>Bed</TH>
            <TH>Type</TH>
            <TH>Status</TH>
            <TH>Active</TH>
          </tr>
        </THead>
        <TBody>
          {bedRows.map(({ b }) => (
            <TR key={b.id}>
              <TD>
                <code className="text-xs">{b.code}</code>
              </TD>
              <TD className="text-xs">{b.bedType.replace("_", " ").toLowerCase()}</TD>
              <TD>{m ? <SelectAction url={`/api/admin/beds/${b.id}`} field="status" value={b.status} options={["AVAILABLE", "OCCUPIED", "RESERVED", "BLOCKED", "CLEANING"].map((s) => ({ value: s, label: s.toLowerCase() }))} label={`Bed ${b.code} status`} /> : <StatusBadge status={b.status} />}</TD>
              <TD>{m ? <Toggle url={`/api/admin/beds/${b.id}`} field="active" value={b.active} label={`Bed ${b.code} active`} /> : b.active ? "Yes" : "No"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
