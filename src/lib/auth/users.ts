import "server-only";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles, ownerProfiles, roles, userRoles, users } from "@/db/schema";
import { conflict } from "@/lib/errors";
import { hashPassword } from "./password";

export function normalisePhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  return "+" + d;
}

export async function findUserByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  const isEmail = id.includes("@");
  const [u] = await db
    .select()
    .from(users)
    .where(isEmail ? eq(users.email, id) : or(eq(users.phone, normalisePhone(id))));
  return u ?? null;
}

export async function assignRole(userId: string, roleKey: string) {
  const [r] = await db.select().from(roles).where(eq(roles.key, roleKey));
  if (!r) throw new Error(`Role ${roleKey} missing — run the seed`);
  await db.insert(userRoles).values({ userId, roleId: r.id }).onConflictDoNothing();
}

export async function createUserAccount(input: { name: string; email?: string | null; phone?: string | null; password?: string | null; role: "CUSTOMER" | "OWNER" | "STAFF" | "ADMIN" | "SUPER_ADMIN"; businessName?: string; googleId?: string; emailVerified?: boolean; phoneVerified?: boolean; createdBy?: string }) {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone ? normalisePhone(input.phone) : null;
  if (email) {
    const [e] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (e) throw conflict("An account with this email already exists");
  }
  if (phone) {
    const [p] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
    if (p) throw conflict("An account with this mobile number already exists");
  }
  const [u] = await db
    .insert(users)
    .values({
      name: input.name.trim(),
      email,
      phone,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      googleId: input.googleId,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
      phoneVerifiedAt: input.phoneVerified ? new Date() : null,
      createdBy: input.createdBy,
    })
    .returning();
  await assignRole(u!.id, input.role);
  if (input.role === "CUSTOMER") await db.insert(customerProfiles).values({ userId: u!.id });
  if (input.role === "OWNER") {
    await assignRole(u!.id, "CUSTOMER");
    await db.insert(customerProfiles).values({ userId: u!.id });
    await db.insert(ownerProfiles).values({ userId: u!.id, businessName: input.businessName || input.name });
  }
  return u!;
}
