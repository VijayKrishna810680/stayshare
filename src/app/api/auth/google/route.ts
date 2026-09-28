import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

/** Starts Google OAuth 2.0 (Authorization Code flow). Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. */
export async function GET(req: NextRequest) {
  if (!env.googleClientId) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", req.url));
  }
  const state = randomToken(16);
  const next = req.nextUrl.searchParams.get("next") ?? "/account";
  (await cookies()).set("ss_oauth", JSON.stringify({ state, next }), { httpOnly: true, sameSite: "lax", secure: env.isProd, maxAge: 600, path: "/" });
  const p = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: `${env.appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}
