import Link from "next/link";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { cities, facilities, fileUploads, ownerProfiles, pricePlans, properties, propertyDocuments, propertyFacilities, propertyImages, roomImages, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { Badge, EmptyState, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Img } from "@/components/ui/img";
import { LinkTabs } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/widgets";
import { one, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals" };

const PENDING = ["PENDING", "CHANGES_REQUESTED"] as const;

export default async function ApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: ["properties.approve", "kyc.approve"] });
  const sp = await searchParams;
  const canProps = u.has("properties.approve");
  const canKyc = u.has("kyc.approve");
  const tab = one(sp.tab) || (canProps ? "properties" : "kyc");

  const cnt = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const n = sql<number>`count(*)::int`;
  const [cProps, cRooms, cImgs, cRoomImgs, cFacs, cCustom, cDocs, cKyc, cBank] = await Promise.all([
    cnt(db.select({ n }).from(properties).where(and(inArray(properties.approvalStatus, [...PENDING]), isNull(properties.deletedAt)))),
    cnt(db.select({ n }).from(rooms).where(and(eq(rooms.approvalStatus, "PENDING"), isNull(rooms.deletedAt)))),
    cnt(db.select({ n }).from(propertyImages).where(eq(propertyImages.status, "PENDING"))),
    cnt(db.select({ n }).from(roomImages).where(eq(roomImages.status, "PENDING"))),
    cnt(db.select({ n }).from(propertyFacilities).where(eq(propertyFacilities.status, "PENDING"))),
    cnt(db.select({ n }).from(facilities).where(and(eq(facilities.isCustom, true), eq(facilities.active, false)))),
    cnt(db.select({ n }).from(propertyDocuments).where(eq(propertyDocuments.status, "PENDING"))),
    cnt(db.select({ n }).from(ownerProfiles).where(eq(ownerProfiles.kycStatus, "PENDING"))),
    cnt(db.select({ n }).from(ownerProfiles).where(and(eq(ownerProfiles.bankVerified, false), or(isNotNull(ownerProfiles.bankAccountLast4), isNotNull(ownerProfiles.upiId))))),
  ]);
  const tabs = [
    ...(canProps
      ? [
          { key: "properties", label: "Properties", href: "?tab=properties", count: cProps },
          { key: "rooms", label: "Rooms", href: "?tab=rooms", count: cRooms },
          { key: "images", label: "Images", href: "?tab=images", count: cImgs + cRoomImgs },
          { key: "facilities", label: "Facilities", href: "?tab=facilities", count: cFacs + cCustom },
          { key: "documents", label: "Documents", href: "?tab=documents", count: cDocs },
        ]
      : []),
    ...(canKyc
      ? [
          { key: "kyc", label: "Owner KYC", href: "?tab=kyc", count: cKyc },
          { key: "bank", label: "Bank details", href: "?tab=bank", count: cBank },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title="Approvals" description="Review listings, rooms, media, facilities, documents, owner KYC and bank details. Rooms need an admin-set price plan before they can go live." />
      <LinkTabs tabs={tabs} active={tab} />
      {tab === "properties" && canProps && <PropertiesQueue />}
      {tab === "rooms" && canProps && <RoomsQueue />}
      {tab === "images" && canProps && <ImagesQueue />}
      {tab === "facilities" && canProps && <FacilitiesQueue />}
      {tab === "documents" && canProps && <DocumentsQueue />}
      {tab === "kyc" && canKyc && <KycQueue />}
      {tab === "bank" && canKyc && <BankQueue />}
    </>
  );
}

async function PropertiesQueue() {
  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      code: properties.code,
      status: properties.approvalStatus,
      submittedAt: properties.submittedAt,
      city: cities.name,
      owner: users.name,
      ownerId: users.id,
      kyc: ownerProfiles.kycStatus,
      roomsTotal: sql<number>`(select count(*)::int from rooms r where r.property_id = ${properties.id} and r.deleted_at is null)`,
      roomsPending: sql<number>`(select count(*)::int from rooms r where r.property_id = ${properties.id} and r.deleted_at is null and r.approval_status <> 'APPROVED')`,
      roomsUnpriced: sql<number>`(select count(*)::int from rooms r where r.property_id = ${properties.id} and r.deleted_at is null and not exists (select 1 from price_plans pp where pp.room_id = r.id and pp.active))`,
    })
    .from(properties)
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .innerJoin(users, eq(users.id, properties.ownerId))
    .leftJoin(ownerProfiles, eq(ownerProfiles.userId, users.id))
    .where(and(inArray(properties.approvalStatus, [...PENDING]), isNull(properties.deletedAt)))
    .orderBy(asc(properties.submittedAt));
  if (!rows.length) return <EmptyState title="No properties waiting for review" description="New and resubmitted listings will appear here." />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Property</TH>
          <TH>Owner</TH>
          <TH>Submitted</TH>
          <TH>Rooms</TH>
          <TH>Status</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD>
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-slate-500">
                {r.code} · {r.city}
              </p>
            </TD>
            <TD>
              <Link href={`/admin/users/owners/${r.ownerId}`} className="hover:underline">
                {r.owner}
              </Link>
              <div className="mt-0.5">
                <span className="text-xs text-slate-500">KYC </span>
                <StatusBadge status={r.kyc} />
              </div>
            </TD>
            <TD className="whitespace-nowrap text-xs">{prettyDateTime(r.submittedAt)}</TD>
            <TD className="text-xs">
              {r.roomsTotal} rooms · {r.roomsPending} pending
              {r.roomsUnpriced > 0 && (
                <div>
                  <Badge tone="amber">{r.roomsUnpriced} without price</Badge>
                </div>
              )}
            </TD>
            <TD>
              <StatusBadge status={r.status} />
            </TD>
            <TD className="text-right">
              <LinkButton href={`/admin/approvals/${r.id}`} size="sm">
                Review
              </LinkButton>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

