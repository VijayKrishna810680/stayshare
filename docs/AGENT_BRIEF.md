# StayShare — engineering brief (shared by all contributors)

Repo: /home/claude/stayshare  · Next.js 15 App Router + React 19 + TypeScript + Tailwind v4 · PostgreSQL via Drizzle ORM.
DB is running locally and seeded (`npm run db:seed` re-seeds; it is destructive). DATABASE_URL in .env.

## Golden rules
1. **Money is integer paise** everywhere (₹1 = 100). Forms take rupees → convert with `toPaise()` (src/lib/client-api.ts). Display with `formatINR()` (src/lib/money.ts) or `<Money paise>`.
2. **Prices are set ONLY by the StayShare admin team.** Owners never see/enter price fields unless setting `owner.allowPriceSuggestion` is true (default false). Customer-facing prices come only from admin-approved `price_plans` via the pricing engine.
3. **Authorization on every API.** Use `api()` wrapper from `src/lib/api.ts` + `requireUser()/requirePermission()/requireRole()` from `src/lib/auth/current.ts`. Pages use `pageUser({perm|role})` from `src/lib/auth/page.ts`. Owners may only touch their own properties (check `properties.ownerId === user.id`); staff only assigned properties (`staff_assignments`).
4. **Validate with zod** in APIs via `parseBody(req, schema)` / `parseQuery`. Throw `badRequest/notFound/forbidden/conflict` from `src/lib/errors.ts`. Responses are `{ data }` or `{ error: {code,message} }`; the client helper `apiFetch()` unwraps and throws `ApiClientError` (show `e.message` in a toast via `sonner`'s `toast.error`).
5. **Audit** important admin/owner actions with `audit()` from `src/lib/audit.ts`. Price changes also insert `price_history` rows.
6. **Do NOT edit** these shared files (report needed changes in your final message instead): `src/db/schema.ts`, `src/db/index.ts`, `src/services/{booking,availability,pricing,pricing-engine,stay,settlement,invoice,notifications,storage,subscriptions,livechat}.ts`, `src/services/payments/*`, `src/lib/*` (you MAY add new files in src/lib), `src/middleware.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/*` (you MAY add new components in your own folder), `package.json`. No `npm install` — all deps are installed (lucide-react, sonner, zod, react-hook-form, @hookform/resolvers, date-fns, clsx, qrcode, exceljs, pdf-lib).
7. **Do not run `next build` or `next dev`** (shared 2-CPU machine, other agents work in parallel). Verify with `npx tsc --noEmit -p .` (must pass for your files) and, for services/API logic, small `npx tsx --conditions=react-server <script>` checks against the DB if useful (never wipe the DB).
8. No fake buttons: every button must call a real API that changes the DB, or navigate.
9. Mobile-first, accessible: labels on inputs, keyboard focus, `aria-*`, contrast. Use existing UI kit: `@/components/ui` (Button, LinkButton, Input, Select, Textarea, Label, Field, Checkbox, Card/CardHeader/CardBody/StatCard, Badge/StatusBadge, EmptyState/ErrorState/Skeleton/CardGridSkeleton/TableSkeleton/Alert, Table/THead/TH/TBody/TR/TD/Pagination, Money/Breadcrumbs/PageHeader/DescList), `@/components/ui/dialog` (Dialog, ConfirmDialog — client), `@/components/ui/img` (Img with fallback — client). Dashboard frame: `@/components/layout/dashboard-shell` (DashboardShell with `nav` items using lucide icon names).
10. Next 15: route `params`/`searchParams` are Promises (`const { id } = await params`). With the `api()` wrapper, params are already awaited: `api<{id:string}>(async (req, { params }) => ...)`.
11. Server Components query the DB directly (`import { db } from "@/db"`, tables from `@/db/schema`, drizzle operators from `drizzle-orm`). Client Components call APIs with `apiFetch`. Add `export const dynamic = "force-dynamic"` on DB-backed pages.
12. Brand: StayShare, tagline "Flexible stays. Affordable sharing. Comfortable living." Colors `brand-*` (teal) and `accent-*` (amber) in Tailwind. Never use OYO names/branding.

## Key services (import & call; don't reimplement)
- Pricing: `buildQuote({roomId, unit:"BED"|"ROOM", bedIds, checkIn, checkOut, adults, children, services:["FOOD","LAUNDRY"], couponCode, customerId})` → `{quote}` with `quote.lines` breakdown, `totalAmount`. For estimates of BED bookings pass placeholder bed ids array of length N (e.g. `Array(n).fill("00000000-0000-0000-0000-000000000000")`). `refreshStartingPrice(propertyId)` after price changes. `getActivePlan(roomId)`.
- Availability: `roomsAvailability(roomIds, checkIn, checkOut)` → Map(roomId → {totalBeds, availableBeds, availableBedIds, entireRoomAvailable}); `createBlock({...})`, `releaseBlock(id)`, `sweepExpiredHolds()`.
- Booking: `createBooking(customer, input)` → `{bookingId, status, checkout}` where `checkout` is `{kind:"redirect", url}` (mock gateway → navigate to url) or `{kind:"razorpay", ...}` (open Razorpay Checkout then POST /api/payments/razorpay/verify). `retryBookingPayment`, `cancellationPreview(booking)`, `cancelBooking(id, {id, role}, reason, {overrideRefundBps})`, `requestRefund`, `decideRefund`, `processRefund`, `markNoShow`, `createPaymentOrder`.
- Stay: `checkIn(bookingId, staffId, {...})`, `checkoutPreview(booking, {...})`, `checkOut(...)`, `markBedClean(bedId)`, `setRoomCleaning(roomId, status)`, `requestModification(bookingId, actor, req)`, `decideModification(modId, actorId, approve, note)`.
- Settlement: `ownerBalance(ownerId)`, `createPayout(ownerId, {id,isOwner}, note)`, `transitionPayout(id, to, actorId, {note, reference, deductions})`, `disputePayout`, `listOwnerPayouts`, `refreshEligibility()`, `commissionBpsFor()`.
- Invoice: `latestInvoice(bookingId)`, `renderInvoicePdf(inv)`, `createInvoice(bookingId, kind)`.
- Notifications: `notify(event, {userId, vars, data})` (templates in DB table notification_templates).
- Storage: upload via `POST /api/uploads` (multipart `file`, `purpose` = PROPERTY_IMAGE|ROOM_IMAGE|REVIEW_IMAGE|AVATAR|ID_PROOF|KYC|PROPERTY_DOC|TICKET_ATTACHMENT) → `{id, url}`; client helper `uploadFile(file, purpose)`. Files served at `/api/files/{id}` with authorization.
- Subscriptions: `listPlans(audience)`, `getActiveSubscription(userId, audience)`, `startSubscriptionPurchase(user, planId)` (API exists: GET /api/subscriptions/plans?audience=, GET/POST /api/subscriptions, POST /api/subscriptions/[id]/cancel), `grantSubscription`, `ownerPropertyLimit(ownerId)`.
- Live chat: APIs exist — customer: GET/POST /api/chat, POST /api/chat/messages; admin: GET /api/admin/chat, GET/POST/PATCH /api/admin/chat/[id].
- Support contacts (blank until admin sets them): `getSupportContacts()` (src/lib/contact.ts), public API GET /api/public/contact.
- Settings: `getSettings([...keys])`, `SETTING_DEFAULTS`, `STEP_UP_SETTING_PREFIXES` (src/lib/settings.ts). Step-up OTP: GET/POST /api/auth/step-up, `requireStepUp(user)` (src/lib/auth/step-up.ts).
- Exports: `exportResponse(name, columns, rows, "csv"|"xlsx"|"pdf")` (src/lib/export.ts).
- Counters: `nextTicketNumber()`, `nextPayoutNumber()` (src/lib/counters.ts).
- Dates: `todayIST()`, `addDays`, `nightsBetween`, `listNights`, `prettyDate`, `prettyDateTime` (src/lib/dates.ts). Stay dates are 'YYYY-MM-DD' strings.
- Mock payment page must exist at `/pay/mock/[orderId]` (customer agent builds it): shows amount & buttons that POST /api/payments/mock/simulate {orderId, outcome:"success"|"failure", method} then route to `/booking/{bookingId}/status` (or `/account/subscriptions` when `subscriptionId` returned) which polls booking status until CONFIRMED.

## Existing auth APIs
POST /api/auth/register {name,email?,phone?,password,accountType:"CUSTOMER"|"OWNER",businessName?} · POST /api/auth/login {identifier,password} · POST /api/auth/otp/request {target} → {devCode (dev only)} · POST /api/auth/otp/verify {target, code, name?} (422 NAME_REQUIRED when new user) · POST /api/auth/logout · POST /api/auth/logout-all · POST|GET /api/auth/refresh · GET /api/auth/me · POST /api/auth/forgot {identifier} → {devLink} · POST /api/auth/reset {token,password} · GET/DELETE /api/auth/sessions · GET /api/auth/google?next= (redirects; shows error when not configured).

## Demo accounts (dev only)
admin@stayshare.demo / DemoAdmin@123 (super admin) · ops@stayshare.demo / DemoAdmin@123 · finance@stayshare.demo (custom FINANCE_ADMIN role) · owner@stayshare.demo / DemoOwner@123 · owner2@stayshare.demo (KYC pending, 2 pending properties with NO prices) · staff@stayshare.demo / DemoStaff@123 · customer@stayshare.demo / DemoCustomer@123
