import "server-only";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { CurrentUser } from "./current";

/**
 * Step-up authentication: sensitive admin actions (contact details, fees, payment gateway, admin
 * management) require an OTP verified within the last 10 minutes, bound to the user AND session.
 */
const COOKIE = "ss_stepup";
const TTL_SEC = 600;
const key = () => new TextEncoder().encode(env.jwtSecret + ":stepup");

export async function grantStepUp(u: Pick<CurrentUser, "id" | "sessionId">) {
  const tok = await new SignJWT({ sid: u.sessionId }).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + TTL_SEC).sign(key());
  (await cookies()).set(COOKIE, tok, { httpOnly: true, sameSite: "strict", secure: env.isProd, path: "/", maxAge: TTL_SEC });
  return { expiresInSec: TTL_SEC };
}

export async function hasStepUp(u: Pick<CurrentUser, "id" | "sessionId">) {
  const tok = (await cookies()).get(COOKIE)?.value;
  if (!tok) return false;
  try {
    const { payload } = await jwtVerify(tok, key());
    return payload.sub === u.id && payload.sid === u.sessionId;
  } catch {
    return false;
  }
}

export async function requireStepUp(u: Pick<CurrentUser, "id" | "sessionId">) {
  if (!(await hasStepUp(u))) throw new AppError(428, "STEP_UP_REQUIRED", "For security, verify the OTP sent to your registered phone/email to continue.");
}
