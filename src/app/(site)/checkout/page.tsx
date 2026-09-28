import type { Metadata } from "next";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cities, customerProfiles, identityDocuments, pricePlans, properties, propertyImages, rooms, savedGuests } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { getSettings } from "@/lib/settings";
import { publicCoupons } from "@/lib/site/coupons";
import { Breadcrumbs, EmptyState, LinkButton } from "@/components/ui";
import { CheckoutClient } from "@/components/site/checkout-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).map(([k, v]) => [k, one(v)])).toString();
  const user = await pageUser({ next: `/checkout?${qs}` });
  const roomId = one(sp.roomId);
  const checkIn = one(sp.checkIn);
  const checkOut = one(sp.checkOut);
  const valid = /^[0-9a-f-]{36}$/i.test(roomId) && /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut);
  const [row] = valid
    ? await db
        .select({ room: rooms, property: properties, city: cities.name })
        .from(rooms)
        .innerJoin(properties, eq(properties.id, rooms.propertyId))
        .innerJoin(cities, eq(cities.id, properties.cityId))
        .innerJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true)))
        .where(and(eq(rooms.id, roomId), eq(rooms.approvalStatus, "APPROVED"), eq(rooms.active, true), isNull(rooms.deletedAt), eq(properties.approvalStatus, "APPROVED"), eq(properties.active, true), eq(properties.blocked, false)))
        .limit(1)
    : [];
  if (!row) {
    return (
      <div className="container-page py-10">
        <EmptyState title="This booking link is incomplete or the room is no longer available" description="Please choose your room and dates again." action={<LinkButton href="/search">Find a stay</LinkButton>} />
      </div>
    );
  }
  const [cover, profile, docs, guests, settings, offers] = await Promise.all([
    db.select({ url: propertyImages.url }).from(propertyImages).where(and(eq(propertyImages.propertyId, row.property.id), eq(propertyImages.status, "APPROVED"))).orderBy(desc(propertyImages.isCover), asc(propertyImages.sortOrder)).limit(1),
    db.select().from(customerProfiles).where(eq(customerProfiles.userId, user.id)),
    db.select({ id: identityDocuments.id }).from(identityDocuments).where(and(eq(identityDocuments.userId, user.id), isNull(identityDocuments.deletedAt))),
    db.select().from(savedGuests).where(eq(savedGuests.userId, user.id)).orderBy(asc(savedGuests.name)),
    getSettings(["booking.allowPartialPayment", "booking.partialPaymentBps", "booking.allowCashAtProperty", "booking.holdMinutes"]),
    publicCoupons(),
  ]);
  const r = row.room;
  const p = row.property;
  const gender = r.genderEligibility !== "ANY" ? r.genderEligibility : p.genderEligibility;
  const unit = one(sp.unit) === "ROOM" ? "ROOM" : "BED";
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: p.name, href: `/property/${p.slug}?checkIn=${checkIn}&checkOut=${checkOut}` }, { label: "Checkout" }]} />
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">Confirm and pay</h1>
      <CheckoutClient
        user={{ name: user.name, email: user.email, phone: user.phone, gender: profile[0]?.gender ?? null }}
        property={{ id: p.id, name: p.name, slug: p.slug, city: row.city, image: cover[0]?.url ?? null, checkInTime: p.checkInTime, checkOutTime: p.checkOutTime, idProofRequired: p.idProofRequired, allowCashAtProperty: p.allowCashAtProperty && settings["booking.allowCashAtProperty"], gender }}
        room={{ id: r.id, name: r.name, roomNumber: r.roomNumber, category: r.category, isAC: r.isAC, bathroom: r.bathroom, maxOccupancy: r.maxOccupancy, totalBeds: r.totalBeds }}
        request={{
          unit,
          beds: Math.max(1, Number(one(sp.beds)) || 1),
          bedIds: one(sp.bedIds) ? one(sp.bedIds).split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : [],
          checkIn,
          checkOut,
          adults: Math.max(1, Number(one(sp.adults)) || 1),
          children: Math.max(0, Number(one(sp.children)) || 0),
          services: one(sp.services).split(",").filter((s) => s === "FOOD" || s === "LAUNDRY") as ("FOOD" | "LAUNDRY")[],
        }}
        hasIdDocument={docs.length > 0}
        savedGuests={guests.map((g) => ({ id: g.id, name: g.name, phone: g.phone, email: g.email, gender: g.gender, age: g.age, relation: g.relation }))}
        payment={{ allowPartial: settings["booking.allowPartialPayment"], partialBps: settings["booking.partialPaymentBps"], holdMinutes: settings["booking.holdMinutes"] }}
        offers={offers.slice(0, 4).map((o) => ({ code: o.code, title: o.title }))}
      />
    </div>
  );
}
