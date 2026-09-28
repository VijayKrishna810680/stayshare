import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { savedGuests } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { notFound } from "@/lib/errors";

const guest = z.object({
  name: z.string().trim().min(2, "Enter the guest's full name").max(80),
  phone: z.string().trim().regex(/^(\+?91)?[6-9]\d{9}$/, "Enter a valid mobile number").optional().nullable().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").optional().nullable().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable().or(z.literal("")),
  age: z.number().int().min(0).max(120).optional().nullable(),
  relation: z.string().trim().max(40).optional().nullable(),
});
const clean = (g: z.infer<typeof guest>) => ({ name: g.name, phone: g.phone || null, email: g.email || null, gender: (g.gender || null) as "MALE" | "FEMALE" | "OTHER" | null, age: g.age ?? null, relation: g.relation || null });

export const GET = api(async () => {
  const u = await requireUser();
  return db.select().from(savedGuests).where(eq(savedGuests.userId, u.id)).orderBy(asc(savedGuests.name));
});

export const POST = api(async (req) => {
  const u = await requireUser();
  const g = await parseBody(req, guest);
  const [row] = await db.insert(savedGuests).values({ userId: u.id, ...clean(g) }).returning();
  return row;
});

export const PATCH = api(async (req) => {
  const u = await requireUser();
  const b = await parseBody(req, guest.extend({ id: z.string().uuid() }));
  const [row] = await db.update(savedGuests).set(clean(b)).where(and(eq(savedGuests.id, b.id), eq(savedGuests.userId, u.id))).returning();
  if (!row) throw notFound("Guest not found");
  return row;
});

export const DELETE = api(async (req) => {
  const u = await requireUser();
  const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
  const res = await db.delete(savedGuests).where(and(eq(savedGuests.id, id), eq(savedGuests.userId, u.id))).returning({ id: savedGuests.id });
  if (!res.length) throw notFound("Guest not found");
  return { ok: true };
});
