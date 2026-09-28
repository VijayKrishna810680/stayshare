import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { api, reqMeta } from "@/lib/api";
import { REFRESH_COOKIE } from "@/lib/auth/jwt";
import { clearAuthCookies, rotateSession } from "@/lib/auth/session";
import { unauthorized } from "@/lib/errors";

/** POST: API-style refresh (used by the client fetch helper). */
export const POST = api(async (req) => {
  const rt = (await cookies()).get(REFRESH_COOKIE)?.value;
  const res = rt ? await rotateSession(rt, reqMeta(req)) : null;
  if (!res) {
    await clearAuthCookies();
    throw unauthorized("Session expired. Please log in again.");
  }
  return { ok: true };
});

/** GET: used by middleware to silently refresh then bounce back to the original page. */
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const rt = (await cookies()).get(REFRESH_COOKIE)?.value;
  const res = rt ? await rotateSession(rt, reqMeta(req)) : null;
  if (!res) {
    await clearAuthCookies();
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(safeNext)}`, req.url));
  }
  return NextResponse.redirect(new URL(safeNext, req.url));
}
