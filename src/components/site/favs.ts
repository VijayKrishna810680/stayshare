import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { favourites } from "@/db/schema";

/** Set of property ids the user saved (null when logged out → cards hide the heart until login click). */
export async function favouriteSet(userId: string | null | undefined): Promise<Set<string> | null> {
  if (!userId) return new Set();
  const rows = await db.select({ id: favourites.propertyId }).from(favourites).where(eq(favourites.userId, userId));
  return new Set(rows.map((r) => r.id));
}
