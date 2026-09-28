import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { availabilityCalendars, beds, cities, facilities, floors, localities, maintenanceIssues, properties, propertyDocuments, propertyFacilities, propertyImages, propertyRules, propertyTypes, rooms, users } from "@/db/schema";
import type { IssueRow, MRoom } from "@/components/staff/maintenance";
import type { CurrentUser } from "@/lib/auth/current";
import { staffPropertyIds } from "@/lib/owner-access";
import { maskPhone } from "@/lib/crypto";
import type { BookingListRow } from "@/services/owner-reports";
import type { LookupRow } from "@/components/staff/booking-search";
import type { BoardRoom } from "@/components/staff/board";
import { todayIST } from "@/lib/dates";

import type { DocItem, ImageItem, PropertyInfo, PropertyMeta } from "@/components/owner/types";

/** Server-side loaders shared by owner pages. */
export async function loadPropertyMeta(): Promise<PropertyMeta> {
  const [cs, ls, pts, fs] = await Promise.all([
    db.select({ id: cities.id, name: cities.name, state: cities.state, code: cities.code, latitude: cities.latitude, longitude: cities.longitude }).from(cities).where(eq(cities.active, true)).orderBy(asc(cities.name)),
    db.select({ id: localities.id, name: localities.name, cityId: localities.cityId }).from(localities).where(eq(localities.active, true)).orderBy(asc(localities.name)),
    db.select({ id: propertyTypes.id, name: propertyTypes.name }).from(propertyTypes).where(eq(propertyTypes.active, true)).orderBy(asc(propertyTypes.sortOrder), asc(propertyTypes.name)),
    db.select({ id: facilities.id, name: facilities.name, category: facilities.category, isCustom: facilities.isCustom, active: facilities.active }).from(facilities).orderBy(asc(facilities.name)),
  ]);
  return { cities: cs, localities: ls, propertyTypes: pts, facilities: fs };
}

/** Owner's property or 404 page. */
export async function ownedPropertyOr404(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(properties).where(and(eq(properties.id, id), eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));
  if (!p) notFound();
  return p;
}

export function toPropertyInfo(p: typeof properties.$inferSelect): PropertyInfo & { id: string; approvalStatus: string } {
  return {
    id: p.id,
    approvalStatus: p.approvalStatus,
    name: p.name,
    propertyTypeId: p.propertyTypeId,
    description: p.description,
    genderEligibility: p.genderEligibility,
    targetAudience: p.targetAudience ?? [],
    addressLine: p.addressLine,
    landmark: p.landmark,
    cityId: p.cityId,
    localityId: p.localityId,
    state: p.state,
    postalCode: p.postalCode,
    latitude: p.latitude,
    longitude: p.longitude,
    checkInTime: p.checkInTime,
    checkOutTime: p.checkOutTime,
    minStayNights: p.minStayNights,
    maxStayNights: p.maxStayNights,
    idProofRequired: p.idProofRequired,
    instantBooking: p.instantBooking,
    allowCashAtProperty: p.allowCashAtProperty,
    foodIncluded: p.foodIncluded,
    contactPhone: p.contactPhone,
    showOwnerPhone: p.showOwnerPhone,
  };
}

export async function loadPropertyAssets(propertyId: string) {
  const [imgs, docs, facs, rules] = await Promise.all([
    db.select().from(propertyImages).where(eq(propertyImages.propertyId, propertyId)).orderBy(asc(propertyImages.sortOrder)),
    db.select().from(propertyDocuments).where(eq(propertyDocuments.propertyId, propertyId)),
    db.select({ facilityId: propertyFacilities.facilityId, status: propertyFacilities.status, name: facilities.name, isCustom: facilities.isCustom }).from(propertyFacilities).innerJoin(facilities, eq(facilities.id, propertyFacilities.facilityId)).where(eq(propertyFacilities.propertyId, propertyId)),
    db.select().from(propertyRules).where(eq(propertyRules.propertyId, propertyId)).orderBy(asc(propertyRules.sortOrder)),
  ]);
  const images: ImageItem[] = imgs.map((i) => ({ id: i.id, url: i.url, caption: i.caption, isCover: i.isCover, status: i.status, sortOrder: i.sortOrder }));
  const documents: DocItem[] = docs.map((d) => ({ id: d.id, docType: d.docType, fileId: d.fileId, status: d.status, notes: d.notes, createdAt: d.createdAt.toISOString() }));
  return {
    images,
    documents,
    facilitySel: facs.filter((f) => !f.isCustom).map((f) => ({ facilityId: f.facilityId, status: f.status })),
    customFacilities: facs.filter((f) => f.isCustom).map((f) => ({ id: f.facilityId, name: f.name, status: f.status })),
    facilityNames: facs.map((f) => ({ name: f.name, status: f.status })),
    rules: rules.map((r) => r.text),
  };
}

