# StayShare Android app

Built with **Capacitor 7** from the same codebase (`android/`). The app is a native Android shell that loads the live StayShare web app, so every feature (booking, Razorpay/UPI payments, owner, staff and admin portals, QR scanning with the camera, "near me" location) works exactly like the website, with an offline fallback screen (`mobile-shell/index.html`), app icon and splash screen.

## Build locally
Requirements: Android Studio (Koala+), JDK 21, Android SDK 35.
```
npm install
CAP_SERVER_URL=https://your-stayshare-domain.com npx cap sync android
npx cap open android        # Android Studio → Run ▶ or Build → Generate Signed Bundle/APK
# or CLI:
cd android && ./gradlew assembleDebug   # android/app/build/outputs/apk/debug/app-debug.apk
```
Emulator against your laptop: `CAP_SERVER_URL=http://10.0.2.2:3000 npx cap sync android` (cleartext is enabled automatically for http URLs — dev only).

## Build in the cloud
GitHub → Actions → **Android APK** → Run workflow (enter your live URL). Download the `stayshare-debug-apk` artifact.

## Play Store release
1. Change `appId` in `capacitor.config.ts` if needed (default `com.stayshare.app`) and bump `versionCode`/`versionName` in `android/app/build.gradle`.
2. Create an upload keystore, configure signing in Android Studio, build an **AAB**.
3. Add `ALLOWED_ORIGINS=https://localhost` only if you later switch to bundled assets (not needed for the remote-URL shell).
4. Provide privacy policy URL (`/pages/privacy`), data-safety form (location, camera, personal info, financial info via payment gateway).
5. Set `NEXT_PUBLIC_ANDROID_APP_URL` to the Play Store link so the website's "Get the app" buttons point to it.

Permissions declared: INTERNET, CAMERA (QR check-in, ID photo), ACCESS_COARSE/FINE_LOCATION (near-me search).
