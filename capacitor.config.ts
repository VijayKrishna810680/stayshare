import type { CapacitorConfig } from "@capacitor/cli";

/**
 * StayShare Android app (Capacitor).
 * The app loads the live StayShare web app (SSR + APIs) from CAP_SERVER_URL, so every feature —
 * booking, payments, owner/staff/admin portals — works identically in the app.
 * `mobile-shell/` is the bundled offline fallback screen.
 *
 *   CAP_SERVER_URL=https://app.yourdomain.com npx cap sync android
 *   (for an emulator against local dev: CAP_SERVER_URL=http://10.0.2.2:3000)
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://stayshare.example.com";

const config: CapacitorConfig = {
  appId: "com.stayshare.app",
  appName: "StayShare",
  webDir: "mobile-shell",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    androidScheme: "https",
    errorPath: "index.html",
    allowNavigation: ["checkout.razorpay.com", "api.razorpay.com", "accounts.google.com"],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#16423d",
  },
};

export default config;
