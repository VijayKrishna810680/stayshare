# StayShare

**Flexible stays. Affordable sharing. Comfortable living.**

StayShare is a full-stack booking platform for accommodation and co-living. Guests can book hotels, hostels, PGs, co-living spaces, service apartments and family lodges for any length of stay: one night, 2/5/10/15/20/30 nights, monthly, or custom dates. They can take a **single bed in a shared room** or book the **entire room**, AC or non-AC, in male-only, female-only, mixed or family rooms.

It has a website (installable as a PWA) and an **Android app** built from the same codebase with Capacitor. There are four portals: **Customer**, **Property owner (partner)**, **Property staff** and **Platform admin**.

> **Business rule:** building owners create their account, add buildings, floors, rooms and beds, and upload photos, facilities, rules, KYC and bank details. **Only the StayShare admin team sets prices.** A room is visible to customers only after an admin has approved it *and* given it a price plan. Owners see that price read-only. The admin can optionally allow price suggestions (`owner.allowPriceSuggestion`) or grant an individual owner final-price control.

---

## 1. Project folder structure

```
stayshare/
├─ src/
│  ├─ app/
│  │  ├─ (site)/            Customer website: home, search, property, room, checkout, pay, booking status,
│  │  │                     login/register/OTP/forgot/reset, account/*, pages/[slug], contact, faq, partner, plus
│  │  ├─ owner/             Partner portal: dashboard, properties wizard & manager, bookings, guests, check-in/out,
│  │  │                     earnings, payouts, reports, staff, KYC, bank/UPI, partner plan, notifications, support
│  │  ├─ staff/             Front-desk portal: today, check-in (QR scan), check-out, rooms & beds board, maintenance
│  │  ├─ admin/             Admin console: dashboard, approvals, pricing, taxes, commissions, coupons, policies,
│  │  │                     subscriptions, bookings, payments, refunds, payouts, users, admins & roles, properties,
│  │  │                     availability, reviews, support, live chat, notifications, catalogue, content, reports,
│  │  │                     audit logs, settings (OTP step-up)
│  │  └─ api/               REST API (≈150 route handlers): auth, search, quote, bookings, payments, webhooks,
│  │                        uploads, files, chat, subscriptions, account/*, owner/*, staff/*, admin/*, health
│  ├─ db/                   Drizzle schema (77 tables) + client
│  ├─ services/             Business logic: pricing-engine (pure), pricing, availability (anti double-booking),
│  │                        booking, stay (check-in/out, modifications), settlement (earnings/payouts), invoice (PDF),
│  │                        payments/{mock,razorpay,…}, notifications, storage, subscriptions, livechat, reports
│  ├─ lib/                  auth (JWT, sessions, OTP, step-up), rbac, api wrapper, crypto (AES-GCM), money, dates,
│  │                        settings, rate limit, audit, export (CSV/XLSX/PDF), counters, logger
│  ├─ components/           ui kit, layout (dashboard shell), site, owner, staff, admin
│  └─ middleware.ts         CSRF origin check, role gating, silent token refresh
├─ drizzle/                 SQL migrations
├─ scripts/                 migrate.ts, seed.ts (demo data), e2e-smoke.mjs, serve-local.sh
├─ tests/                   vitest unit + DB integration tests (incl. concurrency)
├─ android/                 Capacitor Android project (Android Studio ready)
├─ mobile-shell/            Offline fallback screen bundled into the Android app
├─ public/                  icons, manifest, service worker, placeholder art
├─ docs/                    DEPLOYMENT.md, INTEGRATIONS.md, ANDROID.md, AGENT_BRIEF.md (engineering conventions)
├─ Dockerfile, docker-compose.yml, .github/workflows/{ci,android}.yml, .env.example
```

## 2. Database schema summary

PostgreSQL, managed by Drizzle ORM (`src/db/schema.ts`, migrations in `drizzle/`). UUID primary keys. `created_at`/`updated_at` everywhere, `created_by`/`updated_by` on editable rows, `deleted_at` for soft deletes. **All money is stored as integer paise**, and percentages as basis points.

