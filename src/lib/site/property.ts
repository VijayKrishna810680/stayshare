import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  beds,
  cancellationPolicies,
  cities,
  facilities,
  localities,
  pricePlans,
  properties,
  propertyFacilities,
  propertyImages,
  propertyRules,
  propertyTypes,
  reviewReplies,
  reviews,
  roomFacilities,
  roomImages,
  rooms,
  users,
} from "@/db/schema";
import { roomsAvailability, sweepExpiredHolds, type RoomAvailability } from "@/services/availability";
import { todayIST } from "@/lib/dates";

export type PublicRoom = {
  id: string;
  roomNumber: string;
  name: string | null;
  category: string;
  sharingCapacity: number;
  totalBeds: number;
  maxOccupancy: number;
  isAC: boolean;
  bathroom: string;
  furnishing: string;
  gender: string;
  sizeSqft: number | null;
  description: string | null;
  allowBedBooking: boolean;
  allowEntireRoomBooking: boolean;
  images: string[];
  facilities: { key: string; name: string; icon: string | null }[];
  plan: {
    nightlyBed: number | null;
    nightlyRoom: number | null;
    monthlyBed: number | null;
    monthlyRoom: number | null;
    foodPerPersonPerDay: number;
    laundryPerMonth: number;
    securityDepositBed: number;
    securityDepositRoom: number;
  };
  availability: RoomAvailability | null;
};

/** Everything the public property page needs. Returns null unless the property is live. */
export async function getPublicProperty(slug: string, dates?: { checkIn?: string; checkOut?: string }) {
  const [p] = await db
    .select({
      property: properties,
      city: cities,
      locality: localities,
      type: propertyTypes,
      policy: cancellationPolicies,
    })
    .from(properties)
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .innerJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .leftJoin(localities, eq(localities.id, properties.localityId))
    .leftJoin(cancellationPolicies, eq(cancellationPolicies.id, properties.cancellationPolicyId))
    .where(and(eq(properties.slug, slug), eq(properties.approvalStatus, "APPROVED"), eq(properties.active, true), eq(properties.blocked, false), isNull(properties.deletedAt)));
  if (!p) return null;
  const pid = p.property.id;

  const [images, facs, rules, roomRows] = await Promise.all([
    db.select().from(propertyImages).where(and(eq(propertyImages.propertyId, pid), eq(propertyImages.status, "APPROVED"))).orderBy(desc(propertyImages.isCover), asc(propertyImages.sortOrder)),
    db
      .select({ key: facilities.key, name: facilities.name, icon: facilities.icon, category: facilities.category, note: propertyFacilities.note })
      .from(propertyFacilities)
      .innerJoin(facilities, eq(facilities.id, propertyFacilities.facilityId))
      .where(and(eq(propertyFacilities.propertyId, pid), eq(propertyFacilities.status, "APPROVED"), eq(facilities.active, true))),
    db.select().from(propertyRules).where(eq(propertyRules.propertyId, pid)).orderBy(asc(propertyRules.sortOrder)),
    db
      .select({ room: rooms, plan: pricePlans })
      .from(rooms)
      .innerJoin(pricePlans, and(eq(pricePlans.roomId, rooms.id), eq(pricePlans.active, true)))
      .where(and(eq(rooms.propertyId, pid), eq(rooms.approvalStatus, "APPROVED"), eq(rooms.active, true), isNull(rooms.deletedAt)))
      .orderBy(asc(rooms.roomNumber), desc(pricePlans.effectiveFrom)),
  ]);

  // one plan per room (latest active)
  const seen = new Set<string>();
  const roomList = roomRows.filter((r) => (seen.has(r.room.id) ? false : (seen.add(r.room.id), true)));
  const roomIds = roomList.map((r) => r.room.id);
  const [rImgs, rFacs] = roomIds.length
    ? await Promise.all([
        db.select().from(roomImages).where(and(inArray(roomImages.roomId, roomIds), eq(roomImages.status, "APPROVED"))).orderBy(asc(roomImages.sortOrder)),
        db.select({ roomId: roomFacilities.roomId, key: facilities.key, name: facilities.name, icon: facilities.icon }).from(roomFacilities).innerJoin(facilities, eq(facilities.id, roomFacilities.facilityId)).where(inArray(roomFacilities.roomId, roomIds)),
      ])
    : [[], []];

  let avail: Map<string, RoomAvailability> | null = null;
  if (dates?.checkIn && dates.checkOut && dates.checkOut > dates.checkIn && dates.checkIn >= todayIST()) {
    await sweepExpiredHolds();
    avail = await roomsAvailability(roomIds, dates.checkIn, dates.checkOut);
  }

  const publicRooms: PublicRoom[] = roomList.map(({ room, plan }) => ({
    id: room.id,
    roomNumber: room.roomNumber,
    name: room.name,
    category: room.category,
    sharingCapacity: room.sharingCapacity,
    totalBeds: room.totalBeds,
    maxOccupancy: room.maxOccupancy,
    isAC: room.isAC,
    bathroom: room.bathroom,
    furnishing: room.furnishing,
    gender: room.genderEligibility !== "ANY" ? room.genderEligibility : p.property.genderEligibility,
    sizeSqft: room.sizeSqft,
    description: room.description,
    allowBedBooking: room.allowBedBooking && room.totalBeds > 1,
    allowEntireRoomBooking: room.allowEntireRoomBooking || room.totalBeds <= 1,
    images: rImgs.filter((i) => i.roomId === room.id).map((i) => i.url),
    facilities: rFacs.filter((f) => f.roomId === room.id).map(({ key, name, icon }) => ({ key, name, icon })),
    plan: {
      nightlyBed: plan.nightlyBed,
      nightlyRoom: plan.nightlyRoom,
      monthlyBed: plan.monthlyBed,
      monthlyRoom: plan.monthlyRoom,
      foodPerPersonPerDay: plan.foodPerPersonPerDay,
      laundryPerMonth: plan.laundryPerMonth,
      securityDepositBed: plan.securityDepositBed,
      securityDepositRoom: plan.securityDepositRoom,
    },
    availability: avail?.get(room.id) ?? null,
  }));

  const pr = p.property;
  return {
    id: pr.id,
    slug: pr.slug,
    code: pr.code,
    name: pr.name,
    description: pr.description,
    addressLine: pr.addressLine,
    landmark: pr.landmark,
    postalCode: pr.postalCode,
    state: pr.state,
    latitude: pr.latitude,
    longitude: pr.longitude,
    city: { id: p.city.id, name: p.city.name, slug: p.city.slug },
    locality: p.locality ? { name: p.locality.name, slug: p.locality.slug } : null,
    propertyType: p.type.name,
    gender: pr.genderEligibility,
    minStayNights: pr.minStayNights,
    maxStayNights: pr.maxStayNights,
    checkInTime: pr.checkInTime,
    checkOutTime: pr.checkOutTime,
    idProofRequired: pr.idProofRequired,
    instantBooking: pr.instantBooking,
    allowCashAtProperty: pr.allowCashAtProperty,
    contactPhone: pr.showOwnerPhone ? pr.contactPhone : null,
    foodIncluded: pr.foodIncluded,
    nearbyPlaces: pr.nearbyPlaces ?? [],
    targetAudience: pr.targetAudience ?? [],
    refundPolicyText: pr.refundPolicyText,
    ratingAvg: pr.ratingAvg,
    reviewCount: pr.reviewCount,
    bookingCount: pr.bookingCount,
    isFeatured: pr.isFeatured,
    startingPrice: pr.startingPrice,
    videoUrls: pr.videoUrls ?? [],
    images: images.map((i) => ({ url: i.url, caption: i.caption })),
    facilities: facs,
    rules: rules.map((r) => r.text),
    policy: p.policy ? { key: p.policy.key, name: p.policy.name, description: p.policy.description, tiers: p.policy.tiers, noShowChargeBps: p.policy.noShowChargeBps, refundConvenienceFee: p.policy.refundConvenienceFee } : null,
    rooms: publicRooms,
  };
}
export type PublicProperty = NonNullable<Awaited<ReturnType<typeof getPublicProperty>>>;

