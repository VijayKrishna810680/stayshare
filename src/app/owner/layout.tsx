import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ownerProfiles } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { DashboardShell, type NavItem } from "@/components/layout/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Partner portal", template: "%s · Partner portal · StayShare" } };

const NAV: NavItem[] = [
  { href: "/owner", label: "Dashboard", icon: "LayoutDashboard", exact: true },
  { href: "/owner/properties", label: "Properties", icon: "Building2", section: "Business" },
  { href: "/owner/bookings", label: "Bookings", icon: "CalendarCheck", section: "Business" },
  { href: "/owner/guests", label: "Guests", icon: "Users", section: "Business" },
  { href: "/owner/check-in", label: "Check-in", icon: "LogIn", section: "Business" },
  { href: "/owner/check-out", label: "Check-out", icon: "LogOut", section: "Business" },
  { href: "/owner/earnings", label: "Earnings", icon: "IndianRupee", section: "Money" },
  { href: "/owner/payouts", label: "Payouts", icon: "Landmark", section: "Money" },
  { href: "/owner/reports", label: "Reports", icon: "ChartColumn", section: "Money" },
  { href: "/owner/staff", label: "Staff accounts", icon: "UserCog", section: "Account" },
  { href: "/owner/kyc", label: "Documents & KYC", icon: "ShieldCheck", section: "Account" },
  { href: "/owner/bank", label: "Bank & UPI", icon: "Wallet", section: "Account" },
  { href: "/owner/subscription", label: "Partner plan", icon: "Crown", section: "Account" },
  { href: "/owner/notifications", label: "Notifications", icon: "Bell", section: "Account" },
  { href: "/owner/support", label: "Support", icon: "LifeBuoy", section: "Account" },
  { href: "/owner/settings", label: "Settings", icon: "Settings", section: "Account" },
  { href: "/staff", label: "Front-desk tools", icon: "ConciergeBell", section: "Operations" },
];

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const u = await pageUser({ role: "OWNER", next: "/owner" });
  const [op] = await db.select({ businessName: ownerProfiles.businessName }).from(ownerProfiles).where(eq(ownerProfiles.userId, u.id));
  return (
    <DashboardShell title="Partner portal" subtitle={op?.businessName ?? u.name} nav={NAV} user={{ name: u.name, role: "Property partner" }}>
      <div id="main">{children}</div>
    </DashboardShell>
  );
}
