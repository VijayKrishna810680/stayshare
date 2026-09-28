import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { api, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { badRequest, conflict } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { getOwnedBookingRow } from "@/lib/site/bookings";
import { recomputePropertyRating } from "@/lib/site/property";

const r = z.number().int().min(1, "Rate every category from 1 to 5").max(5);
const schema = z.object({
  cleanliness: r,
  location: r,
  staff: r,
  facilities: r,
  valueForMoney: r,
  foodQuality: r.optional().nullable(),
  safety: r,
  overall: r,
  title: z.string().trim().max(120).optional().nullable(),
  text: z.string().trim().min(10, "Please write at least a couple of sentences").max(3000),
  images: z.array(z.string().regex(/^\/api\/files\/[0-9a-f-]{36}$/, "Invalid image")).max(6).default([]),
});

/** Write a review after the stay (one per booking). */
export const POST = api<{ id: string }>(
  async (req, { params }) => {
    const u = await requireUser();
    const b = await getOwnedBookingRow(params.id, u.id);
    if (!["CHECKED_OUT", "COMPLETED"].includes(b.status)) throw badRequest("You can review a stay after you check out");
    const body = await parseBody(req, schema);
    const [existing] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.bookingId, b.id));
    if (existing) throw conflict("You have already reviewed this stay");
    const { "reviews.autoPublish": autoPublish } = await getSettings(["reviews.autoPublish"]);
    const [row] = await db
      .insert(reviews)
      .values({ bookingId: b.id, customerId: u.id, propertyId: b.propertyId, ...body, foodQuality: body.foodQuality ?? null, title: body.title || null, status: autoPublish ? "PUBLISHED" : "PENDING" })
      .returning({ id: reviews.id, status: reviews.status });
    await recomputePropertyRating(b.propertyId);
    return row;
  },
  { rateLimit: { limit: 10, windowSec: 600 } },
);
