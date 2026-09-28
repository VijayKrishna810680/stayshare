import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerProfiles, users } from "@/db/schema";

export async function loadProfile(userId: string) {
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, emailVerifiedAt: users.emailVerifiedAt, phoneVerifiedAt: users.phoneVerifiedAt, hasPassword: users.passwordHash, avatarUrl: users.avatarUrl, createdAt: users.createdAt }).from(users).where(eq(users.id, userId));
  const [p] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId));
  return {
    ...u!,
    hasPassword: Boolean(u?.hasPassword),
    profile: {
      gender: p?.gender ?? null,
      dateOfBirth: p?.dateOfBirth ?? null,
      occupation: p?.occupation ?? null,
      address: p?.address ?? null,
      city: p?.city ?? null,
      emergencyName: p?.emergencyName ?? null,
      emergencyPhone: p?.emergencyPhone ?? null,
    },
  };
}

