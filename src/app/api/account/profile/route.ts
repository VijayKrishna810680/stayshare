import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customerProfiles, users } from "@/db/schema";
import { api, parseBody, reqMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { normalisePhone } from "@/lib/auth/users";
import { audit } from "@/lib/audit";
import { conflict } from "@/lib/errors";
import { loadProfile } from "@/lib/site/profile";

export const GET = api(async () => {
  const u = await requireUser();
  return loadProfile(u.id);
});

const opt = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional().nullable().or(z.literal("")),
  phone: z.string().trim().regex(/^(\+?91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number").optional().nullable().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable().or(z.literal("")),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
  occupation: opt(80),
  address: opt(300),
  city: opt(80),
  emergencyName: opt(80),
  emergencyPhone: z.string().trim().regex(/^(\+?91)?[6-9]\d{9}$/, "Enter a valid emergency contact number").optional().nullable().or(z.literal("")),
});

export const PATCH = api(async (req) => {
  const u = await requireUser();
  const b = await parseBody(req, schema);
  const email = b.email || null;
  const phone = b.phone ? normalisePhone(b.phone) : null;
  if (!email && !phone) throw conflict("Keep at least an email or a mobile number on your account");
  if (email) {
    const [x] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, u.id)));
    if (x) throw conflict("This email is already used by another account");
  }
  if (phone) {
    const [x] = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), ne(users.id, u.id)));
    if (x) throw conflict("This mobile number is already used by another account");
  }
  const [cur] = await db.select().from(users).where(eq(users.id, u.id));
  await db
    .update(users)
    .set({ name: b.name, email, phone, emailVerifiedAt: email === cur!.email ? cur!.emailVerifiedAt : null, phoneVerifiedAt: phone === cur!.phone ? cur!.phoneVerifiedAt : null, updatedBy: u.id })
    .where(eq(users.id, u.id));
  const profile = {
    gender: (b.gender || null) as "MALE" | "FEMALE" | "OTHER" | null,
    dateOfBirth: b.dateOfBirth || null,
    occupation: b.occupation,
    address: b.address,
    city: b.city,
    emergencyName: b.emergencyName,
    emergencyPhone: b.emergencyPhone ? normalisePhone(b.emergencyPhone) : null,
  };
  await db.insert(customerProfiles).values({ userId: u.id, ...profile }).onConflictDoUpdate({ target: customerProfiles.userId, set: profile });
  await audit({ actorId: u.id, action: "profile.update", entityType: "user", entityId: u.id, ...reqMeta(req) });
  return loadProfile(u.id);
});