// ── maintenance ──

export async function loadMaintenance(propertyIds: string[]): Promise<{ issues: IssueRow[]; rooms: MRoom[] }> {
  if (!propertyIds.length) return { issues: [], rooms: [] };
  const rows = await db
    .select({ m: maintenanceIssues, propertyName: properties.name, roomNumber: rooms.roomNumber, reporter: users.name })
    .from(maintenanceIssues)
    .innerJoin(properties, eq(properties.id, maintenanceIssues.propertyId))
    .leftJoin(rooms, eq(rooms.id, maintenanceIssues.roomId))
    .innerJoin(users, eq(users.id, maintenanceIssues.reportedBy))
    .where(inArray(maintenanceIssues.propertyId, propertyIds))
    .orderBy(desc(maintenanceIssues.createdAt))
    .limit(300);
  const rs = await db
    .select({ id: rooms.id, roomNumber: rooms.roomNumber, propertyId: rooms.propertyId, maintenanceStatus: rooms.maintenanceStatus })
    .from(rooms)
    .where(and(inArray(rooms.propertyId, propertyIds), isNull(rooms.deletedAt), eq(rooms.active, true)))
    .orderBy(asc(rooms.roomNumber));
  return {
    issues: rows.map((r) => ({ id: r.m.id, propertyId: r.m.propertyId, propertyName: r.propertyName, roomId: r.m.roomId, roomNumber: r.roomNumber, title: r.m.title, description: r.m.description, priority: r.m.priority, status: r.m.status, createdAt: r.m.createdAt.toISOString(), reporter: r.reporter, resolvedAt: r.m.resolvedAt?.toISOString() ?? null })),
    rooms: rs,
  };
}

// ── staff / front-desk context ──

/** Properties the user can operate at the front desk, and the selected one (?p=). null = all. */
export async function deskContext(u: CurrentUser, p?: string, requireOne = false) {
  const ids = await staffPropertyIds(u);
  const list = ids.length ? await db.select({ id: properties.id, name: properties.name }).from(properties).where(inArray(properties.id, ids)).orderBy(asc(properties.name)) : [];
  let selected = p && ids.includes(p) ? p : null;
  if (!selected && (requireOne || list.length === 1)) selected = list[0]?.id ?? null;
  return { properties: list, selected, scope: selected ? [selected] : ids };
}

export function toLookupRows(rows: BookingListRow[]): LookupRow[] {
  return rows.map((r) => ({ ...r, guestPhone: maskPhone(r.guestPhone), balanceDue: Math.max(0, r.totalAmount - r.paidAmount) }));
}

export async function loadBoard(propertyId: string): Promise<BoardRoom[]> {
  const today = todayIST();
  const rs = await db
    .select({ r: rooms, floorName: floors.name, floorNumber: floors.number })
    .from(rooms)
    .leftJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt), eq(rooms.active, true)))
    .orderBy(asc(floors.number), asc(rooms.roomNumber));
  const ids = rs.map((x) => x.r.id);
  if (!ids.length) return [];
  const bs = await db
    .select({ b: beds, guest: users.name })
    .from(beds)
    .leftJoin(users, eq(users.id, beds.currentCustomerId))
    .where(and(inArray(beds.roomId, ids), isNull(beds.deletedAt), eq(beds.active, true)))
    .orderBy(asc(beds.bedNumber));
  const cal = await db.select({ bedId: availabilityCalendars.bedId, status: availabilityCalendars.status }).from(availabilityCalendars).where(and(inArray(availabilityCalendars.roomId, ids), eq(availabilityCalendars.night, today)));
  const tonight = new Map(cal.map((c) => [c.bedId, c.status]));
  return rs.map(({ r, floorName, floorNumber }) => ({
    id: r.id,
    roomNumber: r.roomNumber,
    name: r.name,
    floor: floorName ?? (floorNumber != null ? `Floor ${floorNumber}` : null),
    category: r.category,
    isAC: r.isAC,
    cleaningStatus: r.cleaningStatus,
    maintenanceStatus: r.maintenanceStatus,
    beds: bs
      .filter((x) => x.b.roomId === r.id)
      .map(({ b, guest }) => ({ id: b.id, bedNumber: b.bedNumber, code: b.code, status: b.status, bedType: b.bedType, guest: b.status === "OCCUPIED" ? guest : null, bookedTonight: ["BOOKED", "HELD"].includes(tonight.get(b.id) ?? ""), blockedTonight: tonight.get(b.id) === "BLOCKED" })),
  }));
}