| Area | Tables |
|---|---|
| Identity & access | users, roles, permissions, user_roles, role_permissions, sessions (refresh-token rotation), otp_codes, password_resets, push_tokens, customer_profiles, owner_profiles, staff_profiles, staff_assignments, identity_documents (encrypted numbers), saved_guests, file_uploads |
| Catalogue | cities, localities, property_types, facilities, cancellation_policies |
| Inventory | properties, property_documents, property_images, property_facilities, property_rules, floors, rooms, room_images, room_facilities, beds, **availability_calendars** (one row per bed per night, `UNIQUE(bed_id, night)`), inventory_blocks, maintenance_issues |
| Pricing (admin) | price_plans, duration_prices, pricing_rules (seasonal/weekend/surge/festival/promotion/override × global/city/locality/property/room/bed/customer), price_history, tax_rules, commissions, coupons, coupon_usage |
| Bookings | bookings, booking_guests, booking_rooms, booking_beds, booking_services, booking_status_history, booking_modifications, check_ins, check_outs, cancellations |
| Money | payments, payment_transactions, payment_webhooks, invoices, refunds, owner_earnings, payouts, payout_transactions |
| Subscriptions | subscription_plans (priced by admin), subscriptions |
| Engagement | reviews, review_replies, favourites, notifications, notification_templates, support_tickets, support_messages, chat_conversations, chat_messages |
| Platform | audit_logs, application_settings, banners, faqs, content_pages, counters |

**How double booking is prevented.** Every held, sold or blocked bed-night is a row in `availability_calendars`, protected by `UNIQUE(bed_id, night)`.
- A bed booking claims that bed for each night.
- An entire-room booking claims **every** bed in the room. That automatically conflicts with any individual bed booking, and the other way round.
- The inserts run inside a transaction with a savepoint. When two requests race, Postgres lets exactly one succeed, and the other gets `409 Conflict`. This is tested with 10 simultaneous requests.
- A payment hold is a `HELD` row with an expiry. Expired holds are swept automatically.

## 3. Completed-feature checklist

- [x] **Roles and access:** role-based access for customer, owner, staff, admin and super admin, plus custom admin roles (e.g. Finance admin) with a permission editor.
- [x] **Ways to sign in:** email or mobile with password, mobile/email OTP, and Google OAuth (needs credentials).
- [x] **Sessions and passwords:** access and refresh tokens, refresh-token rotation with reuse detection, logout per device or everywhere, forgot/reset password, account lockout, rate limiting.
- [x] **OTP step-up for sensitive admin actions:** contact details, fees, payouts, creating admins and changing roles.
- [x] **Property hierarchy:** Platform → City → Locality → Property → Floor → Room → Bed. Covers 11 property types; private, shared (1–6), family and dormitory rooms; AC/non-AC; attached/common bath; gender rules.
- [x] **Owner onboarding:** registration, KYC (PAN encrypted), bank/UPI (account number encrypted), a property wizard, photo and document uploads, floors, rooms and auto-created beds, facilities including custom ones, house rules, blocks and maintenance, staff accounts, and review replies.
- [x] **Admin approvals:** of owners, properties, rooms, images, facilities and documents. A room can't be approved without a price plan.
- [x] **Admin pricing engine:**
  - Rates: nightly, weekly and monthly, per bed and per room; duration packages (1/2/5/10/15/20/30/custom nights).
  - Extra charges: extra adult, child, AC, food, laundry, cleaning fee and deposit.
  - Rules: seasonal, weekend, surge, festival, promotion and override, at any scope including a single customer.
  - Management: full price history with reason and effective dates, bulk copy and % adjust, and a live preview.
- [x] **Taxes:** GST slabs (≤ ₹7,500/night at 5%, > ₹7,500 at 18%, plus a long-stay exemption for 90+ days at ≤ ₹20,000/month) are fully configurable. Also: GST on the convenience fee, platform commission (global, city or property), and coupons (%, flat, caps, first booking, city/property/unit, funded by platform or property, non-refundable).
- [x] **Search:** by city, locality, landmark or name, or near me. Filters cover every attribute requested (price, AC, sharing type, gender, food, bath, Wi-Fi, parking, laundry, kitchen, rating, type, min stay, instant, refundable), with 7 sort options, live availability and pagination.
- [x] **Booking flow:** dates → guests → bed/room → services → price breakdown → coupon → guest details → ID upload → terms → payment. Inventory is locked during payment, and there are 15 booking statuses. Booking numbers look like `SS-HYD-2026-000001`, and each booking gets a QR code.
- [x] **Payments:**
  - Options: full, partial advance or pay at property.
  - Gateways: a mock gateway with HMAC-signed webhooks, and a real Razorpay adapter (orders, checkout signature verification, webhooks, refunds). Cashfree/PayU/Stripe adapter stubs.
  - Verification: bookings are confirmed **only** by a backend-verified webhook or API check, never by the frontend.
