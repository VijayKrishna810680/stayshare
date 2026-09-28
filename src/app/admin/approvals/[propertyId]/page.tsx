import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { beds, cancellationPolicies, cities, facilities, fileUploads, localities, ownerProfiles, properties, propertyDocuments, propertyFacilities, propertyImages, propertyRules, propertyTypes, roomFacilities, roomImages, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Alert, Badge, Card, CardBody, CardHeader, DescList, EmptyState, Money, PageHeader, StatusBadge } from "@/components/ui";
import { Img } from "@/components/ui/img";
import { PricingEditor } from "@/components/admin/pricing-editor";
import { ActionButton } from "@/components/admin/widgets";
import { roomPricingFrom } from "../../_lib/pricing-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Property review" };

export default async function ReviewPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const u = await pageUser({ perm: "properties.approve" });
  const { propertyId } = await params;
  const [row] = await db
    .select({ p: properties, city: cities.name, locality: localities.name, type: propertyTypes.name, policy: cancellationPolicies.name, owner: users, op: ownerProfiles })
    .from(properties)
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .leftJoin(localities, eq(localities.id, properties.localityId))
    .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .leftJoin(cancellationPolicies, eq(cancellationPolicies.id, properties.cancellationPolicyId))
    .innerJoin(users, eq(users.id, properties.ownerId))
    .leftJoin(ownerProfiles, eq(ownerProfiles.userId, properties.ownerId))
    .where(eq(properties.id, propertyId));
  if (!row) notFound();
  const { p, owner, op } = row;
  const [imgs, facs, docs, rules, roomRows] = await Promise.all([
    db.select().from(propertyImages).where(eq(propertyImages.propertyId, p.id)).orderBy(asc(propertyImages.sortOrder)),
    db.select({ id: facilities.id, name: facilities.name, isCustom: facilities.isCustom, status: propertyFacilities.status, note: propertyFacilities.note }).from(propertyFacilities).innerJoin(facilities, eq(facilities.id, propertyFacilities.facilityId)).where(eq(propertyFacilities.propertyId, p.id)).orderBy(asc(facilities.name)),
    db.select({ d: propertyDocuments, fileName: fileUploads.fileName, mime: fileUploads.mimeType }).from(propertyDocuments).leftJoin(fileUploads, eq(fileUploads.id, propertyDocuments.fileId)).where(eq(propertyDocuments.propertyId, p.id)),
    db.select().from(propertyRules).where(eq(propertyRules.propertyId, p.id)).orderBy(asc(propertyRules.sortOrder)),
    db.select().from(rooms).where(and(eq(rooms.propertyId, p.id), isNull(rooms.deletedAt))).orderBy(asc(rooms.roomNumber)),
  ]);
  const roomData = await Promise.all(
    roomRows.map(async (r) => ({
      r,
      pricing: await roomPricingFrom(r),
      images: await db.select().from(roomImages).where(eq(roomImages.roomId, r.id)).orderBy(asc(roomImages.sortOrder)),
      beds: await db.select({ id: beds.id, no: beds.bedNumber, type: beds.bedType, status: beds.status }).from(beds).where(and(eq(beds.roomId, r.id), isNull(beds.deletedAt))),
      facs: await db.select({ name: facilities.name }).from(roomFacilities).innerJoin(facilities, eq(facilities.id, roomFacilities.facilityId)).where(eq(roomFacilities.roomId, r.id)),
    })),
  );
  const approvedRooms = roomRows.filter((r) => r.approvalStatus === "APPROVED").length;
  const unpriced = roomData.filter((x) => !x.pricing.plan).length;
  const canPrice = u.has("pricing.manage");

  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.code} · ${row.type} · ${row.locality ? `${row.locality}, ` : ""}${row.city}`}
        breadcrumbs={[{ label: "Approvals", href: "/admin/approvals" }, { label: p.name }]}
        actions={
          <>
            <ActionButton url={`/api/admin/properties/${p.id}/review`} body={{ action: "changes" }} label="Request changes" note={{ field: "notes", label: "What should the owner change?", required: true }} success="Changes requested — owner notified" />
            <ActionButton url={`/api/admin/properties/${p.id}/review`} body={{ action: "reject" }} label="Reject" danger note={{ field: "notes", label: "Reason for rejection (shared with owner)", required: true }} success="Property rejected — owner notified" />
            <ActionButton
              url={`/api/admin/properties/${p.id}/review`}
              body={{ action: "approve", approveAssets: true }}
              label="Approve property"
              variant="primary"
              confirm="Approve and publish this property?"
              confirmText="Approve & publish"
              note={{ field: "notes", label: "Notes for the owner (optional). All pending property images & facilities will be approved too." }}
              success="Property approved — it is now live"
              disabled={approvedRooms === 0}
            />
          </>
        }
      />
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          Status <StatusBadge status={p.approvalStatus} />
          {p.submittedAt && <span className="text-slate-500">· submitted {prettyDateTime(p.submittedAt)}</span>}
          {p.approvedAt && <span className="text-slate-500">· approved {prettyDateTime(p.approvedAt)}</span>}
          {p.blocked && <Badge tone="red">Blocked</Badge>}
        </div>
        {p.approvalNotes && <Alert tone="info" title="Last review notes">{p.approvalNotes}</Alert>}
        {approvedRooms === 0 && (
          <Alert tone="warn" title="Approve rooms first">
            A property can be approved only after at least one room is approved. Each room needs a price plan entered by the StayShare team{unpriced ? ` — ${unpriced} room(s) still have no prices` : ""}. Use the pricing editor under each room below.
          </Alert>
        )}
        {op && op.kycStatus !== "APPROVED" && (
          <Alert tone="warn" title={`Owner KYC is ${op.kycStatus.toLowerCase().replace("_", " ")}`}>
            You can still publish the property, but payouts need approved KYC and verified bank details. <Link href={`/admin/users/owners/${owner.id}`} className="underline">Review owner</Link>
          </Alert>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Listing details" />
          <CardBody className="space-y-5">
            <DescList
              items={[
                { label: "Address", value: `${p.addressLine}${p.landmark ? `, near ${p.landmark}` : ""}, ${p.state} ${p.postalCode}` },
                { label: "Map", value: p.latitude && p.longitude ? <a className="text-brand-700 underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}>{p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}</a> : "—" },
                { label: "Guests", value: p.genderEligibility.replace(/_/g, " ").toLowerCase() },
                { label: "Stay length", value: `${p.minStayNights}–${p.maxStayNights} nights` },
                { label: "Check-in / out", value: `${p.checkInTime} / ${p.checkOutTime}` },
                { label: "Cancellation policy", value: row.policy ?? "Not set" },
                { label: "Instant booking", value: p.instantBooking ? "Yes" : "No (owner approval)" },
                { label: "ID proof required", value: p.idProofRequired ? "Yes" : "No" },
                { label: "Cash at property", value: p.allowCashAtProperty ? "Allowed" : "No" },
                { label: "Food included", value: p.foodIncluded ? "Yes" : "No" },
                { label: "Contact phone", value: p.contactPhone ?? "—" },
                { label: "Target audience", value: p.targetAudience.join(", ") || "—" },
              ]}
            />
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Description</h4>
              <p className="whitespace-pre-line text-sm text-slate-700">{p.description}</p>
            </div>
            {rules.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">House rules</h4>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {rules.map((r) => (
                    <li key={r.id}>{r.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.nearbyPlaces.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Nearby</h4>
                <p className="text-sm">{p.nearbyPlaces.map((n) => `${n.name} (${n.distanceKm} km)`).join(" · ")}</p>
              </div>
            )}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Owner" action={<Link className="text-sm text-brand-700 hover:underline" href={`/admin/users/owners/${owner.id}`}>Open</Link>} />
            <CardBody>
              <DescList
                className="sm:grid-cols-1"
                items={[
                  { label: "Name", value: owner.name },
                  { label: "Business", value: op?.businessName ?? "—" },
                  { label: "Contact", value: owner.email ?? owner.phone },
                  { label: "KYC", value: <StatusBadge status={op?.kycStatus} /> },
                  { label: "Bank", value: op?.bankVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge> },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Documents" />
            <CardBody className="space-y-3">
              {!docs.length && <p className="text-sm text-slate-500">No documents uploaded.</p>}
              {docs.map(({ d, fileName }) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <a href={`/api/files/${d.fileId}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                      {d.docType.replace(/_/g, " ")}
                    </a>
                    <p className="text-xs text-slate-500">{fileName}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={d.status} />
                    {d.status !== "APPROVED" && <ActionButton url={`/api/admin/documents/${d.id}`} method="PATCH" body={{ status: "APPROVED" }} label="Approve" success="Approved" />}
                    {d.status !== "REJECTED" && <ActionButton url={`/api/admin/documents/${d.id}`} method="PATCH" body={{ status: "REJECTED" }} label="Reject" danger note={{ field: "notes", label: "Reason", required: true }} success="Rejected" />}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Property images" description="Approve or reject each image. Only approved images are shown to customers." />
        <CardBody>
          {!imgs.length ? (
            <p className="text-sm text-slate-500">No images.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {imgs.map((i) => (
                <div key={i.id} className="overflow-hidden rounded-xl border border-slate-200">
                  <a href={i.url} target="_blank" rel="noopener noreferrer">
                    <Img src={i.url} alt={i.caption ?? "Property image"} className="h-36 w-full" />
                  </a>
                  <div className="space-y-2 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate">{i.caption ?? "—"}</span>
                      <span className="flex gap-1">
                        {i.isCover && <Badge tone="brand">Cover</Badge>}
                        <StatusBadge status={i.status} />
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {i.status !== "APPROVED" && <ActionButton url={`/api/admin/images/${i.id}`} method="PATCH" body={{ kind: "property", status: "APPROVED" }} label="Approve" variant="primary" success="Approved" />}
                      {i.status !== "REJECTED" && <ActionButton url={`/api/admin/images/${i.id}`} method="PATCH" body={{ kind: "property", status: "REJECTED" }} label="Reject" danger success="Rejected" />}
                      {!i.isCover && <ActionButton url={`/api/admin/images/${i.id}`} method="PATCH" body={{ kind: "property", status: i.status === "REJECTED" ? "APPROVED" : i.status, isCover: true }} label="Set cover" variant="ghost" success="Cover updated" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Facilities" />
        <CardBody>
          {!facs.length ? (
            <p className="text-sm text-slate-500">No facilities listed.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {facs.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span>
                    {f.name} {f.isCustom && <Badge tone="purple">Custom</Badge>}
                  </span>
                  <span className="flex items-center gap-1">
                    <StatusBadge status={f.status} />
                    {f.status !== "APPROVED" && <ActionButton url={`/api/admin/properties/${p.id}/facilities`} method="PATCH" body={{ facilityId: f.id, status: "APPROVED" }} label="✓" variant="ghost" success="Approved" />}
                    {f.status !== "REJECTED" && <ActionButton url={`/api/admin/properties/${p.id}/facilities`} method="PATCH" body={{ facilityId: f.id, status: "REJECTED" }} label="✕" variant="ghost" success="Rejected" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">
        Rooms ({roomRows.length}) · {approvedRooms} approved
      </h2>
      {!roomData.length && <EmptyState title="No rooms added yet" description="The owner has not added any rooms to this property." />}
      <div className="space-y-6">
        {roomData.map(({ r, pricing, images, beds: bedList, facs: rf }) => (
          <Card key={r.id} id={`room-${r.id}`}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  Room {r.roomNumber} {r.name && <span className="font-normal text-slate-500">· {r.name}</span>} <StatusBadge status={r.approvalStatus} />
                  {pricing.plan ? <Badge tone="green">Priced</Badge> : <Badge tone="amber">No price plan</Badge>}
                </span>
              }
              description={`${r.category.toLowerCase()} · ${r.sharingCapacity}-sharing · ${r.totalBeds} beds · max ${r.maxOccupancy} guests · ${r.isAC ? "AC" : "Non-AC"} · ${r.bathroom.toLowerCase()} bathroom · ${r.furnishing.replace("_", "-").toLowerCase()}`}
              action={
                <div className="flex flex-wrap justify-end gap-2">
                  <ActionButton url={`/api/admin/rooms/${r.id}/review`} body={{ action: "changes" }} label="Request changes" note={{ field: "notes", label: "Notes", required: true }} success="Changes requested" />
                  <ActionButton url={`/api/admin/rooms/${r.id}/review`} body={{ action: "reject" }} label="Reject" danger note={{ field: "notes", label: "Reason", required: true }} success="Room rejected" />
                  <ActionButton url={`/api/admin/rooms/${r.id}/review`} body={{ action: "approve", approveImages: true }} label={r.approvalStatus === "APPROVED" ? "Re-approve" : "Approve room"} variant="primary" disabled={!pricing.plan} success="Room approved" />
                </div>
              }
            />
            <CardBody className="space-y-4">
              {r.approvalNotes && <Alert tone="info">{r.approvalNotes}</Alert>}
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  Beds: {bedList.map((b) => `${b.no} (${b.type.toLowerCase().replace("_", " ")})`).join(", ") || "none"}
                </span>
                <span className="text-slate-500">Gender: {r.genderEligibility.replace(/_/g, " ").toLowerCase()}</span>
                <span className="text-slate-500">
                  Booking: {r.allowBedBooking ? "per bed" : ""}
                  {r.allowBedBooking && r.allowEntireRoomBooking ? " + " : ""}
                  {r.allowEntireRoomBooking ? "entire room" : ""}
                </span>
                {rf.length > 0 && <span className="text-slate-500">Facilities: {rf.map((x) => x.name).join(", ")}</span>}
              </div>
              {r.description && <p className="text-sm text-slate-600">{r.description}</p>}
              {images.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {images.map((i) => (
                    <div key={i.id} className="w-44 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                      <Img src={i.url} alt={`Room ${r.roomNumber} image`} className="h-28 w-full" />
                      <div className="flex items-center justify-between gap-1 p-1.5">
                        <StatusBadge status={i.status} />
                        <span className="flex">
                          {i.status !== "APPROVED" && <ActionButton url={`/api/admin/images/${i.id}`} method="PATCH" body={{ kind: "room", status: "APPROVED" }} label="✓" variant="ghost" success="Approved" />}
                          {i.status !== "REJECTED" && <ActionButton url={`/api/admin/images/${i.id}`} method="PATCH" body={{ kind: "room", status: "REJECTED" }} label="✕" variant="ghost" success="Rejected" />}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pricing.plan && (
                <p className="text-sm">
                  Current plan: {pricing.plan.nightlyBed != null && <>bed <Money paise={pricing.plan.nightlyBed} />/night · </>}
                  {pricing.plan.nightlyRoom != null && <>room <Money paise={pricing.plan.nightlyRoom} />/night · </>}
                  {pricing.plan.monthlyBed != null && <>bed <Money paise={pricing.plan.monthlyBed} />/month · </>}
                  {pricing.plan.monthlyRoom != null && <>room <Money paise={pricing.plan.monthlyRoom} />/month</>}
                </p>
              )}
              {canPrice ? (
                <details className="group rounded-xl border border-slate-200" open={!pricing.plan}>
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">{pricing.plan ? "Edit price plan" : "Set price plan (required before approval)"}</summary>
                  <div className="border-t border-slate-100 p-4">
                    <PricingEditor key={pricing.planMeta?.id ?? `new-${r.id}`} room={pricing.room} plan={pricing.plan} suggestion={pricing.suggestion} compact />
                  </div>
                </details>
              ) : (
                !pricing.plan && <Alert tone="warn">A team member with pricing permission must set this room&apos;s prices before it can be approved.</Alert>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
