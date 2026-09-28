import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Recompute ratingAvg / reviewCount for a property from its PUBLISHED reviews. */
export async function recomputeRating(propertyId: string) {
  await db.execute(sql`UPDATE properties p SET rating_avg = coalesce((SELECT round(avg(overall)::numeric, 2) FROM reviews r WHERE r.property_id = p.id AND r.status = 'PUBLISHED'), 0),
    review_count = (SELECT count(*) FROM reviews r WHERE r.property_id = p.id AND r.status = 'PUBLISHED') WHERE p.id = ${propertyId}::uuid`);
}