- [x] **Invoices:** GST-ready PDFs, for both booking and final invoices.
- [x] **Check-in:** search by booking number or phone, or scan the QR; verify payment and ID (only the last 4 digits are stored); assign beds; collect the deposit or balance.
- [x] **Check-out:** inspection, damage and extra charges, deposit settlement and refund, early-checkout refund, final invoice, and beds sent for cleaning then made available.
- [x] **Changes to a stay:** extension, early check-in, late check-out, room or bed change, AC or private upgrade, add or remove a guest. Each is repriced, paid for or refunded, needs approval where configured, and keeps a history.
- [x] **Cancellations:** configurable policies with a refund preview, admin override, no-show handling, exceptional refund requests with admin approval, and gateway refunds.
- [x] **Owner earnings and payouts:** gross, taxes, commission, gateway fee, platform- vs property-funded discounts, penalties, refund deductions, net. Payouts go through pending/on hold/approved/processing/paid/failed/reversed, with disputes and settlement reports.
- [x] **Reviews:** only for completed stays, with 8 rating categories, photos, owner replies, reporting and moderation.
- [x] **Notifications:** email, SMS, WhatsApp, push and in-app, with drivers and placeholders, editable templates for 20+ events, and promo broadcasts.
- [x] **Support:** tickets (categories, priority, assignment, internal notes) and **live chat** (customer widget plus admin inbox). The WhatsApp, call and email buttons show only when the admin has filled in contact details, which start **blank** and are protected by OTP.
- [x] **Subscriptions priced by the admin:** a customer membership (StayShare Plus: discount and waived convenience fee) and partner plans (lower commission, featured listing, property limit).
- [x] **Dashboards and reports:** customer, owner, staff and admin dashboards; 22 admin reports and owner reports with filters and PDF/CSV/Excel export; audit logs.
- [x] **Content management:** cities, localities, facilities, property types, banners, FAQs and policy pages.
- [x] **Apps:** a responsive UI with mobile bottom navigation, a collapsible dashboard sidebar, skeletons, empty and error states, toasts, confirmation dialogs and breadcrumbs; the PWA (manifest and service worker); and the **Android app** (Capacitor).
- [x] **Deployment:** Docker, docker-compose, a health check, CI (typecheck, tests, build, E2E) and an Android APK workflow.

## 4. Pending external integrations (placeholders ready)