export async function getPropertyReviews(propertyId: string, limit = 20) {
  const rows = await db
    .select({ review: reviews, author: users.name })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.customerId))
    .where(and(eq(reviews.propertyId, propertyId), eq(reviews.status, "PUBLISHED")))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
  const ids = rows.map((r) => r.review.id);
  const replies = ids.length
    ? await db.select({ reviewId: reviewReplies.reviewId, text: reviewReplies.text, createdAt: reviewReplies.createdAt, author: users.name }).from(reviewReplies).innerJoin(users, eq(users.id, reviewReplies.authorId)).where(inArray(reviewReplies.reviewId, ids))
    : [];
  const [agg] = await db
    .select({
      cleanliness: sql<number>`AVG(${reviews.cleanliness})::float`,
      location: sql<number>`AVG(${reviews.location})::float`,
      staff: sql<number>`AVG(${reviews.staff})::float`,
      facilities: sql<number>`AVG(${reviews.facilities})::float`,
      valueForMoney: sql<number>`AVG(${reviews.valueForMoney})::float`,
      foodQuality: sql<number | null>`AVG(${reviews.foodQuality})::float`,
      safety: sql<number>`AVG(${reviews.safety})::float`,
      overall: sql<number>`AVG(${reviews.overall})::float`,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(reviews)
    .where(and(eq(reviews.propertyId, propertyId), eq(reviews.status, "PUBLISHED")));
  return {
    breakdown: agg && agg.n > 0 ? agg : null,
    items: rows.map((r) => ({
      id: r.review.id,
      author: r.author,
      overall: r.review.overall,
      title: r.review.title,
      text: r.review.text,
      images: r.review.images,
      createdAt: r.review.createdAt.toISOString(),
      replies: replies.filter((x) => x.reviewId === r.review.id).map((x) => ({ text: x.text, author: x.author, createdAt: x.createdAt.toISOString() })),
    })),
  };
}

/** Bed map for one room: which beds are free for the given dates. */
export async function roomBedMap(roomId: string, checkIn?: string, checkOut?: string) {
  const bedRows = await db.select({ id: beds.id, bedNumber: beds.bedNumber, bedType: beds.bedType }).from(beds).where(and(eq(beds.roomId, roomId), eq(beds.active, true), isNull(beds.deletedAt))).orderBy(asc(beds.bedNumber));
  let free: Set<string> | null = null;
  if (checkIn && checkOut && checkOut > checkIn) {
    await sweepExpiredHolds();
    const a = await roomsAvailability([roomId], checkIn, checkOut);
    free = new Set(a.get(roomId)?.availableBedIds ?? []);
  }
  return bedRows.map((b) => ({ ...b, free: free ? free.has(b.id) : null }));
}

/** Recompute a property's denormalised rating from published reviews. */
export async function recomputePropertyRating(propertyId: string) {
  const [a] = await db
    .select({ avg: sql<number | null>`AVG(${reviews.overall})::float`, n: sql<number>`COUNT(*)::int` })
    .from(reviews)
    .where(and(eq(reviews.propertyId, propertyId), eq(reviews.status, "PUBLISHED")));
  await db
    .update(properties)
    .set({ ratingAvg: a?.avg ? Math.round(a.avg * 10) / 10 : 0, reviewCount: a?.n ?? 0 })
    .where(eq(properties.id, propertyId));
}
