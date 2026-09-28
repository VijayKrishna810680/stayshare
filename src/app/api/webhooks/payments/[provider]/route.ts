import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { paymentWebhooks } from "@/db/schema";
import { getProvider } from "@/services/payments";
import { processWebhook } from "@/services/booking";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Payment gateway webhooks: POST /api/webhooks/payments/{mock|razorpay|...}
 * The RAW body is verified with the provider's signature before anything is trusted.
 * Bookings are confirmed here (or via the server-side verify endpoint) — never by the frontend.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const raw = await req.text();
  let p;
  try {
    p = getProvider(provider);
  } catch {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  try {
    const event = await p.parseWebhook(raw, req.headers);
    const out = await processWebhook(p.name, event);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof AppError && e.code === "BAD_SIGNATURE") {
      await db
        .insert(paymentWebhooks)
        .values({ provider, eventId: `invalid-${Date.now()}-${Math.random()}`, eventType: "invalid_signature", signatureOk: false, payload: { raw: raw.slice(0, 2000) } })
        .catch(() => {});
      logger.warn("webhook.bad_signature", { provider });
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
    logger.error("webhook.error", { provider, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }
}
