import { tooMany } from "./errors";

/**
 * Fixed-window in-memory rate limiter. Good for a single instance.
 * For multi-instance production deployments, back this with Redis (see docs/DEPLOYMENT.md).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return;
  }
  b.count++;
  if (b.count > limit) throw tooMany();
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local") as string;
}
