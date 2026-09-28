import { z } from "zod";
import { api, parseQuery } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { getPropertyReviews, getPublicProperty, roomBedMap } from "@/lib/site/property";

const q = z.object({
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  roomId: z.string().uuid().optional(),
  reviews: z.enum(["1"]).optional(),
});

/** Public property details with live availability for the given dates (and a bed map for ?roomId). */
export const GET = api<{ slug: string }>(
  async (req, { params }) => {
    const query = parseQuery(req, q);
    const property = await getPublicProperty(params.slug, { checkIn: query.checkIn, checkOut: query.checkOut });
    if (!property) throw notFound("Property not found");
    const out: Record<string, unknown> = { property };
    if (query.roomId && property.rooms.some((r) => r.id === query.roomId)) out.beds = await roomBedMap(query.roomId, query.checkIn, query.checkOut);
    if (query.reviews) out.reviews = await getPropertyReviews(property.id);
    return out;
  },
  { rateLimit: { limit: 180, windowSec: 60 } },
);