async function RoomsQueue() {
  const rows = await db
    .select({ id: rooms.id, no: rooms.roomNumber, name: rooms.name, category: rooms.category, sharing: rooms.sharingCapacity, isAC: rooms.isAC, propertyId: properties.id, prop: properties.name, propStatus: properties.approvalStatus, planId: pricePlans.id, createdAt: rooms.createdAt })
    .from(rooms)
    .innerJoin(properties, eq(properties.id, rooms.propertyId))
    .leftJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true)))
    .where(and(eq(rooms.approvalStatus, "PENDING"), isNull(rooms.deletedAt)))
    .orderBy(asc(properties.name), asc(rooms.roomNumber));
  if (!rows.length) return <EmptyState title="No rooms waiting for review" />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Room</TH>
          <TH>Property</TH>
          <TH>Type</TH>
          <TH>Price plan</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD>
              <p className="font-medium">Room {r.no}</p>
              <p className="text-xs text-slate-500">{r.name}</p>
            </TD>
            <TD>
              {r.prop} <StatusBadge status={r.propStatus} />
            </TD>
            <TD className="text-xs">
              {r.category.toLowerCase()} · {r.sharing}-share · {r.isAC ? "AC" : "Non-AC"}
            </TD>
            <TD>{r.planId ? <Badge tone="green">Priced</Badge> : <Badge tone="amber">Price required</Badge>}</TD>
            <TD className="space-x-2 whitespace-nowrap text-right">
              <LinkButton href={`/admin/pricing/rooms/${r.id}`} size="sm" variant="outline">
                {r.planId ? "Edit prices" : "Set prices"}
              </LinkButton>
              {r.planId ? (
                <ActionButton url={`/api/admin/rooms/${r.id}/review`} body={{ action: "approve" }} label="Approve" variant="primary" success="Room approved" />
              ) : (
                <LinkButton href={`/admin/approvals/${r.propertyId}#room-${r.id}`} size="sm">
                  Review
                </LinkButton>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

async function ImagesQueue() {
  const [pImgs, rImgs] = await Promise.all([
    db.select({ id: propertyImages.id, url: propertyImages.url, caption: propertyImages.caption, prop: properties.name, propertyId: properties.id }).from(propertyImages).innerJoin(properties, eq(properties.id, propertyImages.propertyId)).where(eq(propertyImages.status, "PENDING")).orderBy(desc(propertyImages.createdAt)).limit(120),
    db.select({ id: roomImages.id, url: roomImages.url, caption: roomImages.caption, prop: properties.name, room: rooms.roomNumber, propertyId: properties.id }).from(roomImages).innerJoin(rooms, eq(rooms.id, roomImages.roomId)).innerJoin(properties, eq(properties.id, rooms.propertyId)).where(eq(roomImages.status, "PENDING")).orderBy(desc(roomImages.createdAt)).limit(120),
  ]);
  const all = [...pImgs.map((i) => ({ ...i, kind: "property" as const, room: null as string | null })), ...rImgs.map((i) => ({ ...i, kind: "room" as const }))];
  if (!all.length) return <EmptyState title="No images waiting for review" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {all.map((i) => (
        <div key={i.id} className="card overflow-hidden">
          <a href={i.url} target="_blank" rel="noopener noreferrer">
            <Img src={i.url} alt={i.caption ?? `${i.prop} image`} className="h-40 w-full" />
          </a>
          <div className="space-y-2 p-3">
            <p className="truncate text-sm font-medium">
              <Link href={`/admin/approvals/${i.propertyId}`} className="hover:underline">
                {i.prop}
              </Link>
            </p>
            <p className="text-xs text-slate-500">{i.kind === "room" ? `Room ${i.room}` : "Property"} · {i.caption ?? "No caption"}</p>
            <div className="flex gap-2">
              <ActionButton url={`/api/admin/images/${i.id}`} method="PATCH" body={{ kind: i.kind, status: "APPROVED" }} label="Approve" variant="primary" success="Image approved" />
              <ActionButton url={`/api/admin/images/${i.id}`} method="PATCH" body={{ kind: i.kind, status: "REJECTED" }} label="Reject" danger success="Image rejected" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

async function FacilitiesQueue() {
  const [rows, custom] = await Promise.all([
    db.select({ propertyId: properties.id, prop: properties.name, facilityId: facilities.id, name: facilities.name, isCustom: facilities.isCustom, note: propertyFacilities.note }).from(propertyFacilities).innerJoin(properties, eq(properties.id, propertyFacilities.propertyId)).innerJoin(facilities, eq(facilities.id, propertyFacilities.facilityId)).where(eq(propertyFacilities.status, "PENDING")).orderBy(asc(properties.name)),
    db.select().from(facilities).where(and(eq(facilities.isCustom, true), eq(facilities.active, false))),
  ]);
  return (
    <div className="space-y-6">
      {custom.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">Custom facilities submitted by owners</h3>
          <Table>
            <THead>
              <tr>
                <TH>Facility</TH>
                <TH>Key</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {custom.map((f) => (
                <TR key={f.id}>
                  <TD>{f.name}</TD>
                  <TD>
                    <code className="text-xs">{f.key}</code>
                  </TD>
                  <TD className="text-right">
                    <ActionButton url={`/api/admin/resources/facilities/${f.id}`} method="PATCH" body={{ active: true }} label="Approve & activate" variant="primary" success="Facility approved" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      {!rows.length ? (
        <EmptyState title="No property facilities waiting for review" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Property</TH>
              <TH>Facility</TH>
              <TH>Owner note</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={`${r.propertyId}-${r.facilityId}`}>
                <TD>
                  <Link href={`/admin/approvals/${r.propertyId}`} className="hover:underline">
                    {r.prop}
                  </Link>
                </TD>
                <TD>
                  {r.name} {r.isCustom && <Badge tone="purple">Custom</Badge>}
                </TD>
                <TD className="text-xs">{r.note ?? "—"}</TD>
                <TD className="space-x-2 whitespace-nowrap text-right">
                  <ActionButton url={`/api/admin/properties/${r.propertyId}/facilities`} method="PATCH" body={{ facilityId: r.facilityId, status: "APPROVED" }} label="Approve" variant="primary" success="Approved" />
                  <ActionButton url={`/api/admin/properties/${r.propertyId}/facilities`} method="PATCH" body={{ facilityId: r.facilityId, status: "REJECTED" }} label="Reject" danger success="Rejected" />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

async function DocumentsQueue() {
  const rows = await db
    .select({ id: propertyDocuments.id, docType: propertyDocuments.docType, fileId: propertyDocuments.fileId, fileName: fileUploads.fileName, createdAt: propertyDocuments.createdAt, prop: properties.name, propertyId: properties.id })
    .from(propertyDocuments)
    .innerJoin(properties, eq(properties.id, propertyDocuments.propertyId))
    .leftJoin(fileUploads, eq(fileUploads.id, propertyDocuments.fileId))
    .where(eq(propertyDocuments.status, "PENDING"))
    .orderBy(asc(propertyDocuments.createdAt));
  if (!rows.length) return <EmptyState title="No documents waiting for review" />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Property</TH>
          <TH>Document</TH>
          <TH>Uploaded</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map((d) => (
          <TR key={d.id}>
            <TD>{d.prop}</TD>
            <TD>
              <a href={`/api/files/${d.fileId}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                {d.docType.replace(/_/g, " ")}
              </a>
              <p className="text-xs text-slate-500">{d.fileName}</p>
            </TD>
            <TD className="text-xs">{prettyDate(d.createdAt)}</TD>
            <TD className="space-x-2 whitespace-nowrap text-right">
              <ActionButton url={`/api/admin/documents/${d.id}`} method="PATCH" body={{ status: "APPROVED" }} label="Approve" variant="primary" success="Document approved" />
              <ActionButton url={`/api/admin/documents/${d.id}`} method="PATCH" body={{ status: "REJECTED" }} label="Reject" danger note={{ field: "notes", label: "Reason", required: true }} success="Document rejected" />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

async function KycQueue() {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, business: ownerProfiles.businessName, type: ownerProfiles.businessType, gstin: ownerProfiles.gstin, pan: ownerProfiles.panLast4, address: ownerProfiles.address, createdAt: ownerProfiles.createdAt })
    .from(ownerProfiles)
    .innerJoin(users, eq(users.id, ownerProfiles.userId))
    .where(eq(ownerProfiles.kycStatus, "PENDING"))
    .orderBy(asc(ownerProfiles.createdAt));
  if (!rows.length) return <EmptyState title="No owner KYC waiting for review" />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Owner</TH>
          <TH>Business</TH>
          <TH>GSTIN / PAN</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map((o) => (
          <TR key={o.id}>
            <TD>
              <Link href={`/admin/users/owners/${o.id}`} className="font-medium hover:underline">
                {o.name}
              </Link>
              <p className="text-xs text-slate-500">{o.email ?? o.phone}</p>
            </TD>
            <TD>
              {o.business}
              <p className="text-xs text-slate-500">
                {o.type ?? "—"} · {o.address ?? "—"}
              </p>
            </TD>
            <TD className="text-xs">
              {o.gstin ?? "No GSTIN"} · PAN {o.pan ? `••••${o.pan}` : "not provided"}
            </TD>
            <TD className="space-x-2 whitespace-nowrap text-right">
              <LinkButton href={`/admin/users/owners/${o.id}`} size="sm" variant="ghost">
                Documents
              </LinkButton>
              <ActionButton url={`/api/admin/owners/${o.id}/kyc`} body={{ action: "approve" }} label="Approve" variant="primary" note={{ field: "notes", label: "Notes (optional)" }} confirm="Approve owner KYC?" success="KYC approved" />
              <ActionButton url={`/api/admin/owners/${o.id}/kyc`} body={{ action: "reject" }} label="Reject" danger note={{ field: "notes", label: "Reason (shared with owner)", required: true }} success="KYC rejected" />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

async function BankQueue() {
  const rows = await db
    .select({ id: users.id, name: users.name, business: ownerProfiles.businessName, holder: ownerProfiles.bankAccountName, last4: ownerProfiles.bankAccountLast4, ifsc: ownerProfiles.bankIfsc, bank: ownerProfiles.bankName, upi: ownerProfiles.upiId, kyc: ownerProfiles.kycStatus })
    .from(ownerProfiles)
    .innerJoin(users, eq(users.id, ownerProfiles.userId))
    .where(and(eq(ownerProfiles.bankVerified, false), or(isNotNull(ownerProfiles.bankAccountLast4), isNotNull(ownerProfiles.upiId))));
  if (!rows.length) return <EmptyState title="No bank details waiting for verification" />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Owner</TH>
          <TH>Account</TH>
          <TH>UPI</TH>
          <TH>KYC</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map((o) => (
          <TR key={o.id}>
            <TD>
              <Link href={`/admin/users/owners/${o.id}`} className="font-medium hover:underline">
                {o.name}
              </Link>
              <p className="text-xs text-slate-500">{o.business}</p>
            </TD>
            <TD className="text-xs">{o.last4 ? `${o.holder ?? ""} · ${o.bank ?? ""} ••••${o.last4} · ${o.ifsc ?? ""}` : "—"}</TD>
            <TD className="text-xs">{o.upi ?? "—"}</TD>
            <TD>
              <StatusBadge status={o.kyc} />
            </TD>
            <TD className="text-right">
              <ActionButton url={`/api/admin/owners/${o.id}/bank`} body={{ verified: true }} label="Mark verified" variant="primary" confirm="Confirm bank details were verified (e.g. penny-drop)?" success="Bank details verified" />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
