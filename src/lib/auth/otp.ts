import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { env } from "@/lib/env";
import { badRequest, tooMany } from "@/lib/errors";
import { randomOtp, safeEqual, sha256 } from "@/lib/crypto";
import { notify } from "@/services/notifications";

const TTL_MIN = 5;
const MAX_ATTEMPTS = 5;

export async function issueOtp(target: string, purpose: string) {
  const recent = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose), gt(otpCodes.createdAt, new Date(Date.now() - 30_000))));
  if (recent.length) throw tooMany("Please wait 30 seconds before requesting another OTP");
  const code = randomOtp(6);
  await db.insert(otpCodes).values({ target, purpose, codeHash: sha256(`${target}:${code}`), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) });
  const isEmail = target.includes("@");
  await notify("otp", { to: isEmail ? { email: target } : { phone: target }, vars: { code, minutes: TTL_MIN } });
  return { devCode: env.otpDevMode ? code : undefined, expiresInSec: TTL_MIN * 60 };
}

export async function verifyOtp(target: string, purpose: string, code: string) {
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt < new Date()) throw badRequest("OTP has expired. Please request a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw tooMany("Too many incorrect attempts. Request a new OTP.");
  if (!safeEqual(row.codeHash, sha256(`${target}:${code}`))) {
    await db.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.id, row.id));
    throw badRequest("Incorrect OTP");
  }
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
}
