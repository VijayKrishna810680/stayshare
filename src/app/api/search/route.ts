import { api, parseQuery } from "@/lib/api";
import { searchProperties, searchSchema } from "@/lib/site/search";

/** Public search. Same parameters as the /search page. */
export const GET = api(
  async (req) => {
    const params = parseQuery(req, searchSchema);
    const r = await searchProperties(params);
    return { ...r, items: r.items.map(({ roomIds: _r, ...rest }) => rest) };
  },
  { rateLimit: { limit: 120, windowSec: 60 } },
);