| Integration | Status | Configure |
|---|---|---|
| Payment gateway | **Mock** gateway works end to end; **Razorpay** adapter implemented; Cashfree/PayU/Stripe stubs | `PAYMENT_PROVIDER`, `RAZORPAY_*` — see docs/INTEGRATIONS.md |
| Google login | Implemented (OAuth code flow) | `GOOGLE_CLIENT_ID/SECRET` |
| SMS / OTP | Console driver; MSG91 placeholder (DLT templates needed) | `SMS_PROVIDER=msg91`, `MSG91_*` |
| Email | Console driver; Resend adapter | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` |
| WhatsApp | Console driver; Meta WhatsApp Cloud API adapter | `WHATSAPP_PROVIDER=meta`, `WHATSAPP_*` |
| Push (FCM) | Placeholder driver + `push_tokens` table | docs/INTEGRATIONS.md |
| Maps | Google Maps embed (no key) works; JS API/Mapbox keys optional | `NEXT_PUBLIC_MAPS_PROVIDER` |
| Cloud file storage | Local disk driver (mount a volume); S3/GCS adapter placeholder | `STORAGE_DRIVER`, `STORAGE_DIR` |
| Payout bank transfer | Manual UTR entry; RazorpayX/Cashfree Payouts to be wired | docs/INTEGRATIONS.md |

## 5. Demo login credentials — ⚠️ DEVELOPMENT ONLY

Created by `npm run db:seed`. **Delete these accounts or change the passwords before any production deployment.** The seed refuses to run when `NODE_ENV=production`.

| Role | Email | Password |
|---|---|---|
| Super administrator | admin@stayshare.demo | DemoAdmin@123 |
| Admin (ops) | ops@stayshare.demo | DemoAdmin@123 |
| Finance admin (custom role) | finance@stayshare.demo | DemoAdmin@123 |
| Property owner | owner@stayshare.demo | DemoOwner@123 |
| Owner with KYC pending (2 unpriced properties awaiting approval) | owner2@stayshare.demo | DemoOwner@123 |
| Property staff | staff@stayshare.demo | DemoStaff@123 |
| Customer | customer@stayshare.demo | DemoCustomer@123 |
| More customers | guest1…guest8@stayshare.demo | DemoCustomer@123 |

The demo data covers:
- 5 cities (Hyderabad, Bengaluru, Chennai, Pune, Vijayawada) and 12 properties (10 live, 2 pending approval).
- 35 rooms and 87 beds: private, 2/3/4/5/6-sharing, dorm and family rooms; AC and non-AC; male, female, mixed and family.
- Past, current, upcoming and pending bookings, plus reviews, payments, coupons (WELCOME10, MONTHLY1000, STUDENT15, HITECH200, FLASH30), subscription plans, tickets and notification templates.

## 6. Local run commands

```bash
# prerequisites: Node 20+ (22 recommended), PostgreSQL 14+
cp .env.example .env                # set DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY; OTP_DEV_MODE=true locally
npm install
npm run db:migrate                  # apply migrations
npm run db:seed                     # demo data (destructive!)
npm run dev                         # http://localhost:3000

npm run typecheck                   # TypeScript
npm test                            # vitest (creates/seeds stayshare_test DB — create it once: createdb stayshare_test)
npm run build && ./scripts/serve-local.sh      # production build
node scripts/e2e-smoke.mjs http://localhost:3000   # end-to-end API smoke test (on freshly seeded DB)

# Docker
docker compose up --build           # db + migrations + app on :3000
docker compose run --rm migrate npm run db:seed
```

For local testing, the mock payment gateway opens a "Test payment gateway" page. There you can choose **Pay** or **Simulate failure**, and the result is delivered as a signed webhook. When `OTP_DEV_MODE=true`, OTP codes are shown on screen.

## 7. Production deployment steps

Full guide: **docs/DEPLOYMENT.md** (Vercel, AWS, Google Cloud, Azure, Render, Railway). In short:
1. Provision managed PostgreSQL. Turn on automated daily backups and point-in-time recovery.
2. Set the environment variables from `.env.example`. Use strong random values for `JWT_SECRET` and `ENCRYPTION_KEY`, and keep a secure backup of `ENCRYPTION_KEY`. Also set `OTP_DEV_MODE=false`, `PAYMENT_PROVIDER=razorpay` with its keys, and `APP_URL`.
3. Build and deploy the Docker image (or `npm run build` + `node .next/standalone/server.js`), and mount persistent storage for `STORAGE_DIR`.
4. Run `npm run db:migrate` on each release. **Do not seed production.** Instead, create the super admin and remove the demo accounts.
5. Configure the gateway webhook `https://<domain>/api/webhooks/payments/razorpay` for the events `payment.captured`, `payment.failed` and `refund.processed`.
6. In Admin → Settings, enter your legal name, GSTIN, address and **support contact details**. This needs an OTP.
7. Point monitoring at `GET /api/health`.
8. Android: set `CAP_SERVER_URL` to your domain, then run `npx cap sync android` and build a signed AAB in Android Studio (see docs/ANDROID.md).

## 8. Security checklist

