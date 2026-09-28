import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { env } from "@/lib/env";
import { reqMeta } from "@/lib/api";
import { createSession } from "@/lib/auth/session";
import { createUserAccount } from "@/lib/auth/users";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const saved = jar.get("ss_oauth")?.value;
  jar.delete("ss_oauth");
  const { state, next } = saved ? (JSON.parse(saved) as { state: string; next: string }) : { state: "", next: "/account" };
  const code = req.nextUrl.searchParams.get("code");
  if (!code || !state || req.nextUrl.searchParams.get("state") !== state) return NextResponse.redirect(new URL("/login?error=oauth_state", req.url));
  try {
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env.googleClientId, client_secret: env.googleClientSecret, redirect_uri: `${env.appUrl}/api/auth/google/callback`, grant_type: "authorization_code" }),
    }).then((r) => r.json() as Promise<{ access_token?: string }>);
    if (!tok.access_token) throw new Error("no access token");
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(
      (r) => r.json() as Promise<{ sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string }>,
    );
    let [u] = await db.select().from(users).where(eq(users.googleId, info.sub));
    if (!u && info.email && info.email_verified) {
      [u] = await db.select().from(users).where(eq(users.email, info.email.toLowerCase()));
      if (u) await db.update(users).set({ googleId: info.sub, emailVerifiedAt: new Date() }).where(eq(users.id, u.id));
    }
    if (!u) u = await createUserAccount({ name: info.name ?? info.email ?? "Guest", email: info.email, role: "CUSTOMER", googleId: info.sub, emailVerified: Boolean(info.email_verified) });
    if (u.status === "SUSPENDED") return NextResponse.redirect(new URL("/login?error=suspended", req.url));
    await createSession(u.id, reqMeta(req));
    return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/account", req.url));
  } catch (e) {
    logger.error("oauth.google", { err: String(e) });
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}
