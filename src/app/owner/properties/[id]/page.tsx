import Link from "next/link";
import { and, asc, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { Pencil, Star } from "lucide-react";
import { db } from "@/db";
import {
  beds,
  bookings,
  cities,
  durationPrices,
  floors,
  inventoryBlocks,
  localities,
  pricePlans,
  propertyTypes,
  reviewReplies,
  reviews,
  roomFacilities,
  roomImages,
  rooms,
  staffAssignments,
  staffProfiles,
  users,
} from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { addDays, todayIST } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { loadMaintenance, loadPropertyAssets, loadPropertyMeta, ownedPropertyOr404 } from "@/lib/owner-data";
import { bedStats, monthGrid, occupancy } from "@/services/owner-reports";
import { Alert, Badge, Card, CardBody, CardHeader, DescList, EmptyState, LinkButton, Money, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { TabNav } from "@/components/owner/common";
import { humanize, GENDER_OPTIONS, AUDIENCE_OPTIONS } from "@/components/owner/format";
import { DeleteDraftButton, SubmitForReviewButton } from "@/components/owner/property-actions";
import { DocumentsManager, PhotosManager } from "@/components/owner/property-assets";
import { AvailabilityCalendar, ReviewReply, StaffAssign, SuggestPriceForm } from "@/components/owner/property-tabs";
import { BedsManager, FloorsManager, RoomsManager, type RoomRow } from "@/components/owner/rooms-manager";
import { MaintenanceBoard } from "@/components/staff/maintenance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage property" };

const TABS = ["overview", "photos", "floors", "rooms", "beds", "pricing", "availability", "staff", "documents", "reviews", "maintenance"] as const;
type Tab = (typeof TABS)[number];

export default async function ManageProperty({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; month?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const { id } = await params;
  const sp = await searchParams;
  const p = await ownedPropertyOr404(u.id, id);
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const today = todayIST();
  const editable = ["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(p.approvalStatus);

  const roomRows = await db.select().from(rooms).where(and(eq(rooms.propertyId, p.id), isNull(rooms.deletedAt))).orderBy(asc(rooms.roomNumber));
  const roomIds = roomRows.map((r) => r.id);
  const floorRows = await db.select().from(floors).where(eq(floors.propertyId, p.id)).orderBy(asc(floors.number));
  const [reviewCount] = await db.select({ n: count(reviews.id) }).from(reviews).where(eq(reviews.propertyId, p.id));

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "photos", label: "Photos" },
    { key: "floors", label: "Floors", count: floorRows.length },
    { key: "rooms", label: "Rooms", count: roomRows.length },
    { key: "beds", label: "Beds" },
    { key: "pricing", label: "Pricing" },
    { key: "availability", label: "Availability" },
    { key: "staff", label: "Staff" },
    { key: "documents", label: "Documents" },
    { key: "reviews", label: "Reviews", count: Number(reviewCount?.n ?? 0) },
    { key: "maintenance", label: "Maintenance" },
  ];

  let body: React.ReactNode = null;

  if (tab === "overview") {
    const [city] = await db.select().from(cities).where(eq(cities.id, p.cityId));
    const [loc] = p.localityId ? await db.select().from(localities).where(eq(localities.id, p.localityId)) : [];
    const [pt] = await db.select().from(propertyTypes).where(eq(propertyTypes.id, p.propertyTypeId));
    const assets = await loadPropertyAssets(p.id);
    const bs = await bedStats([p.id]);
    const occ = await occupancy([p.id], addDays(today, -30), today);
    const [upcoming] = await db.select({ n: count(bookings.id) }).from(bookings).where(and(eq(bookings.propertyId, p.id), inArray(bookings.status, ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN"])));
    const pendingItems = assets.images.filter((i) => i.status === "PENDING").length + roomRows.filter((r) => r.approvalStatus === "PENDING").length + assets.facilitySel.filter((f) => f.status === "PENDING").length;
    body = (
      <div className="space-y-6">
        {p.approvalStatus === "DRAFT" && (
          <Alert tone="info" title="Draft — not visible to guests">
            Finish setup (photos, facilities, rooms & beds) and submit for review.
          </Alert>
        )}
        {p.approvalStatus === "PENDING" && <Alert tone="warn" title="Under review">The StayShare team is verifying your property and setting room prices. We&apos;ll notify you once it&apos;s live.</Alert>}
        {["CHANGES_REQUESTED", "REJECTED"].includes(p.approvalStatus) && (
          <Alert tone="error" title={p.approvalStatus === "REJECTED" ? "Not approved" : "Changes requested"}>
            {p.approvalNotes ?? "Please review your details and resubmit."}
          </Alert>
        )}
        {p.approvalStatus === "APPROVED" && pendingItems > 0 && <Alert tone="warn">{pendingItems} new item(s) — photos, rooms or facilities — are awaiting StayShare approval. Your listing stays live meanwhile.</Alert>}
        {p.blocked && <Alert tone="error" title="Listing blocked by StayShare">Contact support for details.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Rooms" value={roomRows.length} />
          <StatCard label="Beds" value={bs.total} hint={`${bs.occupied} occupied · ${bs.available} free tonight`} tone="accent" />
          <StatCard label="Occupancy (30 days)" value={`${occ.pct}%`} tone="green" />
          <StatCard label="Active bookings" value={Number(upcoming?.n ?? 0)} tone="slate" />
        </div>
        <Card>
          <CardHeader
            title="Property details"
            action={
              <LinkButton href={`/owner/properties/${p.id}/setup?step=basic`} size="sm" variant="outline">
                <Pencil className="h-4 w-4" /> Edit
              </LinkButton>
            }
          />
          <CardBody className="space-y-5">
            <DescList
              items={[
                { label: "Code", value: p.code },
                { label: "Type", value: pt?.name },
                { label: "Who can stay", value: GENDER_OPTIONS.find((g) => g.value === p.genderEligibility)?.label },
                { label: "Best for", value: p.targetAudience.map((a) => AUDIENCE_OPTIONS.find((x) => x.value === a)?.label ?? humanize(a)).join(", ") || "—" },
                { label: "Address", value: [p.addressLine, p.landmark, loc?.name, city?.name, p.state, p.postalCode].filter(Boolean).join(", ") },
                { label: "Map", value: p.mapUrl ? <a href={p.mapUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Open in maps</a> : "—" },
                { label: "Check-in / out", value: `${p.checkInTime} / ${p.checkOutTime}` },
                { label: "Stay length", value: `${p.minStayNights}–${p.maxStayNights} nights` },
                { label: "Policies", value: [p.idProofRequired && "ID required", p.instantBooking ? "Instant booking" : "Request to book", p.allowCashAtProperty && "Pay at property", p.foodIncluded && "Food included"].filter(Boolean).join(" · ") },
                { label: "Rating", value: p.reviewCount ? `★ ${p.ratingAvg.toFixed(1)} (${p.reviewCount} reviews)` : "No reviews yet" },
              ]}
            />
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Description</p>
              <p className="whitespace-pre-line text-sm text-slate-700">{p.description}</p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Facilities</p>
                <Link href={`/owner/properties/${p.id}/setup?step=facilities`} className="text-xs font-medium text-brand-700 hover:underline">
                  Edit facilities
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {assets.facilityNames.length ? assets.facilityNames.map((f) => <Badge key={f.name} tone={f.status === "APPROVED" ? "brand" : "amber"}>{f.name}{f.status !== "APPROVED" ? " (pending)" : ""}</Badge>) : <span className="text-sm text-slate-500">None added</span>}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">House rules</p>
                <Link href={`/owner/properties/${p.id}/setup?step=rules`} className="text-xs font-medium text-brand-700 hover:underline">
                  Edit rules
                </Link>
              </div>
              {assets.rules.length ? (
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                  {assets.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No rules yet</p>
              )}
            </div>
          </CardBody>
        </Card>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <SubmitForReviewButton propertyId={p.id} disabled={!roomRows.length || !assets.images.length} />
            {p.approvalStatus !== "CHANGES_REQUESTED" && <DeleteDraftButton propertyId={p.id} />}
            {(!roomRows.length || !assets.images.length) && <p className="self-center text-sm text-slate-500">Add at least one photo and one room to submit.</p>}
          </div>
        )}
      </div>
    );
  }

  if (tab === "photos") {
    const assets = await loadPropertyAssets(p.id);
    body = <PhotosManager propertyId={p.id} images={assets.images} approvedProperty={p.approvalStatus === "APPROVED"} />;
  }

  if (tab === "floors") {
    const counts = roomRows.reduce<Record<string, number>>((a, r) => (r.floorId ? ((a[r.floorId] = (a[r.floorId] ?? 0) + 1), a) : a), {});
    body = <FloorsManager propertyId={p.id} floors={floorRows.map((f) => ({ id: f.id, number: f.number, name: f.name, rooms: counts[f.id] ?? 0 }))} />;
  }

  if (tab === "rooms") {
    const meta = await loadPropertyMeta();
    const rf = roomIds.length ? await db.select().from(roomFacilities).where(inArray(roomFacilities.roomId, roomIds)) : [];
    const imgs = roomIds.length ? await db.select().from(roomImages).where(inArray(roomImages.roomId, roomIds)).orderBy(asc(roomImages.sortOrder)) : [];
    const plans = roomIds.length ? await db.select({ roomId: pricePlans.roomId }).from(pricePlans).where(and(inArray(pricePlans.roomId, roomIds), eq(pricePlans.active, true))) : [];
    const priced = new Set(plans.map((x) => x.roomId));
    const fl = Object.fromEntries(floorRows.map((f) => [f.id, f.name ?? `Floor ${f.number}`]));
    const data: RoomRow[] = roomRows.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      name: r.name,
      floorId: r.floorId,
      floorLabel: r.floorId ? (fl[r.floorId] ?? null) : null,
      category: r.category,
      sharingCapacity: r.sharingCapacity,
      totalBeds: r.totalBeds,
      maxOccupancy: r.maxOccupancy,
      isAC: r.isAC,
      bathroom: r.bathroom,
      furnishing: r.furnishing,
      genderEligibility: r.genderEligibility,
      sizeSqft: r.sizeSqft,
      description: r.description,
      allowBedBooking: r.allowBedBooking,
      allowEntireRoomBooking: r.allowEntireRoomBooking,
      approvalStatus: r.approvalStatus,
      approvalNotes: r.approvalNotes,
      maintenanceStatus: r.maintenanceStatus,
      cleaningStatus: r.cleaningStatus,
      facilityIds: rf.filter((x) => x.roomId === r.id).map((x) => x.facilityId),
      images: imgs.filter((x) => x.roomId === r.id).map((x) => ({ id: x.id, url: x.url, status: x.status })),
      hasPrice: priced.has(r.id),
    }));
    body = <RoomsManager propertyId={p.id} rooms={data} floors={floorRows.map((f) => ({ id: f.id, number: f.number, name: f.name, rooms: 0 }))} facilities={meta.facilities} propertyApproved={p.approvalStatus === "APPROVED"} />;
  }

  if (tab === "beds") {
    const bedRows = roomIds.length ? await db.select().from(beds).where(and(inArray(beds.roomId, roomIds), isNull(beds.deletedAt))).orderBy(asc(beds.bedNumber)) : [];
    body = <BedsManager rooms={roomRows.map((r) => ({ id: r.id, roomNumber: r.roomNumber, name: r.name, category: r.category }))} beds={bedRows.map((b) => ({ id: b.id, roomId: b.roomId, bedNumber: b.bedNumber, code: b.code, bedType: b.bedType, status: b.status, active: b.active, availableFrom: b.availableFrom }))} />;
  }

  if (tab === "pricing") {
    const { "owner.allowPriceSuggestion": allowSuggest } = await getSettings(["owner.allowPriceSuggestion"]);
    const plans = roomIds.length ? await db.select().from(pricePlans).where(and(inArray(pricePlans.roomId, roomIds), eq(pricePlans.active, true))).orderBy(desc(pricePlans.effectiveFrom)) : [];
    const tiers = plans.length ? await db.select().from(durationPrices).where(inArray(durationPrices.pricePlanId, plans.map((x) => x.id))).orderBy(asc(durationPrices.nights)) : [];
    body = (
      <div className="space-y-4">
        <Alert tone="info" title="Prices are managed by the StayShare team">
          This is a read-only view of the customer price plan approved for each room. {allowSuggest ? "You can optionally send a suggested price for our team to consider." : "Contact support if you'd like the team to review a price."}
        </Alert>
        {roomRows.length === 0 && <EmptyState title="No rooms yet" description="Add rooms to see their pricing status." />}
        {roomRows.map((r) => {
          const plan = plans.find((x) => x.roomId === r.id);
          const t = plan ? tiers.filter((x) => x.pricePlanId === plan.id) : [];
          const cells = plan
            ? [
                ["Per bed / night", plan.nightlyBed],
                ["Entire room / night", plan.nightlyRoom],
                ["Per bed / week", plan.weeklyBed],
                ["Entire room / week", plan.weeklyRoom],
                ["Per bed / month", plan.monthlyBed],
                ["Entire room / month", plan.monthlyRoom],
                ["Deposit (bed)", plan.securityDepositBed],
                ["Deposit (room)", plan.securityDepositRoom],
                ["Extra adult / night", plan.extraAdultPerNight],
                ["Child / night", plan.childPerNight],
                ["Food / person / day", plan.foodPerPersonPerDay],
                ["Laundry / month", plan.laundryPerMonth],
                ["Cleaning fee", plan.cleaningFee],
              ].filter(([, v]) => v != null && v !== 0)
            : [];
          return (
            <Card key={r.id}>
              <CardHeader title={`Room ${r.roomNumber}${r.name ? ` · ${r.name}` : ""}`} description={`${humanize(r.category)} · ${r.totalBeds} beds · ${r.isAC ? "AC" : "Non-AC"}`} action={plan ? <Badge tone="green">Price plan: {plan.name}</Badge> : <Badge tone="amber">Awaiting pricing by StayShare team</Badge>} />
              <CardBody className="space-y-4">
                {plan ? (
                  <>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {cells.map(([label, v]) => (
                        <div key={label as string} className="rounded-xl bg-slate-50 p-3">
                          <dt className="text-xs text-slate-500">{label}</dt>
                          <dd className="font-semibold">
                            <Money paise={v as number} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {t.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Duration packages</p>
                        <div className="flex flex-wrap gap-2">
                          {t.map((x) => (
                            <span key={x.id} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm">
                              {x.nights} night{x.nights > 1 ? "s" : ""} · {x.unit === "BED" ? "bed" : "room"} · <Money paise={x.totalPrice} />
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-slate-500">Effective from {plan.effectiveFrom.toLocaleDateString("en-IN")}. Weekend, seasonal and promotional adjustments may apply.</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">{r.approvalStatus === "APPROVED" ? "Approved — our pricing team will publish a price plan shortly." : "Once this room is reviewed, the StayShare team sets its price plan."}</p>
                )}
                {allowSuggest && (
                  <SuggestPriceForm
                    roomId={r.id}
                    allowBed={r.allowBedBooking}
                    allowRoom={r.allowEntireRoomBooking}
                    values={{ suggestedNightlyBed: r.suggestedNightlyBed, suggestedNightlyRoom: r.suggestedNightlyRoom, suggestedMonthlyBed: r.suggestedMonthlyBed, suggestedMonthlyRoom: r.suggestedMonthlyRoom, suggestedDeposit: r.suggestedDeposit, suggestedNote: r.suggestedNote, priceSubmittedAt: r.priceSubmittedAt?.toISOString() ?? null }}
                  />
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    );
  }

  if (tab === "availability") {
    const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const prev = m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, "0")}`;
    const next = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`;
    const grid = await monthGrid(p.id, month);
    const blocks = await db
      .select({ b: inventoryBlocks, roomNumber: rooms.roomNumber, bedCode: beds.code })
      .from(inventoryBlocks)
      .leftJoin(rooms, eq(rooms.id, inventoryBlocks.roomId))
      .leftJoin(beds, eq(beds.id, inventoryBlocks.bedId))
      .where(and(eq(inventoryBlocks.propertyId, p.id), isNull(inventoryBlocks.releasedAt), gt(inventoryBlocks.endDate, today)))
      .orderBy(asc(inventoryBlocks.startDate));
    const bedRows = roomIds.length ? await db.select({ id: beds.id, code: beds.code, roomId: beds.roomId }).from(beds).where(and(inArray(beds.roomId, roomIds), isNull(beds.deletedAt), eq(beds.active, true))).orderBy(asc(beds.code)) : [];
    const byRoom: Record<string, { id: string; code: string }[]> = {};
    for (const b of bedRows) (byRoom[b.roomId] ??= []).push({ id: b.id, code: b.code });
    body = (
      <AvailabilityCalendar
        propertyId={p.id}
        month={month}
        prevMonth={prev}
        nextMonth={next}
        nights={grid.nights}
        rooms={grid.rooms}
        today={today}
        bedsByRoom={byRoom}
        blocks={blocks.map((x) => ({ id: x.b.id, roomId: x.b.roomId, bedId: x.b.bedId, roomNumber: x.roomNumber, bedCode: x.bedCode, startDate: x.b.startDate, endDate: x.b.endDate, reason: x.b.reason, note: x.b.note }))}
      />
    );
  }

  if (tab === "staff") {
    const staff = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, designation: staffProfiles.designation, active: staffProfiles.active }).from(staffProfiles).innerJoin(users, eq(users.id, staffProfiles.userId)).where(eq(staffProfiles.employerId, u.id)).orderBy(asc(users.name));
    const asg = await db.select({ userId: staffAssignments.userId }).from(staffAssignments).where(eq(staffAssignments.propertyId, p.id));
    const set = new Set(asg.map((a) => a.userId));
    body = <StaffAssign propertyId={p.id} staff={staff.map((s) => ({ id: s.id, name: s.name, designation: s.designation, active: s.active, assigned: set.has(s.id), contact: s.email ?? s.phone ?? "" }))} />;
  }

  if (tab === "documents") {
    const assets = await loadPropertyAssets(p.id);
    body = <DocumentsManager propertyId={p.id} docs={assets.documents} />;
  }

  if (tab === "reviews") {
    const rv = await db.select({ r: reviews, guest: users.name }).from(reviews).innerJoin(users, eq(users.id, reviews.customerId)).where(eq(reviews.propertyId, p.id)).orderBy(desc(reviews.createdAt)).limit(100);
    const replies = rv.length ? await db.select().from(reviewReplies).where(inArray(reviewReplies.reviewId, rv.map((x) => x.r.id))) : [];
    body =
      rv.length === 0 ? (
        <EmptyState icon={<Star className="h-6 w-6" />} title="No reviews yet" description="Guests can review after their stay is completed." />
      ) : (
        <ul className="space-y-3">
          {rv.map(({ r, guest }) => {
            const mine = replies.find((x) => x.reviewId === r.id && x.authorId === u.id);
            const others = replies.filter((x) => x.reviewId === r.id && x.authorId !== u.id);
            return (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.title ?? "Review"}</p>
                    <p className="text-xs text-slate-500">
                      {guest} · {r.createdAt.toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status !== "PUBLISHED" && <StatusBadge status={r.status} />}
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-800">
                      <Star className="h-3.5 w-3.5 fill-current" aria-hidden /> {r.overall}/5
                    </span>
                  </div>
                </div>
                {r.text && <p className="mt-2 text-sm text-slate-700">{r.text}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  Cleanliness {r.cleanliness} · Location {r.location} · Staff {r.staff} · Facilities {r.facilities} · Value {r.valueForMoney} · Safety {r.safety}
                  {r.foodQuality ? ` · Food ${r.foodQuality}` : ""}
                </p>
                {[...others, ...(mine ? [mine] : [])].map((x) => (
                  <div key={x.id} className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
                    <p className="text-xs font-semibold">{x.authorId === u.id ? "Your reply" : "Response"}</p>
                    {x.text}
                  </div>
                ))}
                <ReviewReply reviewId={r.id} existing={mine?.text ?? null} />
              </li>
            );
          })}
        </ul>
      );
  }

  if (tab === "maintenance") {
    const m = await loadMaintenance([p.id]);
    body = <MaintenanceBoard properties={[{ id: p.id, name: p.name }]} rooms={m.rooms} issues={m.issues} fixedPropertyId={p.id} today={today} />;
  }

  return (
    <>
      <PageHeader
        title={p.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {p.code} <StatusBadge status={p.approvalStatus} /> {!p.active && <StatusBadge status="SUSPENDED" />}
          </span>
        }
        breadcrumbs={[{ label: "Properties", href: "/owner/properties" }, { label: p.name }]}
        actions={
          <>
            <LinkButton href={`/owner/bookings?propertyId=${p.id}`} variant="outline" size="sm">
              Bookings
            </LinkButton>
            {editable && (
              <LinkButton href={`/owner/properties/${p.id}/setup?step=basic`} size="sm">
                Continue setup
              </LinkButton>
            )}
          </>
        }
      />
      <TabNav tabs={tabs} active={tab} basePath={`/owner/properties/${p.id}`} />
      {body}
    </>
  );
}
