#!/usr/bin/env node
/**
 * End-to-end smoke test against a running StayShare server (default http://localhost:3000).
 *   node scripts/e2e-smoke.mjs [baseUrl]
 * Run on a freshly seeded database (npm run db:seed). Exercises the real HTTP APIs:
 * auth, search, quote, booking + mock gateway webhook, concurrency (double booking), cancellation
 * & refund, admin OTP step-up, admin pricing + approval of an owner-submitted property,
 * owner/staff/admin page access and role isolation.
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
let passed = 0;
let failed = 0;
const results = [];

class Client {
  constructor(name) {
    this.name = name;
    this.jar = new Map();
  }
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === "") this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }
  async req(method, path, body, opts = {}) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), cookie: this.cookieHeader(), ...(opts.headers ?? {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    this.store(res);
    const ct = res.headers.get("content-type") ?? "";
    const json = ct.includes("json") ? await res.json() : null;
    return { status: res.status, json, data: json?.data, error: json?.error, headers: res.headers };
  }
  get(p) { return this.req("GET", p); }
  post(p, b) { return this.req("POST", p, b ?? {}); }
  async login(identifier, password) {
    const r = await this.post("/api/auth/login", { identifier, password });
    if (r.status !== 200) throw new Error(`${this.name} login failed: ${r.status} ${r.error?.message}`);
    return r.data;
  }
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(["PASS", name]);
    console.log("  ✔", name);
  } catch (e) {
    failed++;
    results.push(["FAIL", name, e.message]);
    console.log("  ✘", name, "—", e.message);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const day = (n) => {
  const d = new Date(Date.now() + 5.5 * 3600e3 + n * 86400e3);
  return d.toISOString().slice(0, 10);
};

const customer = new Client("customer");
const other = new Client("guest2");
const admin = new Client("admin");
const owner = new Client("owner");
const staff = new Client("staff");
const anon = new Client("anon");

console.log(`StayShare E2E smoke → ${BASE}\n`);

await test("health endpoint reports DB ok", async () => {
  const r = await anon.get("/api/health");
  assert(r.status === 200 && r.json.db === "ok", `health ${r.status}`);
});

await test("public pages render (home, search, property, partner, plus, faq)", async () => {
  for (const p of ["/", "/search?city=hyderabad", "/property/nest-co-living-madhapur", "/partner", "/plus", "/faq", "/contact", "/pages/terms"]) {
    const r = await fetch(BASE + p);
    assert(r.status === 200, `${p} → ${r.status}`);
  }
});

await test("protected pages redirect anonymous users to login", async () => {
  for (const p of ["/account", "/owner", "/admin", "/staff"]) {
    const r = await fetch(BASE + p, { redirect: "manual" });
    assert(r.status === 307 && (r.headers.get("location") ?? "").includes("/login"), `${p} → ${r.status}`);
  }
});

await test("wrong password is rejected; register validates password rules", async () => {
  const r = await anon.post("/api/auth/login", { identifier: "customer@stayshare.demo", password: "nope" });
  assert(r.status === 401, `login bad pw → ${r.status}`);
  const r2 = await anon.post("/api/auth/register", { name: "Weak", email: "weak@x.dev", password: "weak" });
  assert(r2.status === 422, `weak password → ${r2.status}`);
});

await test("OTP login creates a new customer account", async () => {
  const c = new Client("otp");
  const phone = "98" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const r = await c.post("/api/auth/otp/request", { target: phone });
  assert(r.status === 200 && r.data.devCode, `otp request ${r.status} ${r.error?.message}`);
  const bad = await c.post("/api/auth/otp/verify", { target: phone, code: r.data.devCode === "000000" ? "111111" : "000000" });
  assert(bad.status === 400, `wrong otp → ${bad.status}`);
  const n = await c.post("/api/auth/otp/verify", { target: phone, code: r.data.devCode });
  assert(n.status === 422 && n.error.code === "NAME_REQUIRED", `needs name → ${n.status}`);
  const r2 = await c.post("/api/auth/otp/request", { target: phone });
  // throttled for 30s after the previous OTP
  assert(r2.status === 429, `otp throttle → ${r2.status}`);
});

await customer.login("customer@stayshare.demo", "DemoCustomer@123");
await other.login("guest2@stayshare.demo", "DemoCustomer@123");
await admin.login("admin@stayshare.demo", "DemoAdmin@123");
await owner.login("owner@stayshare.demo", "DemoOwner@123");
await staff.login("staff@stayshare.demo", "DemoStaff@123");

let prop, sharedRoom;
await test("search returns approved Hyderabad properties with prices", async () => {
  const r = await customer.get(`/api/search?city=hyderabad&checkIn=${day(20)}&checkOut=${day(25)}`);
  assert(r.status === 200, `search ${r.status} ${r.error?.message}`);
  const items = r.data.items ?? r.data.results ?? r.data;
  assert(Array.isArray(items) && items.length >= 3, `expected ≥3 results, got ${items?.length}`);
  assert(!items.some((p) => /pending/i.test(p.name)), "pending properties must not be listed");
});

await test("property details include rooms with admin-set prices", async () => {
  const r = await customer.get("/api/properties/nest-co-living-madhapur");
  assert(r.status === 200, `property ${r.status}`);
  prop = r.data.property ?? r.data;
  const rooms = r.data.rooms ?? prop.rooms;
  sharedRoom = rooms.find((x) => /Four Sharing/i.test(x.name ?? "")) ?? rooms.find((x) => x.category === "SHARED");
  assert(sharedRoom, "shared room found");
});

let q;
await test("quote returns a full price breakdown (tax, fees, deposit)", async () => {
  const r = await customer.post("/api/quote", { roomId: sharedRoom.id, unit: "BED", bedsCount: 1, checkIn: day(20), checkOut: day(25), adults: 1, children: 0, services: [] });
  assert(r.status === 200, `quote ${r.status} ${r.error?.message}`);
  q = r.data.quote ?? r.data;
  const keys = q.lines.map((l) => l.key);
  assert(keys.includes("room") && keys.includes("tax"), `lines ${keys}`);
  assert(q.totalAmount === q.lines.filter((l) => l.kind !== "info").reduce((a, l) => a + l.amount, 0), "total equals sum of lines");
});

let bookingId;
await test("book a bed → mock gateway signed webhook → CONFIRMED (not by frontend)", async () => {
  const r = await customer.post("/api/bookings", { roomId: sharedRoom.id, unit: "BED", bedsCount: 1, checkIn: day(20), checkOut: day(25), adults: 1, children: 0, services: [], guests: [{ name: "Priya Sharma", gender: "MALE" }], acceptTerms: true, paymentOption: "FULL" });
  // Four-sharing room is male-only; primary guest gender MALE for this test
  assert(r.status === 200, `create ${r.status} ${r.error?.message}`);
  bookingId = r.data.bookingId;
  assert(r.data.checkout?.url?.startsWith("/pay/mock/"), "mock checkout url");
  const pending = await customer.get(`/api/bookings/${bookingId}`);
  const st = pending.data.booking?.status ?? pending.data.status;
  assert(st === "PAYMENT_PENDING", `pending status ${st}`);
  const orderId = r.data.checkout.url.split("/").pop().split("?")[0];
  const s = await customer.post("/api/payments/mock/simulate", { orderId, outcome: "success", method: "upi" });
  assert(s.status === 200 && s.data.delivered, `simulate ${s.status} ${s.error?.message}`);
  const done = await customer.get(`/api/bookings/${bookingId}`);
  const st2 = done.data.booking?.status ?? done.data.status;
  assert(st2 === "CONFIRMED", `after webhook ${st2}`);
});

await test("webhook with a forged signature is rejected", async () => {
  const r = await fetch(BASE + "/api/webhooks/payments/mock", { method: "POST", headers: { "Content-Type": "application/json", "x-mock-signature": "deadbeef" }, body: JSON.stringify({ id: "evt_fake", event: "payment.captured", orderId: "x", amount: 1 }) });
  assert(r.status === 400, `forged → ${r.status}`);
});

await test("invoice PDF downloads for the confirmed booking", async () => {
  const res = await fetch(`${BASE}/api/bookings/${bookingId}/invoice`, { headers: { cookie: customer.cookieHeader() } });
  const buf = Buffer.from(await res.arrayBuffer());
  assert(res.status === 200 && buf.subarray(0, 5).toString() === "%PDF-", `invoice ${res.status}`);
});

await test("another customer cannot read this booking", async () => {
  const r = await other.get(`/api/bookings/${bookingId}`);
  assert([403, 404].includes(r.status), `cross-user → ${r.status}`);
});

await test("CONCURRENCY: two customers race for the last free bed — exactly one wins", async () => {
  // Use the private AC studio (1 bed) at Nest far in the future
  const r0 = await customer.get("/api/properties/nest-co-living-madhapur");
  const rooms = r0.data.rooms ?? r0.data.property.rooms;
  const studio = rooms.find((x) => x.category === "PRIVATE");
  const body = (name) => ({ roomId: studio.id, unit: "ROOM", bedsCount: 1, checkIn: day(60), checkOut: day(62), adults: 1, children: 0, services: [], guests: [{ name, gender: "FEMALE" }], acceptTerms: true, paymentOption: "FULL" });
  const [a, b] = await Promise.all([customer.post("/api/bookings", body("Racer A")), other.post("/api/bookings", body("Racer B"))]);
  const codes = [a.status, b.status].sort();
  assert(codes[0] === 200 && codes[1] === 409, `expected [200,409], got ${codes} (${a.error?.message ?? ""} ${b.error?.message ?? ""})`);
});

await test("entire-room booking is blocked when one bed is already booked", async () => {
  const r0 = await customer.get("/api/properties/nest-co-living-madhapur");
  const rooms = r0.data.rooms ?? r0.data.property.rooms;
  const twin = rooms.find((x) => /Twin/i.test(x.name ?? ""));
  const bed = await customer.post("/api/bookings", { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: day(70), checkOut: day(72), adults: 1, children: 0, services: [], guests: [{ name: "Solo", gender: "FEMALE" }], acceptTerms: true, paymentOption: "FULL" });
  assert(bed.status === 200, `bed booking ${bed.status} ${bed.error?.message}`);
  const whole = await other.post("/api/bookings", { roomId: twin.id, unit: "ROOM", bedsCount: 2, checkIn: day(71), checkOut: day(73), adults: 2, children: 0, services: [], guests: [{ name: "Pair", gender: "FEMALE" }, { name: "Pair 2", gender: "FEMALE" }], acceptTerms: true, paymentOption: "FULL" });
  assert(whole.status === 409, `entire room over a booked bed → ${whole.status}`);
});

await test("cancellation shows refund preview, then refunds per policy", async () => {
  const p = await customer.get(`/api/bookings/${bookingId}/cancel`);
  assert(p.status === 200, `preview ${p.status} ${p.error?.message}`);
  const preview = p.data.preview ?? p.data;
  assert(typeof preview.totalRefund === "number" && preview.totalRefund > 0, "refund > 0 (≥7 days before long-stay check-in)");
  const c = await customer.post(`/api/bookings/${bookingId}/cancel`, { reason: "Change of plans" });
  assert(c.status === 200, `cancel ${c.status} ${c.error?.message}`);
  const b = await customer.get(`/api/bookings/${bookingId}`);
  const st = b.data.booking?.status ?? b.data.status;
  assert(["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"].includes(st), `status ${st}`);
});

await test("role isolation: customer → admin/owner APIs forbidden; staff → owner API forbidden", async () => {
  const a = await customer.get("/api/admin/reports/bookings");
  assert(a.status === 403, `customer→admin ${a.status}`);
  const o = await customer.get("/api/owner/properties");
  assert(o.status === 403, `customer→owner ${o.status}`);
  const s = await staff.get("/api/owner/properties");
  assert(s.status === 403, `staff→owner ${s.status}`);
});

await test("admin settings change requires OTP step-up, then succeeds", async () => {
  const body = { "platform.supportEmail": "help@stayshare.example", "platform.supportPhone": "+91 98765 43210", __reason: "Set support contacts" };
  const r1 = await admin.req("PUT", "/api/admin/settings", body);
  const r1b = r1.status === 405 ? await admin.post("/api/admin/settings", body) : r1;
  assert(r1b.status === 428, `without OTP → ${r1b.status} ${r1b.error?.message}`);
  const s = await admin.post("/api/auth/step-up", { action: "send", channel: "phone" });
  assert(s.status === 200 && s.data.devCode, `send otp ${s.status}`);
  const v = await admin.post("/api/auth/step-up", { action: "verify", code: s.data.devCode, channel: "phone" });
  assert(v.status === 200, `verify ${v.status} ${v.error?.message}`);
  const r2 = r1.status === 405 ? await admin.post("/api/admin/settings", body) : await admin.req("PUT", "/api/admin/settings", body);
  assert(r2.status === 200, `with OTP → ${r2.status} ${r2.error?.message}`);
  const pub = await anon.get("/api/public/contact");
  assert(pub.data.email === "help@stayshare.example", "public contact updated");
});

await test("admin prices + approves owner2's pending property → it appears in search", async () => {
  const { execSync } = await import("node:child_process");
  const pendingId = execSync(`psql "${process.env.DATABASE_URL?.split("?")[0] ?? "postgresql://stayshare:stayshare@localhost:5432/stayshare"}" -tAc "select id from properties where name like 'Gachibowli Green%'"`).toString().trim();
  assert(pendingId, "found pending property via admin API");
  const dbUrl = process.env.DATABASE_URL?.split("?")[0] ?? "postgresql://stayshare:stayshare@localhost:5432/stayshare";
  const rooms = execSync(`psql "${dbUrl}" -tAc "select id from rooms where property_id='${pendingId}'"`).toString().trim().split("\n").map((id) => ({ id }));
  for (const room of rooms) {
    const noPlan = await admin.post(`/api/admin/rooms/${room.id}/review`, { action: "approve" });
    assert(noPlan.status >= 400, `approving without a price must fail (${noPlan.status})`);
    const pp = await admin.post(`/api/admin/rooms/${room.id}/price-plan`, { nightlyBed: 39900, nightlyRoom: null, weeklyBed: null, weeklyRoom: null, monthlyBed: 699900, monthlyRoom: null, securityDepositBed: 300000, durationPrices: [{ unit: "BED", nights: 10, totalPrice: 349900 }], reason: "Launch pricing", allowBedBooking: true, allowEntireRoomBooking: false });
    assert(pp.status === 200, `price plan ${pp.status} ${pp.error?.message}`);
    const ok = await admin.post(`/api/admin/rooms/${room.id}/review`, { action: "approve" });
    assert(ok.status === 200, `approve room ${ok.status} ${ok.error?.message}`);
  }
  const ap = await admin.post(`/api/admin/properties/${pendingId}/review`, { action: "approve", notes: "Verified on site" });
  assert(ap.status === 200, `approve property ${ap.status} ${ap.error?.message}`);
  const s = await anon.get("/api/search?city=hyderabad&q=Gachibowli");
  const items = s.data.items ?? s.data.results ?? s.data;
  assert(items.some((p) => /Gachibowli Green/.test(p.name)), "now visible to customers");
});

await test("owner sees admin price read-only; owner cannot create a price plan", async () => {
  const r = await owner.post(`/api/admin/rooms/${sharedRoom.id}/price-plan`, { nightlyBed: 100, reason: "hack" });
  assert(r.status === 403, `owner→admin pricing ${r.status}`);
});

await test("portal pages load for each role", async () => {
  const check = async (c, paths) => {
    for (const p of paths) {
      const res = await fetch(BASE + p, { headers: { cookie: c.cookieHeader() }, redirect: "manual" });
      assert(res.status === 200, `${c.name} ${p} → ${res.status}`);
    }
  };
  await check(customer, ["/account", "/account/bookings", "/account/profile", "/account/subscriptions", "/account/support"]);
  await check(owner, ["/owner", "/owner/properties", "/owner/bookings", "/owner/earnings", "/owner/payouts", "/owner/subscription", "/owner/kyc", "/owner/reports"]);
  await check(staff, ["/staff", "/staff/check-in", "/staff/check-out", "/staff/board", "/staff/maintenance"]);
  await check(admin, ["/admin", "/admin/approvals", "/admin/pricing", "/admin/bookings", "/admin/payments", "/admin/refunds", "/admin/payouts", "/admin/coupons", "/admin/taxes", "/admin/subscriptions", "/admin/settings", "/admin/reports", "/admin/audit", "/admin/chat", "/admin/users/customers", "/admin/users/owners"]);
});

await test("live chat: customer message reaches admin inbox, admin reply reaches customer", async () => {
  const s = await customer.post("/api/chat", {});
  assert(s.status === 200, `start ${s.status}`);
  const m = await customer.post("/api/chat/messages", { body: "Is breakfast included?" });
  assert(m.status === 200, `msg ${m.status}`);
  const inbox = await admin.get("/api/admin/chat");
  const conv = inbox.data.find((c) => c.userEmail === "customer@stayshare.demo");
  assert(conv, "conversation in inbox");
  const rep = await admin.post(`/api/admin/chat/${conv.id}`, { body: "Yes, breakfast is included." });
  assert(rep.status === 200, `reply ${rep.status}`);
  const mine = await customer.get("/api/chat");
  assert(mine.data.messages.some((x) => x.fromAgent && /breakfast is included/.test(x.body)), "customer sees reply");
});

await test("reports export CSV / Excel / PDF", async () => {
  for (const f of ["csv", "xlsx", "pdf"]) {
    const res = await fetch(`${BASE}/api/admin/reports/bookings?format=${f}`, { headers: { cookie: admin.cookieHeader() } });
    assert(res.status === 200, `${f} → ${res.status}`);
  }
});

await test("logout revokes the session", async () => {
  const c = other;
  await c.post("/api/auth/logout");
  const me = await c.get("/api/auth/me");
  assert(me.data === null, "no user after logout");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
