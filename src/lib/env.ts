/** Centralised, typed access to environment variables. Secrets are server-only. */
function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return v;
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  get jwtSecret() {
    return req("JWT_SECRET", isProd ? undefined : "dev-only-jwt-secret-change-me-0123456789abcdef");
  },
  get encryptionKey() {
    // 32-byte key, hex or base64
    return req("ENCRYPTION_KEY", isProd ? undefined : "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  },
  accessTokenTtlSec: Number(process.env.ACCESS_TOKEN_TTL_SEC ?? 900),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  otpDevMode: process.env.OTP_DEV_MODE === "true" || !isProd,
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? "mock") as "mock" | "razorpay" | "cashfree" | "payu" | "stripe",
  mockWebhookSecret: process.env.MOCK_WEBHOOK_SECRET ?? "mock-webhook-secret",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
  storageDir: process.env.STORAGE_DIR ?? "./storage",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 8),
  mapsProvider: (process.env.NEXT_PUBLIC_MAPS_PROVIDER ?? "google-embed") as "google-embed" | "google" | "mapbox",
  emailProvider: process.env.EMAIL_PROVIDER ?? "console",
  smsProvider: process.env.SMS_PROVIDER ?? "console",
  whatsappProvider: process.env.WHATSAPP_PROVIDER ?? "console",
};
