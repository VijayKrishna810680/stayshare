# Integrations

All integrations use environment variables — no keys in code. With no credentials the app runs fully on mock/console drivers.

## Payments (`src/services/payments/`)
Interface `PaymentProvider { createOrder, parseWebhook, refund }`.
- **mock** (default): hosted test page `/pay/mock/[orderId]` → `/api/payments/mock/simulate` signs an event with `MOCK_WEBHOOK_SECRET` and POSTs it to `/api/webhooks/payments/mock`. Disabled when `PAYMENT_PROVIDER` ≠ mock.
- **razorpay**: set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Orders via REST, Checkout.js on the client, `/api/payments/razorpay/verify` verifies `order_id|payment_id` HMAC and re-fetches the payment server-side; webhooks verified with `X-Razorpay-Signature`; refunds via `/payments/{id}/refund`. UPI, cards, net banking and wallets are all offered by Razorpay Checkout.
- **cashfree / payu / stripe**: stubs in `payments/index.ts` — implement the three methods with the provider API and register them.
- Cash at property is recorded by staff at check-in/check-out.

## Google login
Create an OAuth 2.0 Web client in Google Cloud Console. Authorised redirect URI: `${APP_URL}/api/auth/google/callback`. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## SMS (OTP & alerts) — India
`SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`. Register sender ID and templates on the DLT portal (TRAI requirement). Driver: `smsDriver` in `src/services/notifications.ts`. Twilio/Gupshup can be added the same way.

## Email
`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`. Swap `emailDriver` for SES/SendGrid/SMTP if preferred.

## WhatsApp
`WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (Meta WhatsApp Cloud API). For business-initiated messages you must use approved template messages — adapt `whatsappDriver` to send `type: "template"`.

## Push notifications (Android)
Add `@capacitor/push-notifications`, Firebase project + `google-services.json` in `android/app/`, register the device token to the `push_tokens` table (API endpoint to add), and implement `pushDriver` with the FCM HTTP v1 API.

## Maps
Default `google-embed` needs no key (iframe embeds on property pages). For interactive maps/autocomplete set `NEXT_PUBLIC_MAPS_PROVIDER=google` + `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (restrict by HTTP referrer), or `mapbox` + `NEXT_PUBLIC_MAPBOX_TOKEN`.

## File storage
`local` driver writes to `STORAGE_DIR`. For S3/GCS/Azure Blob implement `saveUpload` / `readStored` in `src/services/storage.ts` (keep private files private — serve through `/api/files/[id]`, or use short-lived signed URLs after the same authorisation check).

## Payouts
Payouts are approved and marked paid with a UTR in Admin → Payouts. To automate, call RazorpayX / Cashfree Payouts in `transitionPayout(..., "PROCESSING")` and mark PAID/FAILED from their webhook.

## Live chat & support contacts
Built-in (no third party). Support email / phone / WhatsApp / hours are blank until the admin fills Admin → Settings → Contact & support (OTP step-up). Buttons appear automatically once set.
