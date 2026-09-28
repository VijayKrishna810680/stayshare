import { pageUser } from "@/lib/auth/page";
import { DashboardShell, type NavItem } from "@/components/layout/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Front desk", template: "%s · Front desk · StayShare" } };

const NAV: NavItem[] = [
  { href: "/staff", label: "Today", icon: "LayoutDashboard", exact: true },
  { href: "/staff/check-in", label: "Check-in", icon: "LogIn", section: "Front desk" },
  { href: "/staff/check-out", label: "Check-out", icon: "LogOut", section: "Front desk" },
  { href: "/staff/guests", label: "Guests & arrivals", icon: "Users", section: "Front desk" },
  { href: "/staff/board", label: "Rooms & beds", icon: "BedDouble", section: "Housekeeping" },
  { href: "/staff/maintenance", label: "Maintenance", icon: "Wrench", section: "Housekeeping" },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const u = await pageUser({ role: ["STAFF", "OWNER"], next: "/staff" });
  const nav = u.isOwner ? [...NAV, { href: "/owner", label: "Partner portal", icon: "Building2", section: "Switch" } as NavItem] : NAV;
  return (
    <DashboardShell title="Front desk" subtitle={u.isOwner ? "Owner access" : "Property staff"} nav={nav} user={{ name: u.name, role: u.isOwner ? "Property partner" : "Property staff" }}>
      <div id="main">{children}</div>
    </DashboardShell>
  );
}
