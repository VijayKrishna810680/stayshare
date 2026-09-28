/** Edge-safe JWT helpers (used by middleware and server). */
import { jwtVerify, SignJWT } from "jose";

export const ACCESS_COOKIE = "ss_at";
export const REFRESH_COOKIE = "ss_rt";

export type AccessClaims = {
  sub: string;
  name: string;
  roles: string[];
  adm: boolean; // has admin.access
  sid: string; // session id
};

function secret() {
  const s =
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "dev-only-jwt-secret-change-me-0123456789abcdef");
  if (!s) throw new Error("JWT_SECRET missing");
  return new TextEncoder().encode(s);
}

export async function signAccessToken(c: AccessClaims, ttlSec: number) {
  return new SignJWT({ name: c.name, roles: c.roles, adm: c.adm, sid: c.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setIssuer("stayshare")
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "stayshare" });
    return {
      sub: payload.sub as string,
      name: payload.name as string,
      roles: (payload.roles as string[]) ?? [],
      adm: Boolean(payload.adm),
      sid: payload.sid as string,
    };
  } catch {
    return null;
  }
}
