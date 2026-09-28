import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { env } from "./env";

function key(): Buffer {
  const k = env.encryptionKey;
  const buf = /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)");
  return buf;
}

/** AES-256-GCM encryption for sensitive values (ID numbers, bank accounts, PAN). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Bad ciphertext");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function hmacSha256Hex(secret: string, data: string | Buffer): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomOtp(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

// ── masking helpers ──
export function last4(s: string): string {
  return s.replace(/\s|-/g, "").slice(-4);
}
export function maskTail(last: string | null | undefined, total = 12): string {
  if (!last) return "—";
  return "•".repeat(Math.max(0, total - last.length)) + last;
}
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const p = phone.replace(/\D/g, "");
  if (p.length < 6) return "••••";
  return p.slice(0, 2) + "•".repeat(p.length - 4) + p.slice(-2);
}
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [u, d] = email.split("@");
  if (!d) return "••••";
  return (u ?? "").slice(0, 2) + "•••@" + d;
}
