/**
 * StayShare demo seed. Run: npm run db:seed   (DESTRUCTIVE — wipes all data first)
 *
 * ⚠️  The demo credentials created here are for DEVELOPMENT ONLY.
 *     Delete these accounts / change passwords before any production deployment.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import * as t from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { encrypt } from "@/lib/crypto";
import { addDays, listNights, todayIST } from "@/lib/dates";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/rbac";
import { rupees } from "@/lib/money";
import { refreshStartingPrice } from "@/services/pricing";
import { createBooking } from "@/services/booking";
import { capturePayment } from "@/services/booking";
import { checkIn } from "@/services/stay";
import { upsertEarning } from "@/services/settlement";
import { createInvoice } from "@/services/invoice";
import { nextBookingNumber, nextTicketNumber } from "@/lib/counters";

const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=70&auto=format&fit=crop`;
const EXTERIORS = ["1545324418-cc1a3fa10c00", "1512917774080-9991f1c4c750", "1580587771525-78b9dba3b914", "1600585154340-be6161a56a0c", "1564013799919-ab600027ffc6", "1551882547-ff40c63fe5fa", "1566073771259-6a8506099945", "1520250497591-112f2f40a3f4"].map(U);
const INTERIORS = ["1522708323590-d24dbb6b0267", "1560448204-e02f11c3d0e2", "1493809842364-78817add7ffb", "1554995207-c18c203602cb", "1586023492125-27b2c045efd7", "1484154218962-a197022b5858"].map(U);
const ROOMS_PRIVATE = ["1505693416388-ac5ce068fe85", "1566665797739-1674de7a421a", "1590490360182-c33d57733427", "1611892440504-42a792e24d32", "1582719478250-c89cae4dc85b", "1631049307264-da0ec9d70304", "1595576508898-0ad5c879a061", "1540518614846-7eded433c457"].map(U);
const ROOMS_SHARED = ["1555854877-bab0e564b8d5", "1596394516093-501ba68a0ba6", "1567767292278-a4f21aa2d36e", "1598928506311-c55ded91a20c", "1616594039964-ae9021a400a0"].map(U);
const pick = <T,>(a: T[], i: number) => a[i % a.length]!;

async function wipe() {
  const tables = await db.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '__drizzle%'`);
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error("Refusing to seed a production database. Set ALLOW_PROD_SEED=true if you really mean it.");
  }
  console.log("• wiping data");
  await wipe();

  // ── roles & permissions ──
  console.log("• roles & permissions");
  const permRows = await db.insert(t.permissions).values(Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description, module: key.split(".")[0]! }))).returning();
  const permId = Object.fromEntries(permRows.map((p) => [p.key, p.id]));
  const roleDefs = [
    { key: "SUPER_ADMIN", name: "Super administrator" },
    { key: "ADMIN", name: "Administrator" },
    { key: "OWNER", name: "Property partner" },
    { key: "STAFF", name: "Property staff" },
    { key: "CUSTOMER", name: "Customer" },
  ];
  const roleRows = await db.insert(t.roles).values(roleDefs.map((r) => ({ ...r, isSystem: true }))).returning();
  const roleId = Object.fromEntries(roleRows.map((r) => [r.key, r.id]));
  for (const [rk, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (perms.length) await db.insert(t.rolePermissions).values(perms.map((p) => ({ roleId: roleId[rk]!, permissionId: permId[p]! })));
  }
  // a custom limited admin role example
  const [finRole] = await db.insert(t.roles).values({ key: "FINANCE_ADMIN", name: "Finance admin", description: "Payments, refunds and payouts only" }).returning();
  await db.insert(t.rolePermissions).values(["admin.access", "bookings.view", "payments.view", "refunds.approve", "payouts.manage", "reports.view", "reports.financial"].map((p) => ({ roleId: finRole!.id, permissionId: permId[p]! })));

  // ── users ──
  console.log("• users");
  const mkUser = async (o: { name: string; email: string; phone: string; password: string; roles: string[]; dev?: boolean }) => {
    const [u] = await db
      .insert(t.users)
      .values({ name: o.name, email: o.email, phone: o.phone, passwordHash: await hashPassword(o.password), emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), isDevAccount: o.dev ?? true })
      .returning();
    await db.insert(t.userRoles).values(o.roles.map((r) => ({ userId: u!.id, roleId: roleId[r]! })));
    return u!;
  };
  const admin = await mkUser({ name: "Asha Rao (Super Admin)", email: "admin@stayshare.demo", phone: "+919000000001", password: "DemoAdmin@123", roles: ["SUPER_ADMIN"] });
  const ops = await mkUser({ name: "Rahul Verma (Ops Admin)", email: "ops@stayshare.demo", phone: "+919000000002", password: "DemoAdmin@123", roles: ["ADMIN"] });
  const fin = await mkUser({ name: "Meera Iyer (Finance)", email: "finance@stayshare.demo", phone: "+919000000003", password: "DemoAdmin@123", roles: ["CUSTOMER"] });
  await db.insert(t.userRoles).values({ userId: fin.id, roleId: finRole!.id });
  const owner = await mkUser({ name: "Srinivas Reddy", email: "owner@stayshare.demo", phone: "+919000000010", password: "DemoOwner@123", roles: ["OWNER", "CUSTOMER"] });
  const owner2 = await mkUser({ name: "Kavitha Nair", email: "owner2@stayshare.demo", phone: "+919000000011", password: "DemoOwner@123", roles: ["OWNER", "CUSTOMER"] });
  const staff = await mkUser({ name: "Ravi Kumar (Front desk)", email: "staff@stayshare.demo", phone: "+919000000020", password: "DemoStaff@123", roles: ["STAFF"] });
  const customer = await mkUser({ name: "Priya Sharma", email: "customer@stayshare.demo", phone: "+919000000100", password: "DemoCustomer@123", roles: ["CUSTOMER"] });
  const others = [];
  const names = ["Arjun Mehta", "Sneha Patil", "Karthik Subramanian", "Ananya Das", "Vikram Singh", "Fatima Khan", "Rohan Joshi", "Divya Menon"];
  for (let i = 0; i < names.length; i++) {
    others.push(await mkUser({ name: names[i]!, email: `guest${i + 1}@stayshare.demo`, phone: `+91900000${String(200 + i).padStart(4, "0")}`, password: "DemoCustomer@123", roles: ["CUSTOMER"] }));
  }
  const allCustomers = [customer, ...others];
  await db.insert(t.customerProfiles).values(
    [customer, ...others, owner, owner2, fin].map((u, i) => ({ userId: u.id, gender: (i % 2 === 0 ? "FEMALE" : "MALE") as "FEMALE" | "MALE", occupation: i % 3 === 0 ? "Working professional" : i % 3 === 1 ? "Student" : "Traveller", city: "Hyderabad" })),
  );
  await db.update(t.customerProfiles).set({ gender: "FEMALE", emergencyName: "Rakesh Sharma", emergencyPhone: "+919812345678", address: "Flat 402, Lake View Apartments, Madhapur, Hyderabad" }).where(eq(t.customerProfiles.userId, customer.id));
  await db.insert(t.ownerProfiles).values([
    { userId: owner.id, businessName: "Reddy Hospitality LLP", businessType: "Partnership", gstin: "36ABCDE1234F1Z5", panEnc: encrypt("ABCDE1234F"), panLast4: "234F", address: "Plot 12, Jubilee Hills, Hyderabad", kycStatus: "APPROVED", kycReviewedBy: admin.id, kycReviewedAt: new Date(), bankAccountName: "Reddy Hospitality LLP", bankAccountEnc: encrypt("50100234567890"), bankAccountLast4: "7890", bankIfsc: "HDFC0001234", bankName: "HDFC Bank", upiId: "reddyhospitality@hdfcbank", bankVerified: true, bankVerifiedBy: admin.id },
    { userId: owner2.id, businessName: "Nair Co-Living", businessType: "Proprietorship", kycStatus: "PENDING", address: "HSR Layout, Bengaluru" },
  ]);
  await db.insert(t.staffProfiles).values({ userId: staff.id, employerId: owner.id, designation: "Front desk manager" });
  // ID document for demo customer (number encrypted, only last 4 visible)
  await db.insert(t.identityDocuments).values({ userId: customer.id, docType: "AADHAAR", numberEnc: encrypt("123412341234"), numberLast4: "1234", status: "APPROVED", verifiedBy: admin.id, verifiedAt: new Date() });
  await db.insert(t.identityDocuments).values(others.map((o, i) => ({ userId: o.id, docType: i % 2 ? "DRIVING_LICENSE" : "AADHAAR", numberEnc: encrypt(`98765432${String(1000 + i)}`), numberLast4: String(1000 + i), status: "APPROVED" as const })));
  await db.insert(t.savedGuests).values([
    { userId: customer.id, name: "Rakesh Sharma", phone: "+919812345678", gender: "MALE", age: 34, relation: "Spouse" },
    { userId: customer.id, name: "Anika Sharma", gender: "FEMALE", age: 6, relation: "Daughter" },
  ]);

  // ── catalogue ──
  console.log("• cities, localities, catalogue");
  const cityDefs = [
    { name: "Hyderabad", slug: "hyderabad", code: "HYD", state: "Telangana", lat: 17.385, lng: 78.4867, loc: ["Madhapur", "Gachibowli", "Kukatpally", "Ameerpet", "Hitech City"] },
    { name: "Bengaluru", slug: "bengaluru", code: "BLR", state: "Karnataka", lat: 12.9716, lng: 77.5946, loc: ["Koramangala", "HSR Layout", "Whitefield", "Electronic City", "Indiranagar"] },
    { name: "Chennai", slug: "chennai", code: "MAA", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707, loc: ["T. Nagar", "OMR", "Velachery", "Anna Nagar"] },
    { name: "Pune", slug: "pune", code: "PNQ", state: "Maharashtra", lat: 18.5204, lng: 73.8567, loc: ["Hinjewadi", "Kharadi", "Viman Nagar", "Kothrud"] },
    { name: "Vijayawada", slug: "vijayawada", code: "VJA", state: "Andhra Pradesh", lat: 16.5062, lng: 80.648, loc: ["Benz Circle", "Labbipet", "Governorpet", "Moghalrajpuram"] },
  ];
  const city: Record<string, typeof t.cities.$inferSelect> = {};
  const loc: Record<string, typeof t.localities.$inferSelect> = {};
  for (const c of cityDefs) {
    const [row] = await db.insert(t.cities).values({ name: c.name, slug: c.slug, code: c.code, state: c.state, latitude: c.lat, longitude: c.lng, isPopular: true, imageUrl: null }).returning();
    city[c.slug] = row!;
    for (const l of c.loc) {
      const [lr] = await db.insert(t.localities).values({ cityId: row!.id, name: l, slug: l.toLowerCase().replace(/[^a-z0-9]+/g, "-") }).returning();
      loc[`${c.slug}:${l}`] = lr!;
    }
  }
  const ptypes = [
    ["HOTEL", "Hotel"], ["HOSTEL", "Hostel"], ["PG", "Paying guest (PG)"], ["COLIVING", "Co-living"], ["SERVICE_APARTMENT", "Service apartment"], ["GUEST_HOUSE", "Guest house"], ["DORMITORY", "Dormitory"], ["FAMILY_LODGE", "Family lodge"], ["WORKING_MENS_HOSTEL", "Working men's hostel"], ["WORKING_WOMENS_HOSTEL", "Working women's hostel"], ["STUDENT_HOSTEL", "Student hostel"],
  ];
  const ptRows = await db.insert(t.propertyTypes).values(ptypes.map(([key, name], i) => ({ key: key!, name: name!, sortOrder: i }))).returning();
  const pt = Object.fromEntries(ptRows.map((r) => [r.key, r.id]));
  const facs: [string, string, string, string][] = [
    ["AC", "Air conditioning", "AirVent", "ROOM"], ["WIFI", "Wi-Fi", "Wifi", "GENERAL"], ["TV", "Television", "Tv", "ROOM"], ["HOT_WATER", "Hot water", "ShowerHead", "ROOM"], ["LAUNDRY", "Laundry", "WashingMachine", "GENERAL"], ["FOOD", "Food / meals", "UtensilsCrossed", "FOOD"], ["KITCHEN", "Kitchen access", "CookingPot", "GENERAL"], ["PARKING", "Parking", "ParkingCircle", "GENERAL"], ["POWER_BACKUP", "Power backup", "BatteryCharging", "GENERAL"], ["HOUSEKEEPING", "Housekeeping", "Sparkles", "GENERAL"], ["SECURITY", "24×7 security", "ShieldCheck", "SAFETY"], ["CCTV", "CCTV", "Cctv", "SAFETY"], ["LOCKER", "Personal locker", "Lock", "ROOM"], ["STUDY_TABLE", "Study table", "BookOpen", "ROOM"], ["WARDROBE", "Wardrobe", "Shirt", "ROOM"], ["DRINKING_WATER", "RO drinking water", "GlassWater", "GENERAL"], ["LIFT", "Lift", "ArrowUpDown", "GENERAL"], ["GYM", "Gym", "Dumbbell", "GENERAL"], ["ATTACHED_BATH", "Attached bathroom", "Bath", "ROOM"], ["FRIDGE", "Refrigerator", "Refrigerator", "ROOM"], ["BALCONY", "Balcony", "Sun", "ROOM"], ["FIRST_AID", "First aid", "BriefcaseMedical", "SAFETY"], ["FIRE_SAFETY", "Fire extinguisher", "FireExtinguisher", "SAFETY"],
  ];
  const facRows = await db.insert(t.facilities).values(facs.map(([key, name, icon, category]) => ({ key, name, icon, category }))).returning();
  const fac = Object.fromEntries(facRows.map((f) => [f.key, f.id]));

  const pol = await db
    .insert(t.cancellationPolicies)
    .values([
      { key: "FLEXIBLE", name: "Flexible", description: "Full refund up to 24 hours before check-in. No refund after that.", tiers: [{ hoursBeforeCheckIn: 24, refundBps: 10000 }, { hoursBeforeCheckIn: 0, refundBps: 0 }], earlyCheckoutRefundBps: 5000 },
      { key: "MODERATE", name: "Moderate", description: "Full refund up to 72 hours before check-in, 50% refund up to 24 hours before. No refund later.", tiers: [{ hoursBeforeCheckIn: 72, refundBps: 10000 }, { hoursBeforeCheckIn: 24, refundBps: 5000 }, { hoursBeforeCheckIn: 0, refundBps: 0 }], earlyCheckoutRefundBps: 2500 },
      { key: "LONG_STAY", name: "Long stay (monthly)", description: "Full refund up to 7 days before move-in, 50% up to 48 hours before. Early move-out: 50% of unused nights refunded.", tiers: [{ hoursBeforeCheckIn: 168, refundBps: 10000 }, { hoursBeforeCheckIn: 48, refundBps: 5000 }, { hoursBeforeCheckIn: 0, refundBps: 0 }], earlyCheckoutRefundBps: 5000 },
      { key: "STRICT", name: "Strict", description: "50% refund up to 7 days before check-in. No refund later.", tiers: [{ hoursBeforeCheckIn: 168, refundBps: 5000 }, { hoursBeforeCheckIn: 0, refundBps: 0 }], earlyCheckoutRefundBps: 0 },
      { key: "NON_REFUNDABLE", name: "Non-refundable", description: "No refund on cancellation. Security deposit is always refundable.", tiers: [{ hoursBeforeCheckIn: 0, refundBps: 0 }], earlyCheckoutRefundBps: 0 },
    ])
    .returning();
  const policy = Object.fromEntries(pol.map((p) => [p.key, p.id]));

  // GST (verify with your CA): accommodation ≤ ₹7,500/night → 5% (no ITC), > ₹7,500 → 18% (w.e.f. 22 Sep 2025).
  // Residential-style stays (hostel/PG) of ≥ 90 days with ≤ ₹20,000 per person per month → exempt.
  await db.insert(t.taxRules).values([
    { name: "GST exempt (long stay ≤ ₹20,000/month, 90+ days)", code: "GST_EXEMPT_LONGSTAY", rateBps: 0, isExemptionRule: true, minNightsExempt: 90, maxMonthlyExempt: rupees(20000), sacCode: "996311", priority: 100 },
    { name: "GST", code: "GST_5", rateBps: 500, minNightly: 0, maxNightly: rupees(7500), sacCode: "996311", priority: 10 },
    { name: "GST", code: "GST_18", rateBps: 1800, minNightly: rupees(7500) + 1, maxNightly: null, sacCode: "996311", priority: 10 },
  ]);
  await db.insert(t.commissionRules).values([
    { name: "Platform default", scope: "GLOBAL", rateBps: 1500 },
    { name: "Hyderabad launch offer", scope: "CITY", scopeId: city.hyderabad!.id, rateBps: 1200 },
  ]);

  // ── properties ──
  console.log("• properties, rooms, beds, prices");
  type RoomSpec = {
    no: string;
    floor: number;
    name: string;
    category: "PRIVATE" | "SHARED" | "FAMILY" | "DORMITORY";
    beds: number;
    ac: boolean;
    bath?: "ATTACHED" | "COMMON";
    gender?: "MALE_ONLY" | "FEMALE_ONLY" | "MIXED" | "FAMILY" | "ANY";
    bed?: number; // nightly per bed ₹
    room?: number; // nightly entire room ₹
    monthBed?: number;
    monthRoom?: number;
    deposit?: number;
    maxOcc?: number;
    status?: "APPROVED" | "PENDING";
    food?: number;
  };
  type PropSpec = {
    name: string;
    type: string;
    city: string;
    locality: string;
    owner: typeof owner;
    gender: "MALE_ONLY" | "FEMALE_ONLY" | "MIXED" | "FAMILY" | "ANY";
    policy: string;
    desc: string;
    address: string;
    pin: string;
    lat: number;
    lng: number;
    food?: boolean;
    cash?: boolean;
    minStay?: number;
    audience: string[];
    facilities: string[];
    rules: string[];
    rooms: RoomSpec[];
    status?: "APPROVED" | "PENDING" | "DRAFT";
    featured?: boolean;
    nearby: { name: string; distanceKm: number; type: string }[];
  };
  const baseFac = ["WIFI", "HOT_WATER", "POWER_BACKUP", "SECURITY", "CCTV", "DRINKING_WATER", "HOUSEKEEPING", "FIRST_AID", "FIRE_SAFETY"];
  const props: PropSpec[] = [
    {
      name: "StayShare Hitech Suites", type: "HOTEL", city: "hyderabad", locality: "Hitech City", owner, gender: "ANY", policy: "MODERATE", featured: true,
      desc: "Business-friendly hotel steps from Cyber Towers with modern AC rooms, fast Wi-Fi and a rooftop breakfast lounge. Perfect for short work trips and weekend getaways.",
      address: "Plot 45, Cyber Towers Road, Hitech City", pin: "500081", lat: 17.4504, lng: 78.3808, food: true, cash: true, audience: ["WORKING_PROFESSIONALS", "TRAVELLERS"],
      facilities: [...baseFac, "AC", "TV", "LIFT", "PARKING", "FOOD", "GYM", "ATTACHED_BATH", "FRIDGE"],
      rules: ["Check-in from 12:00 PM, check-out by 11:00 AM", "Valid government photo ID required for all guests", "No smoking inside rooms", "Visitors allowed in the lobby until 9 PM"],
      nearby: [{ name: "Cyber Towers", distanceKm: 0.4, type: "Office hub" }, { name: "Inorbit Mall", distanceKm: 2.1, type: "Mall" }, { name: "Hitech City Metro", distanceKm: 0.9, type: "Metro" }],
      rooms: [
        { no: "101", floor: 1, name: "Deluxe AC Room", category: "PRIVATE", beds: 1, ac: true, room: 2799, monthRoom: 45000, deposit: 0, maxOcc: 2, food: 250 },
        { no: "102", floor: 1, name: "Deluxe AC Room", category: "PRIVATE", beds: 1, ac: true, room: 2799, monthRoom: 45000, maxOcc: 2, food: 250 },
        { no: "201", floor: 2, name: "Executive King", category: "PRIVATE", beds: 1, ac: true, room: 3999, monthRoom: 62000, maxOcc: 3, food: 250 },
        { no: "202", floor: 2, name: "Family Suite", category: "FAMILY", beds: 2, ac: true, gender: "FAMILY", room: 5499, maxOcc: 5, food: 250 },
      ],
    },
    {
      name: "Nest Co-Living Madhapur", type: "COLIVING", city: "hyderabad", locality: "Madhapur", owner, gender: "MIXED", policy: "LONG_STAY", featured: true, minStay: 2,
      desc: "Premium co-living for young professionals with fully furnished shared and private rooms, a community kitchen, weekly events and a 24×7 gym.",
      address: "Road No. 36, Ayyappa Society, Madhapur", pin: "500081", lat: 17.4483, lng: 78.3915, food: true, audience: ["WORKING_PROFESSIONALS"],
      facilities: [...baseFac, "AC", "LAUNDRY", "FOOD", "KITCHEN", "LIFT", "GYM", "LOCKER", "WARDROBE", "STUDY_TABLE"],
      rules: ["Quiet hours 10:30 PM – 7 AM", "No alcohol in common areas", "Guests must register at reception", "Keep the community kitchen clean after use"],
      nearby: [{ name: "Durgam Cheruvu", distanceKm: 1.2, type: "Lake" }, { name: "Madhapur Metro", distanceKm: 0.7, type: "Metro" }, { name: "Mindspace IT Park", distanceKm: 2.4, type: "Office hub" }],
      rooms: [
        { no: "A1", floor: 1, name: "Private AC Studio", category: "PRIVATE", beds: 1, ac: true, room: 1499, monthRoom: 24000, deposit: 20000, maxOcc: 1, food: 180 },
        { no: "A2", floor: 1, name: "AC Twin Sharing", category: "SHARED", beds: 2, ac: true, gender: "FEMALE_ONLY", bed: 849, room: 1599, monthBed: 14500, monthRoom: 27000, deposit: 12000, food: 180 },
        { no: "B1", floor: 2, name: "AC Triple Sharing", category: "SHARED", beds: 3, ac: true, gender: "MALE_ONLY", bed: 699, monthBed: 11500, deposit: 10000, food: 180 },
        { no: "B2", floor: 2, name: "Non-AC Four Sharing", category: "SHARED", beds: 4, ac: false, gender: "MALE_ONLY", bed: 499, monthBed: 8500, deposit: 8000, bath: "COMMON", food: 180 },
      ],
    },
    {
      name: "Sakhi Women's Hostel Ameerpet", type: "WORKING_WOMENS_HOSTEL", city: "hyderabad", locality: "Ameerpet", owner, gender: "FEMALE_ONLY", policy: "LONG_STAY",
      desc: "Safe, affordable hostel exclusively for working women and students near Ameerpet coaching centres. Three home-style meals, biometric entry and a lady warden on site.",
      address: "Lane 3, Satyam Theatre Road, Ameerpet", pin: "500016", lat: 17.4375, lng: 78.4482, food: true, cash: true, audience: ["STUDENTS", "WORKING_PROFESSIONALS"],
      facilities: [...baseFac, "LAUNDRY", "FOOD", "LOCKER", "STUDY_TABLE", "WARDROBE"],
      rules: ["Entry closes at 10 PM", "Only female visitors in rooms", "Biometric attendance mandatory", "Monthly rent due by the 5th"],
      nearby: [{ name: "Ameerpet Metro Interchange", distanceKm: 0.3, type: "Metro" }, { name: "Coaching centres", distanceKm: 0.5, type: "Education" }],
      rooms: [
        { no: "101", floor: 1, name: "Non-AC Two Sharing", category: "SHARED", beds: 2, ac: false, bed: 399, monthBed: 7500, deposit: 5000, food: 0 },
        { no: "102", floor: 1, name: "Non-AC Three Sharing", category: "SHARED", beds: 3, ac: false, bed: 349, monthBed: 6500, deposit: 5000, bath: "COMMON", food: 0 },
        { no: "201", floor: 2, name: "AC Two Sharing", category: "SHARED", beds: 2, ac: true, bed: 549, monthBed: 9500, deposit: 6000, food: 0 },
        { no: "202", floor: 2, name: "Six Sharing Dorm", category: "DORMITORY", beds: 6, ac: false, bed: 249, monthBed: 4999, deposit: 3000, bath: "COMMON", food: 0 },
      ],
    },
    {
      name: "Koramangala Backpackers Hub", type: "HOSTEL", city: "bengaluru", locality: "Koramangala", owner, gender: "MIXED", policy: "FLEXIBLE", featured: true,
      desc: "Lively backpacker hostel in the heart of Koramangala's cafe street with dorm beds, private rooms, a rooftop hangout and a co-working corner.",
      address: "80 Feet Road, 4th Block, Koramangala", pin: "560034", lat: 12.9352, lng: 77.6245, audience: ["TRAVELLERS", "STUDENTS"],
      facilities: [...baseFac, "AC", "LOCKER", "KITCHEN", "LAUNDRY"],
      rules: ["Lockers provided — bring your own padlock", "Quiet hours after 11 PM in dorms", "Minimum age 18"],
      nearby: [{ name: "Forum Mall", distanceKm: 1.5, type: "Mall" }, { name: "Sony World Signal", distanceKm: 0.6, type: "Landmark" }],
      rooms: [
        { no: "D1", floor: 1, name: "AC Mixed 6-Bed Dorm", category: "DORMITORY", beds: 6, ac: true, gender: "MIXED", bed: 599, monthBed: 9999, bath: "COMMON" },
        { no: "D2", floor: 1, name: "Female 4-Bed Dorm", category: "DORMITORY", beds: 4, ac: true, gender: "FEMALE_ONLY", bed: 649, monthBed: 10999, bath: "COMMON" },
        { no: "P1", floor: 2, name: "Private Double", category: "PRIVATE", beds: 1, ac: true, room: 1899, maxOcc: 2 },
      ],
    },
    {
      name: "Whitefield Service Apartments", type: "SERVICE_APARTMENT", city: "bengaluru", locality: "Whitefield", owner, gender: "FAMILY", policy: "MODERATE",
      desc: "Spacious 1 and 2 BHK service apartments with kitchens, weekly housekeeping and covered parking — ideal for relocating families and long projects near ITPL.",
      address: "ITPL Main Road, Whitefield", pin: "560066", lat: 12.9698, lng: 77.75, cash: true, minStay: 2, audience: ["FAMILIES", "WORKING_PROFESSIONALS"],
      facilities: [...baseFac, "AC", "TV", "KITCHEN", "PARKING", "LIFT", "FRIDGE", "BALCONY", "LAUNDRY", "ATTACHED_BATH"],
      rules: ["Families and couples with valid ID only", "Pets not allowed", "Parties are not permitted"],
      nearby: [{ name: "ITPL Tech Park", distanceKm: 1.1, type: "Office hub" }, { name: "Phoenix Marketcity", distanceKm: 3.5, type: "Mall" }],
      rooms: [
        { no: "1101", floor: 11, name: "1 BHK Apartment", category: "FAMILY", beds: 1, ac: true, gender: "FAMILY", room: 3499, monthRoom: 55000, deposit: 25000, maxOcc: 3 },
        { no: "1102", floor: 11, name: "2 BHK Apartment", category: "FAMILY", beds: 2, ac: true, gender: "FAMILY", room: 4999, monthRoom: 78000, deposit: 35000, maxOcc: 5 },
      ],
    },
    {
      name: "OMR TechStay PG for Men", type: "WORKING_MENS_HOSTEL", city: "chennai", locality: "OMR", owner, gender: "MALE_ONLY", policy: "LONG_STAY",
      desc: "Budget-friendly PG for men on the OMR IT corridor with South Indian meals, RO water, power backup and a shuttle to Sholinganallur tech parks.",
      address: "Rajiv Gandhi Salai, Thoraipakkam", pin: "600097", lat: 12.9416, lng: 80.2361, food: true, cash: true, audience: ["WORKING_PROFESSIONALS"],
      facilities: [...baseFac, "FOOD", "LAUNDRY", "PARKING", "WARDROBE"],
      rules: ["Gate closes at 11 PM", "No cooking in rooms", "Alcohol and smoking prohibited"],
      nearby: [{ name: "Sholinganallur junction", distanceKm: 2.8, type: "Landmark" }, { name: "Chennai One SEZ", distanceKm: 1.9, type: "Office hub" }],
      rooms: [
        { no: "11", floor: 1, name: "AC Two Sharing", category: "SHARED", beds: 2, ac: true, bed: 499, monthBed: 9000, deposit: 6000 },
        { no: "12", floor: 1, name: "Non-AC Three Sharing", category: "SHARED", beds: 3, ac: false, bed: 349, monthBed: 6500, deposit: 5000 },
        { no: "21", floor: 2, name: "Non-AC Five Sharing", category: "SHARED", beds: 5, ac: false, bed: 279, monthBed: 5200, deposit: 4000, bath: "COMMON" },
      ],
    },
    {
      name: "T. Nagar Family Lodge", type: "FAMILY_LODGE", city: "chennai", locality: "T. Nagar", owner, gender: "FAMILY", policy: "FLEXIBLE",
      desc: "Clean, value family lodge minutes from Ranganathan Street shopping and Pondy Bazaar. Spacious family rooms with AC and non-AC options.",
      address: "Usman Road, T. Nagar", pin: "600017", lat: 13.0418, lng: 80.2341, cash: true, audience: ["FAMILIES", "TRAVELLERS"],
      facilities: [...baseFac, "TV", "LIFT", "PARKING", "ATTACHED_BATH"],
      rules: ["Family & couple friendly — valid ID for all adults", "Check-out 11 AM"],
      nearby: [{ name: "Pondy Bazaar", distanceKm: 0.5, type: "Shopping" }, { name: "Mambalam Station", distanceKm: 0.9, type: "Railway" }],
      rooms: [
        { no: "F1", floor: 1, name: "AC Family Room", category: "FAMILY", beds: 2, ac: true, gender: "FAMILY", room: 2299, maxOcc: 4 },
        { no: "F2", floor: 1, name: "Non-AC Family Room", category: "FAMILY", beds: 2, ac: false, gender: "FAMILY", room: 1599, maxOcc: 4 },
        { no: "S1", floor: 2, name: "Non-AC Single", category: "PRIVATE", beds: 1, ac: false, room: 899, maxOcc: 1 },
      ],
    },
    {
      name: "Hinjewadi Students Hostel", type: "STUDENT_HOSTEL", city: "pune", locality: "Hinjewadi", owner, gender: "MIXED", policy: "LONG_STAY",
      desc: "Student-focused hostel with separate boys' and girls' wings, study hall, high-speed Wi-Fi and a mess serving North & South Indian food.",
      address: "Phase 1, Hinjewadi", pin: "411057", lat: 18.5913, lng: 73.7389, food: true, audience: ["STUDENTS"],
      facilities: [...baseFac, "FOOD", "STUDY_TABLE", "LAUNDRY", "LOCKER"],
      rules: ["Separate wings for boys and girls", "Study hours 8–10 PM (silent)", "Ragging strictly prohibited"],
      nearby: [{ name: "Rajiv Gandhi Infotech Park", distanceKm: 1.0, type: "Office hub" }, { name: "Symbiosis campus", distanceKm: 4.2, type: "Education" }],
      rooms: [
        { no: "G-01", floor: 0, name: "Girls AC Two Sharing", category: "SHARED", beds: 2, ac: true, gender: "FEMALE_ONLY", bed: 549, monthBed: 9800, deposit: 7000 },
        { no: "B-01", floor: 1, name: "Boys Non-AC Four Sharing", category: "SHARED", beds: 4, ac: false, gender: "MALE_ONLY", bed: 329, monthBed: 5900, deposit: 4000, bath: "COMMON" },
        { no: "B-02", floor: 1, name: "Boys Six Sharing", category: "SHARED", beds: 6, ac: false, gender: "MALE_ONLY", bed: 259, monthBed: 4800, deposit: 3000, bath: "COMMON" },
      ],
    },
    {
      name: "Kharadi Business Inn", type: "HOTEL", city: "pune", locality: "Kharadi", owner, gender: "ANY", policy: "MODERATE",
      desc: "Contemporary business hotel next to EON IT Park with ergonomic workspaces, an all-day cafe and airport transfers on request.",
      address: "EON Free Zone Road, Kharadi", pin: "411014", lat: 18.5519, lng: 73.9476, food: true, audience: ["WORKING_PROFESSIONALS", "TRAVELLERS"],
      facilities: [...baseFac, "AC", "TV", "LIFT", "PARKING", "FOOD", "GYM", "ATTACHED_BATH"],
      rules: ["Check-in 1 PM, check-out 11 AM", "Local IDs accepted"],
      nearby: [{ name: "EON IT Park", distanceKm: 0.3, type: "Office hub" }, { name: "Pune Airport", distanceKm: 6.5, type: "Airport" }],
      rooms: [
        { no: "301", floor: 3, name: "Superior AC", category: "PRIVATE", beds: 1, ac: true, room: 2499, maxOcc: 2 },
        { no: "302", floor: 3, name: "Superior AC", category: "PRIVATE", beds: 1, ac: true, room: 2499, maxOcc: 2 },
        { no: "401", floor: 4, name: "Premium Suite", category: "PRIVATE", beds: 1, ac: true, room: 8499, maxOcc: 3 },
      ],
    },
    {
      name: "Benz Circle Comfort PG", type: "PG", city: "vijayawada", locality: "Benz Circle", owner, gender: "MALE_ONLY", policy: "LONG_STAY",
      desc: "Comfortable, well-maintained PG near Benz Circle with Andhra-style meals, daily housekeeping and easy bus connectivity.",
      address: "MG Road, near Benz Circle", pin: "520010", lat: 16.4987, lng: 80.6566, food: true, cash: true, audience: ["STUDENTS", "WORKING_PROFESSIONALS"],
      facilities: [...baseFac, "FOOD", "LAUNDRY", "PARKING"],
      rules: ["Gate closes at 10:30 PM", "Monthly rent due by the 5th"],
      nearby: [{ name: "PVP Square Mall", distanceKm: 1.2, type: "Mall" }, { name: "Vijayawada Junction", distanceKm: 4.5, type: "Railway" }],
      rooms: [
        { no: "1", floor: 1, name: "AC Single", category: "PRIVATE", beds: 1, ac: true, room: 699, monthRoom: 11000, deposit: 5000, maxOcc: 1 },
        { no: "2", floor: 1, name: "Non-AC Two Sharing", category: "SHARED", beds: 2, ac: false, bed: 299, monthBed: 5000, deposit: 3000 },
        { no: "3", floor: 2, name: "Non-AC Four Sharing", category: "SHARED", beds: 4, ac: false, bed: 229, monthBed: 3900, deposit: 2500, bath: "COMMON" },
      ],
    },
    // Pending approval — demonstrates the admin approval + pricing workflow
    {
      name: "HSR Nest Co-Living (pending review)", type: "COLIVING", city: "bengaluru", locality: "HSR Layout", owner: owner2, gender: "FEMALE_ONLY", policy: "LONG_STAY", status: "PENDING",
      desc: "Newly renovated women-only co-living in HSR Layout Sector 2 with AC rooms, meals and a terrace garden. Submitted by the partner for review.",
      address: "27th Main, Sector 2, HSR Layout", pin: "560102", lat: 12.9121, lng: 77.6446, food: true, audience: ["WORKING_PROFESSIONALS"],
      facilities: [...baseFac, "AC", "FOOD", "LAUNDRY", "WARDROBE"],
      rules: ["Women only", "Entry closes at 11 PM"],
      nearby: [{ name: "HSR BDA Complex", distanceKm: 0.8, type: "Landmark" }],
      rooms: [
        { no: "201", floor: 2, name: "AC Two Sharing", category: "SHARED", beds: 2, ac: true, status: "PENDING" },
        { no: "202", floor: 2, name: "AC Three Sharing", category: "SHARED", beds: 3, ac: true, status: "PENDING" },
      ],
    },
    {
      name: "Gachibowli Green PG (pending review)", type: "PG", city: "hyderabad", locality: "Gachibowli", owner: owner2, gender: "MALE_ONLY", policy: "LONG_STAY", status: "PENDING",
      desc: "Affordable PG close to the Financial District. Awaiting StayShare verification and pricing.",
      address: "Indira Nagar, Gachibowli", pin: "500032", lat: 17.4401, lng: 78.3489, audience: ["WORKING_PROFESSIONALS"],
      facilities: [...baseFac, "LAUNDRY"],
      rules: ["No smoking"],
      nearby: [{ name: "Financial District", distanceKm: 2.2, type: "Office hub" }],
      rooms: [{ no: "G1", floor: 0, name: "Non-AC Three Sharing", category: "SHARED", beds: 3, ac: false, status: "PENDING" }],
    },
  ];

  const createdProps: { prop: typeof t.properties.$inferSelect; rooms: (typeof t.rooms.$inferSelect & { bedIds: string[] })[] }[] = [];
  let pIdx = 0;
  for (const p of props) {
    pIdx++;
    const c = city[p.city]!;
    const l = loc[`${p.city}:${p.locality}`]!;
    const code = `${c.code}${String(pIdx).padStart(3, "0")}`;
    const status = p.status ?? "APPROVED";
    const [prop] = await db
      .insert(t.properties)
      .values({
        code,
        name: p.name,
        slug: p.name.toLowerCase().replace(/\(.*?\)/g, "").trim().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""),
        propertyTypeId: pt[p.type]!,
        description: p.desc,
        addressLine: p.address,
        landmark: p.nearby[0]?.name,
        cityId: c.id,
        localityId: l.id,
        state: c.state,
        postalCode: p.pin,
        latitude: p.lat,
        longitude: p.lng,
        ownerId: p.owner.id,
        managerId: p.owner.id === owner.id ? staff.id : null,
        genderEligibility: p.gender,
        minStayNights: p.minStay ?? 1,
        cancellationPolicyId: policy[p.policy],
        allowCashAtProperty: Boolean(p.cash),
        foodIncluded: Boolean(p.food),
        contactPhone: "+914000000000",
        nearbyPlaces: p.nearby,
        targetAudience: p.audience,
        approvalStatus: status,
        kycStatus: status === "APPROVED" ? "APPROVED" : "PENDING",
        approvedBy: status === "APPROVED" ? admin.id : null,
        approvedAt: status === "APPROVED" ? new Date() : null,
        submittedAt: new Date(),
        isFeatured: Boolean(p.featured),
        createdBy: p.owner.id,
      })
      .returning();
    const imgs = [pick(EXTERIORS, pIdx), pick(INTERIORS, pIdx), pick(INTERIORS, pIdx + 2), pick(ROOMS_PRIVATE, pIdx)];
    await db.insert(t.propertyImages).values(imgs.map((url, i) => ({ propertyId: prop!.id, url, caption: ["Building", "Lounge", "Common area", "Room"][i], sortOrder: i, isCover: i === 0, status: status === "APPROVED" ? ("APPROVED" as const) : ("PENDING" as const) })));
    await db.insert(t.propertyFacilities).values([...new Set(p.facilities)].map((k) => ({ propertyId: prop!.id, facilityId: fac[k]!, status: status === "APPROVED" ? ("APPROVED" as const) : ("PENDING" as const) })));
    await db.insert(t.propertyRules).values(p.rules.map((text, i) => ({ propertyId: prop!.id, text, sortOrder: i })));
    if (p.owner.id === owner.id) await db.insert(t.staffAssignments).values({ userId: staff.id, propertyId: prop!.id });

    const floorIds: Record<number, string> = {};
    for (const f of [...new Set(p.rooms.map((r) => r.floor))]) {
      const [fr] = await db.insert(t.floors).values({ propertyId: prop!.id, number: f, name: f === 0 ? "Ground floor" : `Floor ${f}` }).returning();
      floorIds[f] = fr!.id;
    }
    const roomsOut: (typeof t.rooms.$inferSelect & { bedIds: string[] })[] = [];
    let rIdx = 0;
    for (const r of p.rooms) {
      rIdx++;
      const rStatus = r.status ?? "APPROVED";
      const isShared = r.category === "SHARED" || r.category === "DORMITORY";
      const [room] = await db
        .insert(t.rooms)
        .values({
          propertyId: prop!.id,
          floorId: floorIds[r.floor],
          roomNumber: r.no,
          name: r.name,
          category: r.category,
          sharingCapacity: r.beds,
          totalBeds: r.beds,
          maxOccupancy: r.maxOcc ?? r.beds,
          isAC: r.ac,
          bathroom: r.bath ?? "ATTACHED",
          genderEligibility: r.gender ?? (p.gender === "MIXED" ? "ANY" : p.gender),
          allowBedBooking: isShared,
          allowEntireRoomBooking: !isShared || Boolean(r.room) || r.beds <= 3,
          approvalStatus: rStatus,
          sizeSqft: 120 + r.beds * 60,
          description: `${r.name} with ${r.ac ? "air conditioning" : "ceiling fans"}, ${r.bath === "COMMON" ? "common" : "attached"} bathroom and ${isShared ? "individual beds, lockers and wardrobes" : "a comfortable bed and work desk"}.`,
          createdBy: p.owner.id,
        })
        .returning();
      const bedRows = await db
        .insert(t.beds)
        .values(
          Array.from({ length: r.beds }).map((_, i) => ({
            roomId: room!.id,
            bedNumber: String.fromCharCode(65 + i),
            code: `${code}-${r.no}-${String.fromCharCode(65 + i)}`,
            bedType: r.category === "FAMILY" ? "QUEEN" : r.beds >= 4 && i % 2 === 1 ? "BUNK_UPPER" : r.beds >= 4 ? "BUNK_LOWER" : r.category === "PRIVATE" ? "DOUBLE" : "SINGLE",
          })),
        )
        .returning();
      const roomImgs = isShared ? [pick(ROOMS_SHARED, pIdx + rIdx), pick(ROOMS_SHARED, pIdx + rIdx + 1)] : [pick(ROOMS_PRIVATE, pIdx + rIdx), pick(ROOMS_PRIVATE, pIdx + rIdx + 3)];
      await db.insert(t.roomImages).values(roomImgs.map((url, i) => ({ roomId: room!.id, url, sortOrder: i, status: rStatus === "APPROVED" ? ("APPROVED" as const) : ("PENDING" as const) })));
      const rf = ["WIFI", "WARDROBE", "HOT_WATER", ...(r.ac ? ["AC"] : []), ...(r.bath !== "COMMON" ? ["ATTACHED_BATH"] : []), ...(isShared ? ["LOCKER", "STUDY_TABLE"] : ["TV"])];
      await db.insert(t.roomFacilities).values(rf.map((k) => ({ roomId: room!.id, facilityId: fac[k]! })));

      if (rStatus === "APPROVED") {
        const nightlyBed = r.bed ? rupees(r.bed) : null;
        const nightlyRoom = r.room ? rupees(r.room) : nightlyBed && r.beds <= 3 ? Math.round(nightlyBed * r.beds * 0.9) : null;
        const monthlyBed = r.monthBed ? rupees(r.monthBed) : null;
        const monthlyRoom = r.monthRoom ? rupees(r.monthRoom) : monthlyBed && r.beds <= 3 ? Math.round(monthlyBed * r.beds * 0.92) : null;
        const [plan] = await db
          .insert(t.pricePlans)
          .values({
            roomId: room!.id,
            nightlyBed,
            nightlyRoom,
            weeklyBed: nightlyBed ? Math.round(nightlyBed * 7 * 0.9) : null,
            weeklyRoom: nightlyRoom ? Math.round(nightlyRoom * 7 * 0.9) : null,
            monthlyBed,
            monthlyRoom,
            extraAdultPerNight: r.category === "FAMILY" || r.category === "PRIVATE" ? rupees(500) : 0,
            childPerNight: r.category === "FAMILY" ? rupees(250) : 0,
            foodPerPersonPerDay: r.food ? rupees(r.food) : p.food ? rupees(200) : 0,
            laundryPerMonth: p.facilities.includes("LAUNDRY") ? rupees(600) : 0,
            cleaningFee: nightlyRoom && !nightlyBed ? rupees(99) : 0,
            securityDepositBed: r.deposit && nightlyBed ? rupees(Math.round(r.deposit / Math.max(1, r.beds))) : 0,
            securityDepositRoom: r.deposit ? rupees(r.deposit) : 0,
            approvedBy: admin.id,
            createdBy: admin.id,
          })
          .returning();
        // duration packages (2, 5, 10, 15, 20 nights) — progressively cheaper per night
        const tiers: [number, number][] = [[2, 0.97], [5, 0.93], [10, 0.88], [15, 0.84], [20, 0.8]];
        const dps: { pricePlanId: string; unit: "BED" | "ROOM"; nights: number; totalPrice: number }[] = [];
        for (const [n, f] of tiers) {
          if (nightlyBed) dps.push({ pricePlanId: plan!.id, unit: "BED", nights: n, totalPrice: Math.round(nightlyBed * n * f) });
          if (nightlyRoom) dps.push({ pricePlanId: plan!.id, unit: "ROOM", nights: n, totalPrice: Math.round(nightlyRoom * n * f) });
        }
        if (dps.length) await db.insert(t.durationPrices).values(dps);
        await db.insert(t.priceHistory).values({ entityType: "PRICE_PLAN", entityId: plan!.id, field: "nightly", oldValue: null, newValue: JSON.stringify({ nightlyBed, nightlyRoom, monthlyBed, monthlyRoom }), changedBy: admin.id, reason: "Initial pricing on approval", effectiveFrom: new Date() });
      } else {
        // pending rooms have NO price; the StayShare admin team sets it during approval
      }
      roomsOut.push({ ...room!, bedIds: bedRows.map((b) => b.id) });
    }
    createdProps.push({ prop: prop!, rooms: roomsOut });
    await refreshStartingPrice(prop!.id);
  }

  // ── pricing rules ──
  const hitech = createdProps[0]!;
  await db.insert(t.pricingRules).values([
    { name: "Weekend demand (Fri–Sat)", ruleType: "WEEKEND", scope: "PROPERTY", scopeId: hitech.prop.id, adjustmentType: "PERCENT", value: 1000, daysOfWeek: [5, 6], priority: 5, reason: "Higher weekend occupancy", createdBy: admin.id },
    { name: "Diwali festive season", ruleType: "FESTIVAL", scope: "GLOBAL", adjustmentType: "PERCENT", value: 1500, startDate: "2026-11-06", endDate: "2026-11-10", unit: "ROOM", priority: 3, reason: "Festival demand", createdBy: admin.id },
    { name: "Co-living long-stay promo", ruleType: "PROMOTION", scope: "PROPERTY", scopeId: createdProps[1]!.prop.id, adjustmentType: "PERCENT", value: -500, minNights: 30, priority: 1, reason: "Launch offer: 5% off monthly stays", createdBy: admin.id },
  ]);

  // ── coupons ──
  const now = new Date();
  const yearEnd = new Date("2027-03-31T18:29:59Z");
  await db.insert(t.coupons).values([
    { code: "WELCOME10", title: "10% off your first stay", description: "Up to ₹500 off on your first StayShare booking", discountType: "PERCENT", value: 1000, maxDiscount: rupees(500), validFrom: now, validTo: yearEnd, firstBookingOnly: true, perUserLimit: 1, createdBy: admin.id },
    { code: "MONTHLY1000", title: "₹1,000 off monthly stays", description: "Flat ₹1,000 off stays of 30 nights or more", discountType: "FLAT", value: rupees(1000), minNights: 30, validFrom: now, validTo: yearEnd, perUserLimit: 3, createdBy: admin.id },
    { code: "STUDENT15", title: "Students save 15%", description: "15% off bed bookings, up to ₹750", discountType: "PERCENT", value: 1500, maxDiscount: rupees(750), unit: "BED", validFrom: now, validTo: yearEnd, perUserLimit: 2, createdBy: admin.id },
    { code: "HITECH200", title: "₹200 off Hitech Suites", description: "Property-funded offer", discountType: "FLAT", value: rupees(200), minBookingAmount: rupees(2000), propertyId: hitech.prop.id, fundedBy: "PROPERTY", validFrom: now, validTo: yearEnd, perUserLimit: 5, createdBy: admin.id },
    { code: "FLASH30", title: "Flash sale 30% (non-refundable)", description: "30% off, non-refundable", discountType: "PERCENT", value: 3000, maxDiscount: rupees(1500), nonRefundable: true, validFrom: now, validTo: new Date(now.getTime() + 14 * 86400_000), perUserLimit: 1, createdBy: admin.id },
  ]);

  // ── subscription plans (priced by the StayShare admin team) ──
  await db.insert(t.subscriptionPlans).values([
    { audience: "CUSTOMER", code: "PLUS_MONTHLY", name: "StayShare Plus", description: "Save on every stay", price: rupees(199), durationDays: 30, benefits: { bookingDiscountBps: 500, maxDiscountPerBooking: rupees(1000), waiveConvenienceFee: true }, features: ["5% off every booking (up to ₹1,000)", "No convenience fee", "Priority support"], isPopular: true, sortOrder: 1, createdBy: admin.id },
    { audience: "CUSTOMER", code: "PLUS_YEARLY", name: "StayShare Plus (yearly)", description: "Best value for frequent travellers", price: rupees(1499), durationDays: 365, benefits: { bookingDiscountBps: 700, maxDiscountPerBooking: rupees(1500), waiveConvenienceFee: true }, features: ["7% off every booking (up to ₹1,500)", "No convenience fee", "Priority support"], sortOrder: 2, createdBy: admin.id },
    { audience: "OWNER", code: "PARTNER_BASIC", name: "Partner Basic", description: "Get started on StayShare", price: 0, durationDays: 365, benefits: { maxProperties: 3 }, features: ["List up to 3 properties", "Standard commission", "Owner dashboard & payouts"], sortOrder: 1, createdBy: admin.id },
    { audience: "OWNER", code: "PARTNER_PRO", name: "Partner Pro", description: "Grow faster with lower commission", price: rupees(1999), durationDays: 30, benefits: { maxProperties: 15, commissionBps: 1000, prioritySupport: true }, features: ["List up to 15 properties", "10% platform commission", "Priority partner support"], isPopular: true, sortOrder: 2, createdBy: admin.id },
    { audience: "OWNER", code: "PARTNER_PREMIUM", name: "Partner Premium", description: "Maximum visibility", price: rupees(4999), durationDays: 30, benefits: { maxProperties: 100, commissionBps: 800, featuredListing: true, prioritySupport: true }, features: ["Unlimited* properties (100)", "8% platform commission", "Featured on the home page", "Dedicated account manager"], sortOrder: 3, createdBy: admin.id },
  ]);
  const [proPlan] = await db.select().from(t.subscriptionPlans).where(eq(t.subscriptionPlans.code, "PARTNER_PRO"));
  const { grantSubscription } = await import("@/services/subscriptions");
  await grantSubscription(admin.id, owner.id, proPlan!.id);

  // ── settings, content, templates ──
  console.log("• content & templates");
  await db.insert(t.banners).values([
    { title: "Monthly stays from ₹4,999", subtitle: "Shared beds with meals, Wi-Fi and housekeeping included", linkUrl: "/search?stay=monthly", sortOrder: 0 },
    { title: "Use WELCOME10 on your first booking", subtitle: "Save up to ₹500 on private rooms and beds", linkUrl: "/search", sortOrder: 1 },
  ]);
  await db.insert(t.faqs).values([
    { question: "Can I book just one bed in a shared room?", answer: "Yes. Choose a shared room and select 'Book a bed'. The remaining beds stay available to other guests of the same eligibility (e.g. female-only rooms).", sortOrder: 0 },
    { question: "Who sets the prices?", answer: "All prices on StayShare are verified and set by the StayShare team so that you always see a fair, transparent final price with a full breakdown before you pay.", sortOrder: 1 },
    { question: "What ID do I need at check-in?", answer: "A valid government photo ID such as Aadhaar, passport, driving licence or voter ID. Some properties require uploading it while booking.", sortOrder: 2 },
    { question: "Is the security deposit refundable?", answer: "Yes. The deposit is refunded at check-out after the room inspection, minus any damage or pending charges.", sortOrder: 3 },
    { question: "Can I extend my stay?", answer: "Yes — open your booking and tap 'Extend stay'. We check availability for the same bed or room and show you the extra amount before you pay.", sortOrder: 4 },
    { question: "How do cancellations and refunds work?", answer: "Each property shows its cancellation policy before you pay. When you cancel we show the exact refund amount first. Refunds go back to the original payment method in 5–7 working days.", sortOrder: 5 },
    { question: "I own a hostel / PG. How do I list it?", answer: "Create a partner account, add your building, rooms and photos, and submit KYC. Our team verifies the property, sets the pricing and makes it live.", sortOrder: 6, category: "PARTNER" },
  ]);
  const page = (slug: string, title: string, body: string) => ({ slug, title, body });
  await db.insert(t.contentPages).values([
    page("about", "About StayShare", "StayShare makes it simple to find a comfortable, safe and affordable place to stay — for a night, a month or longer.\n\nWe partner with hotels, hostels, PGs and co-living operators across India, verify every property, and set transparent prices so you always know exactly what you pay.\n\n## Our promise\n- Verified properties and rooms\n- Clear, all-inclusive pricing with a full breakdown\n- Book a single bed or an entire room\n- Flexible short and monthly stays\n- Real support when you need it"),
    page("terms", "Terms and conditions", "These are placeholder terms for the StayShare demo. Replace with terms reviewed by your legal counsel before launch.\n\n1. Bookings are subject to availability and confirmation after successful payment.\n2. Guests must carry valid government photo ID.\n3. House rules of each property apply.\n4. Prices include applicable taxes as shown in the breakdown.\n5. StayShare acts as a booking platform between guests and properties."),
    page("privacy", "Privacy policy", "Placeholder privacy policy. We collect only the information needed to provide bookings (name, contact, ID where legally required) and store identity numbers encrypted. Identity documents are visible only to authorised staff of the property you booked and StayShare administrators. Replace this with a DPDP Act-compliant policy before launch."),
    page("cancellation-policy", "Cancellation policy", "Each property uses one of the StayShare cancellation policies (Flexible, Moderate, Long stay, Strict, Non-refundable). The applicable policy and your exact refund amount are always shown before you confirm a cancellation. Security deposits are always refundable before check-in."),
    page("refund-policy", "Refund policy", "Refunds are initiated immediately after an eligible cancellation and are credited to the original payment method within 5–7 working days. Deposit refunds are processed at check-out after inspection. For exceptional situations you can request a refund review from your booking page."),
    page("contact", "Contact us", "Reach the StayShare support team using the options on this page. For booking issues, please include your booking number."),
  ]);
  const tpl = (key: string, channel: "EMAIL" | "SMS" | "WHATSAPP" | "IN_APP" | "PUSH", subject: string, body: string) => ({ key, channel, subject, body });
  await db.insert(t.notificationTemplates).values([
    tpl("otp", "SMS", "OTP", "{{code}} is your StayShare OTP. Valid for {{minutes}} minutes. Do not share it with anyone."),
    tpl("otp", "EMAIL", "Your StayShare verification code", "Your StayShare code is {{code}}. It expires in {{minutes}} minutes."),
    tpl("password.reset", "EMAIL", "Reset your StayShare password", "Hi {{name}}, reset your password using this link (valid {{minutes}} minutes): {{link}}"),
    tpl("user.registered", "EMAIL", "Welcome to StayShare", "Hi {{name}}, welcome to StayShare! Flexible stays. Affordable sharing. Comfortable living."),
    tpl("user.registered", "IN_APP", "Welcome to StayShare 🎉", "Complete your profile and upload an ID to book faster."),
    tpl("owner.approved", "EMAIL", "Your partner account is approved", "Hi {{name}}, your StayShare partner account has been approved."),
    tpl("owner.approved", "IN_APP", "Partner KYC approved", "Your KYC is approved. You can now receive payouts."),
    tpl("owner.rejected", "IN_APP", "Partner KYC needs attention", "Your KYC was not approved: {{reason}}"),
    tpl("property.approved", "IN_APP", "{{propertyName}} is live", "Your property has been approved and priced by the StayShare team."),
    tpl("property.approved", "EMAIL", "{{propertyName}} is now live on StayShare", "Good news! {{propertyName}} has been approved. {{notes}}"),
    tpl("property.rejected", "IN_APP", "{{propertyName}} needs changes", "Review notes: {{notes}}"),
    tpl("booking.confirmed", "EMAIL", "Booking confirmed · {{bookingNumber}}", "Hi {{name}}, your stay at {{propertyName}} from {{checkIn}} to {{checkOut}} is confirmed. Amount: {{amount}}. View: {{link}}"),
    tpl("booking.confirmed", "SMS", "Booking confirmed", "StayShare: Booking {{bookingNumber}} at {{propertyName}} confirmed for {{checkIn}}. Show your booking QR at check-in."),
    tpl("booking.confirmed", "WHATSAPP", "Booking confirmed", "✅ Booking {{bookingNumber}} confirmed at {{propertyName}} ({{checkIn}} → {{checkOut}}). Amount {{amount}}."),
    tpl("booking.confirmed", "IN_APP", "Booking confirmed", "{{bookingNumber}} at {{propertyName}} · {{checkIn}} → {{checkOut}}"),
    tpl("payment.success", "IN_APP", "Payment received", "We received {{amount}} for booking {{bookingNumber}}."),
    tpl("payment.failed", "IN_APP", "Payment failed", "Payment of {{amount}} for {{bookingNumber}} failed: {{reason}}. You can retry while your room is held."),
    tpl("payment.failed", "SMS", "Payment failed", "StayShare: payment for {{bookingNumber}} failed. Retry from your booking page."),
    tpl("checkin.upcoming", "WHATSAPP", "Check-in tomorrow", "Your check-in at {{propertyName}} is tomorrow. Carry a valid photo ID."),
    tpl("checkin.completed", "IN_APP", "Checked in", "Welcome! You're checked in for booking {{bookingNumber}}."),
    tpl("checkout.upcoming", "IN_APP", "Check-out reminder", "Your check-out is tomorrow for {{bookingNumber}}. Want to extend?"),
    tpl("checkout.completed", "IN_APP", "Thanks for staying", "Checked out of {{bookingNumber}}. Deposit refund: {{depositRefund}}. Please rate your stay!"),
    tpl("booking.cancelled", "IN_APP", "Booking cancelled", "{{bookingNumber}} was cancelled. Refund: {{refundAmount}}."),
    tpl("booking.cancelled", "EMAIL", "Booking {{bookingNumber}} cancelled", "Hi {{name}}, your booking {{bookingNumber}} is cancelled. Refund amount: {{refundAmount}}."),
    tpl("refund.initiated", "IN_APP", "Refund initiated", "Refund of {{amount}} for {{bookingNumber}} has been initiated (ref {{refundId}})."),
    tpl("refund.completed", "IN_APP", "Refund completed", "Refund of {{amount}} for {{bookingNumber}} is complete (ref {{refundId}})."),
    tpl("refund.completed", "SMS", "Refund completed", "StayShare: refund {{amount}} for {{bookingNumber}} processed. Ref {{refundId}}."),
    tpl("extension.approved", "IN_APP", "Stay extended", "Your stay for {{bookingNumber}} is extended to {{newCheckOut}}."),
    tpl("modification.update", "IN_APP", "Booking change {{status}}", "Your {{type}} request for {{bookingNumber}} is {{status}}."),
    tpl("ticket.updated", "IN_APP", "Support ticket {{ticketNumber}}", "{{message}}"),
    tpl("ticket.updated", "EMAIL", "Update on ticket {{ticketNumber}}", "{{message}}"),
    tpl("payout.updated", "IN_APP", "Payout {{payoutNumber}}: {{status}}", "Payout of {{amount}} is now {{status}}."),
    tpl("promo.offer", "PUSH", "{{title}}", "{{message}}"),
    tpl("promo.offer", "IN_APP", "{{title}}", "{{message}}"),
  ]);

  // ── historical completed bookings (direct inserts) with reviews & earnings ──
  console.log("• historical bookings, reviews, earnings");
  const today = todayIST();
  const reviewTexts = [
    ["Clean and super convenient", "Rooms were spotless and the staff were very helpful. Wi-Fi was fast enough for video calls."],
    ["Great value for money", "Food was homely and tasty. Housekeeping every day. Would stay again for a month."],
    ["Safe and comfortable", "Felt very safe — CCTV, biometric entry and a caring warden. Beds were comfortable."],
    ["Good location, a bit noisy", "Close to the metro and offices. Weekends can be loud but staff handled it quickly."],
    ["Loved the community", "Met great people at the weekly events. Kitchen is well-equipped."],
  ];
  let hist = 0;
  for (const cp of createdProps.filter((c) => c.prop.approvalStatus === "APPROVED")) {
    for (let k = 0; k < 2; k++) {
      hist++;
      const room = cp.rooms[k % cp.rooms.length]!;
      const [plan] = await db.select().from(t.pricePlans).where(eq(t.pricePlans.roomId, room.id));
      if (!plan) continue;
      const cust = allCustomers[hist % allCustomers.length]!;
      const nights = [3, 5, 10, 30][hist % 4]!;
      // k=1 stays end the day before k=0 stays start (so the same room never overlaps)
      const checkOut = k === 0 ? addDays(today, -5) : addDays(today, -40);
      const checkInD = addDays(checkOut, -nights);
      const unit: "BED" | "ROOM" = room.allowBedBooking ? "BED" : "ROOM";
      const nightly = unit === "BED" ? (plan.nightlyBed ?? Math.round((plan.monthlyBed ?? 0) / 30)) : (plan.nightlyRoom ?? Math.round((plan.monthlyRoom ?? 0) / 30));
      const roomCharge = nightly * nights;
      const tax = Math.round(roomCharge * 0.05);
      const conv = 4900 + 882;
      const total = roomCharge + tax + conv;
      const [city0] = await db.select().from(t.cities).where(eq(t.cities.id, cp.prop.cityId));
      const [b] = await db
        .insert(t.bookings)
        .values({
          bookingNumber: await nextBookingNumber(city0!.code),
          customerId: cust.id,
          propertyId: cp.prop.id,
          roomId: room.id,
          unit,
          checkIn: checkInD,
          checkOut,
          nights,
          adults: 1,
          bedsCount: unit === "BED" ? 1 : room.totalBeds,
          status: "COMPLETED",
          roomCharge,
          taxAmount: tax,
          convenienceFee: conv,
          totalAmount: total,
          paidAmount: total,
          priceBreakdown: { lines: [{ key: "room", label: `${unit === "BED" ? "1 bed" : "Entire room"} × ${nights} nights`, amount: roomCharge, kind: "charge" }, { key: "tax", label: "GST (5%)", amount: tax, kind: "tax" }, { key: "convenience", label: "Convenience fee", amount: 4900, kind: "charge" }, { key: "convenienceTax", label: "GST on convenience fee", amount: 882, kind: "tax" }], convenienceFee: 4900, convenienceTax: 882 } as never,
          termsAcceptedAt: new Date(),
          confirmedAt: new Date(Date.now() - (nights + 20) * 86400_000),
          completedAt: new Date(Date.now() - 5 * 86400_000),
          cancellationPolicy: { key: "FLEXIBLE", tiers: [{ hoursBeforeCheckIn: 24, refundBps: 10000 }] },
        })
        .returning();
      const bedIds = unit === "BED" ? [room.bedIds[0]!] : room.bedIds;
      await db.insert(t.bookingBeds).values(bedIds.map((bedId) => ({ bookingId: b!.id, bedId })));
      await db.insert(t.bookingRooms).values({ bookingId: b!.id, roomId: room.id, unit });
      await db.insert(t.availabilityCalendars).values(bedIds.flatMap((bedId) => listNights(checkInD, checkOut).map((night) => ({ bedId, roomId: room.id, night, status: "BOOKED" as const, bookingId: b!.id }))));
      await db.insert(t.bookingGuests).values({ bookingId: b!.id, name: cust.name, phone: cust.phone, email: cust.email, isPrimary: true, gender: "FEMALE" });
      await db.insert(t.bookingStatusHistory).values([
        { bookingId: b!.id, toStatus: "CONFIRMED", note: "Seeded" },
        { bookingId: b!.id, fromStatus: "CONFIRMED", toStatus: "CHECKED_IN", changedBy: staff.id },
        { bookingId: b!.id, fromStatus: "CHECKED_IN", toStatus: "COMPLETED", changedBy: staff.id },
      ]);
      await db.insert(t.payments).values({ bookingId: b!.id, provider: "mock", providerOrderId: `mock_order_seed_${hist}`, providerPaymentId: `mock_pay_seed_${hist}`, method: hist % 2 ? "UPI" : "CARD", amount: total, status: "CAPTURED", gatewayFee: Math.round(total * 0.02), capturedAt: new Date(Date.now() - (nights + 20) * 86400_000) });
      await db.insert(t.checkIns).values({ bookingId: b!.id, staffId: staff.id, idVerified: true, idDocType: "AADHAAR", idLast4: "4321", actualTime: new Date(Date.now() - (nights + 5 + hist * 3) * 86400_000), assignedBeds: bedIds });
      await db.insert(t.checkOuts).values({ bookingId: b!.id, staffId: staff.id, actualTime: new Date(Date.now() - (5 + hist * 3) * 86400_000), inspection: { condition: "Good" } });
      await db.transaction((tx) => upsertEarning(tx, b!.id, { eligibleAt: new Date(Date.now() - 86400_000) }));
      await createInvoice(b!.id, "FINAL");
      const [title, text] = reviewTexts[hist % reviewTexts.length]!;
      const score = 3 + (hist % 3);
      await db.insert(t.reviews).values({ bookingId: b!.id, customerId: cust.id, propertyId: cp.prop.id, cleanliness: score, location: Math.min(5, score + 1), staff: score, facilities: score, valueForMoney: Math.min(5, score + 1), foodQuality: cp.prop.foodIncluded ? score : null, safety: 5, overall: score, title, text });
    }
    const agg = await db.execute<{ avg: number; n: number }>(sql`SELECT coalesce(avg(overall),0)::float AS avg, count(*)::int AS n FROM reviews WHERE property_id = ${cp.prop.id} AND status = 'PUBLISHED'`);
    await db.update(t.properties).set({ ratingAvg: Number(agg.rows[0]!.avg.toFixed(1)), reviewCount: agg.rows[0]!.n, bookingCount: 2 }).where(eq(t.properties.id, cp.prop.id));
  }
  // owner reply on a review
  const [firstReview] = await db.select().from(t.reviews).limit(1);
  if (firstReview) await db.insert(t.reviewReplies).values({ reviewId: firstReview.id, authorId: owner.id, text: "Thank you for staying with us! We look forward to hosting you again." });

  // ── live bookings through the real booking & payment services ──
  console.log("• live bookings via booking service (holds, payments, check-in)");
  const cu = { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone };
  const coliving = createdProps[1]!;
  const twin = coliving.rooms[1]!; // female-only AC twin sharing
  // 1) Upcoming confirmed bed booking for the demo customer (paid online)
  const b1 = await createBooking(cu, { roomId: twin.id, unit: "BED", bedsCount: 1, checkIn: addDays(today, 7), checkOut: addDays(today, 12), adults: 1, children: 0, services: ["FOOD"], couponCode: "STUDENT15", guests: [{ name: customer.name, phone: customer.phone, gender: "FEMALE" }], acceptTerms: true, paymentOption: "FULL" });
  const [p1] = await db.select().from(t.payments).where(eq(t.payments.bookingId, b1.bookingId));
  await capturePayment({ providerOrderId: p1!.providerOrderId!, providerPaymentId: "mock_pay_live_1", amount: p1!.amount, method: "upi" });
  // 2) Current stay: checked in today at Hitech Suites (entire room)
  const hitechRoom = hitech.rooms[0]!;
  const b2 = await createBooking(cu, { roomId: hitechRoom.id, unit: "ROOM", bedsCount: 1, checkIn: today, checkOut: addDays(today, 3), adults: 2, children: 0, services: [], guests: [{ name: customer.name, gender: "FEMALE" }, { name: "Rakesh Sharma", gender: "MALE" }], acceptTerms: true, paymentOption: "FULL" });
  const [p2] = await db.select().from(t.payments).where(eq(t.payments.bookingId, b2.bookingId));
  await capturePayment({ providerOrderId: p2!.providerOrderId!, providerPaymentId: "mock_pay_live_2", amount: p2!.amount, method: "card" });
  await checkIn(b2.bookingId, staff.id, { idVerified: true, idDocType: "AADHAAR", idNumber: "123412341234" });
  // 3) Other guests: arrivals today & tomorrow at the owner's properties
  const g = others.map((o) => ({ id: o.id, name: o.name, email: o.email, phone: o.phone }));
  const b3 = await createBooking(g[0]!, { roomId: coliving.rooms[2]!.id, unit: "BED", bedsCount: 1, checkIn: today, checkOut: addDays(today, 30), adults: 1, children: 0, services: ["FOOD", "LAUNDRY"], guests: [{ name: g[0]!.name, gender: "MALE" }], acceptTerms: true, paymentOption: "PARTIAL" });
  const [p3] = await db.select().from(t.payments).where(eq(t.payments.bookingId, b3.bookingId));
  await capturePayment({ providerOrderId: p3!.providerOrderId!, providerPaymentId: "mock_pay_live_3", amount: p3!.amount, method: "upi" });
  await createBooking(g[1]!, { roomId: createdProps[2]!.rooms[0]!.id, unit: "BED", bedsCount: 1, checkIn: addDays(today, 1), checkOut: addDays(today, 31), adults: 1, children: 0, services: [], guests: [{ name: g[1]!.name, gender: "FEMALE" }], acceptTerms: true, paymentOption: "PAY_AT_PROPERTY" });
  // 4) A booking left awaiting payment (inventory held) to show the hold state
  await createBooking(g[2]!, { roomId: coliving.rooms[3]!.id, unit: "BED", bedsCount: 2, checkIn: addDays(today, 3), checkOut: addDays(today, 8), adults: 2, children: 0, services: [], guests: [{ name: g[2]!.name, gender: "MALE" }, { name: "Friend", gender: "MALE" }], acceptTerms: true, paymentOption: "FULL" });

  // ── support tickets ──
  const tk = await nextTicketNumber();
  const [ticket] = await db.insert(t.supportTickets).values({ ticketNumber: tk, raisedById: customer.id, bookingId: b1.bookingId, category: "BOOKING", subject: "Can I get a bottom bunk?", description: "Hi, I have a knee injury — could you please assign a lower bunk for my upcoming stay?", priority: "MEDIUM", status: "IN_PROGRESS", assignedToId: ops.id }).returning();
  await db.insert(t.supportMessages).values([
    { ticketId: ticket!.id, authorId: ops.id, body: "Hi Priya, we've asked the property to assign a lower bed. We'll confirm shortly." },
    { ticketId: ticket!.id, authorId: ops.id, body: "Property confirmed bed A is a lower bed.", isInternal: true },
  ]);
  await db.insert(t.supportTickets).values({ ticketNumber: await nextTicketNumber(), raisedById: owner.id, raisedByRole: "OWNER", category: "OWNER_PAYOUT", subject: "Settlement cycle question", description: "Can we move to a weekly settlement cycle?", priority: "LOW", status: "OPEN" });

  await db.insert(t.auditLogs).values({ actorId: admin.id, action: "seed.complete", entityType: "system", after: { note: "Demo data loaded" } });
  console.log("\n✔ Seed complete. DEVELOPMENT-ONLY demo accounts:");
  console.table([
    { role: "Super admin", email: "admin@stayshare.demo", password: "DemoAdmin@123" },
    { role: "Ops admin", email: "ops@stayshare.demo", password: "DemoAdmin@123" },
    { role: "Finance admin (custom role)", email: "finance@stayshare.demo", password: "DemoAdmin@123" },
    { role: "Property owner", email: "owner@stayshare.demo", password: "DemoOwner@123" },
    { role: "Owner (KYC pending)", email: "owner2@stayshare.demo", password: "DemoOwner@123" },
    { role: "Property staff", email: "staff@stayshare.demo", password: "DemoStaff@123" },
    { role: "Customer", email: "customer@stayshare.demo", password: "DemoCustomer@123" },
  ]);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });
