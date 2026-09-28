import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { beds, cities, localities, properties, roles, rooms, userRoles, users } from "@/db/schema";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function pageArgs(sp: Record<string, string | string[] | undefined>, pageSize = 25) {
  const page = Math.max(1, Number(one(sp.page)) || 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export async function cityOptions() {
  return (await db.select({ id: cities.id, name: cities.name }).from(cities).orderBy(asc(cities.name))).map((c) => ({ value: c.id, label: c.name }));
}
export async function localityOptions() {
  return (await db.select({ id: localities.id, name: localities.name, city: cities.name }).from(localities).innerJoin(cities, eq(cities.id, localities.cityId)).orderBy(asc(cities.name), asc(localities.name))).map((l) => ({ value: l.id, label: `${l.name}, ${l.city}` }));
}
export async function propertyOptions() {
  return (await db.select({ id: properties.id, name: properties.name, code: properties.code }).from(properties).where(isNull(properties.deletedAt)).orderBy(asc(properties.name))).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }));
}
export async function roomOptions() {
  return (
    await db.select({ id: rooms.id, no: rooms.roomNumber, name: rooms.name, prop: properties.name }).from(rooms).innerJoin(properties, eq(properties.id, rooms.propertyId)).where(isNull(rooms.deletedAt)).orderBy(asc(properties.name), asc(rooms.roomNumber))
  ).map((r) => ({ value: r.id, label: `${r.prop} · Room ${r.no}${r.name ? ` (${r.name})` : ""}` }));
}
export async function bedOptions() {
  return (await db.select({ id: beds.id, code: beds.code }).from(beds).where(isNull(beds.deletedAt)).orderBy(asc(beds.code))).map((b) => ({ value: b.id, label: b.code }));
}
export async function usersWithRole(role: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.key, role), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}
export async function customerOptions() {
  return (await usersWithRole("CUSTOMER")).map((u) => ({ value: u.id, label: `${u.name} · ${u.email ?? u.phone ?? ""}` }));
}
export async function ownerOptions() {
  return (await usersWithRole("OWNER")).map((u) => ({ value: u.id, label: `${u.name} · ${u.email ?? u.phone ?? ""}` }));
}