- [x] RBAC with permission checks inside **every** protected API, plus middleware route gating. Owners and staff are scoped to their own or assigned properties.
- [x] bcrypt password hashing (cost 12) and a strong password policy. Account lockout after 5 failures.
- [x] OTPs: hashed, 5-minute expiry, a 5-attempt limit and a 30-second resend throttle.
- [x] Sessions: short-lived JWT access tokens (15 minutes) and rotating refresh tokens (30 days) with theft detection. Cookies are httpOnly, SameSite=Lax and Secure in production. Sessions expire and can be revoked per device.
- [x] CSRF: an Origin check on state-changing APIs, plus SameSite cookies.
- [x] XSS: React escaping, no raw HTML rendering, and a CSP. Other headers: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy.
- [x] SQL injection: parameterised queries through Drizzle. All input is validated with zod on the server.
- [x] Uploads: magic-byte file-type sniffing, size limits and a purpose allow-list. Private files are served only through an authorisation check.
- [x] Payments: HMAC signature verification on webhooks with timing-safe comparison, idempotent event processing, amount verification, and server-side confirmation only.
- [x] AES-256-GCM encryption of ID numbers, bank account numbers and PAN. Masked display of IDs, bank accounts, phones and emails.
- [x] Audit logs for admin and owner actions. Price history for every price or fee change.
- [x] OTP step-up for sensitive settings and admin management.
- [x] Secrets live only in environment variables. Nothing secret is exposed to the frontend, and there are no live keys in the code.
- [x] Rate limiting on auth, OTP, uploads, chat and bookings. It is in-memory, so **use Redis when running more than one instance**.
- [ ] Before launch: a penetration test, DPDP Act privacy review, WAF/CDN, and Redis-backed rate limiting and settings cache.

## 9. Test results (latest run)

- **Unit and integration (vitest): 44/44 passing.**
  - Pricing: duration tiers, packages, per-bed and per-room pricing, extra guests, food and laundry, weekend and override rules, city scoping, promotions.
  - Discounts and tax: coupons, membership, GST slabs, long-stay exemption.
  - Money: refund tiers, non-refundable bookings, admin override, owner earnings (property- vs platform-funded discounts), partial retention.
  - **Concurrency:** 10 simultaneous bookings of one bed give exactly 1 success and 9 × 409. Entire-room vs bed conflicts are also covered.
  - Rules and security: gender rules, webhook confirmation and idempotency, forged signatures, amount mismatch, failed payment, cancellation and refund, unauthorised cancellation.
  - Stays and payouts: stay extension with payment; check-in (requires ID) → check-out with damages, deposit and earning; the payout lifecycle; first-booking coupon; unpriced rooms can't be booked.
- **E2E HTTP smoke test (`scripts/e2e-smoke.mjs`): 23/23 passing** against the production build.
  - Pages, auth and OTP; search → quote → book → mock webhook → confirmed; forged webhook; invoice PDF.
  - Cross-user isolation; a concurrent race; room vs bed conflict; cancel and refund; role isolation.
  - Admin settings with OTP step-up; admin price and approval of a pending property, which then appears in search.
  - Portal pages for each role, live chat round trip, report exports and logout.
- `next build` succeeds, and `tsc --noEmit` is clean.

## 10. Known limitations

- **Android APK not built here.** The Android project is generated, but the build environment had no Android SDK or Gradle access. The included GitHub Actions workflow (`android.yml`) builds the APK, or you can build it in Android Studio. The app loads the live site, so it needs a deployed URL.
- **Real gateway not live-tested.** Razorpay has only been exercised through code paths; it needs live keys. SMS, email, WhatsApp and push are console drivers until credentials are added.
- **Refunds of subscription payments** are manual (admin).
- **Payouts to bank accounts** are recorded manually with a UTR/reference. An automated payouts API still needs wiring.
- **Single-instance limits.** The rate limiter and settings cache are per-instance (in-memory); use Redis for horizontal scaling.
- **Price plan "effective from" dates** are recorded in history, but a saved plan applies immediately. Future-dated plans aren't scheduled yet.
- **Owner key-info edits** on an already-approved property go live straight away and are flagged in the audit log. New photos, rooms and facilities do go back to review.
- **Placeholder content:** GST rules are seeded from public guidance (22 Sep 2025 rates) — **verify with your CA**. Legal pages are placeholders and need legal review.
- **Demo photos** are Unsplash URLs with a local illustrated fallback. Replace them with real property photos.
