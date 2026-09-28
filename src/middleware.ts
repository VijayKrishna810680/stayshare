import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, verifyAccessToken } from "@/lib/auth/jwt";

/**
 * Edge middleware:
 *  1. CSRF: state-changing /api requests must come from our own origin (webhooks exempt; they verify signatures).
 *  2. Coarse route gating by role. Every API and page ALSO re-checks permissions server-side.
 *  3. Silent access-token refresh via /api/auth/refresh when only the refresh cookie is present.
 */
const PROTECTED: { prefix: string; allow: (roles: string[], adm: boolean) => boolean }[] = [
  { prefix: "/admin", allow: (_r, adm) => adm },
  { prefix: "/owner", allow: (r) => r.includes("OWNER") },
  { prefix: "/staff", allow: (r) => r.includes("STAFF") || r.includes("OWNER") },
  { prefix: "/account", allow: () => true },
  { prefix: "/checkout", allow: () => true },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !pathname.startsWith("/api/webhooks/")) {
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (origin) {
        let ok = false;
        try {
          ok = new URL(origin).host === host || allowed.includes(origin) || origin === "capacitor://localhost" || origin === "https://localhost";
        } catch {}
        if (!ok) return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request blocked" } }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  const rule = PROTECTED.find((p) => pathname === p.prefix || pathname.startsWith(p.prefix + "/"));
  if (!rule) return NextResponse.next();

  const at = req.cookies.get(ACCESS_COOKIE)?.value;
  const claims = at ? await verifyAccessToken(at) : null;
  if (!claims) {
    const next = encodeURIComponent(pathname + req.nextUrl.search);
    if (req.cookies.get(REFRESH_COOKIE)?.value) {
      return NextResponse.redirect(new URL(`/api/auth/refresh?next=${next}`, req.url));
    }
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }
  if (!rule.allow(claims.roles, claims.adm)) {
    return NextResponse.redirect(new URL("/forbidden", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/owner/:path*", "/staff/:path*", "/account/:path*", "/checkout/:path*"],
};
