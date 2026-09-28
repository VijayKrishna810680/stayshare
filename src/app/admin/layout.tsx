import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { StepUpProvider } from "@/components/admin/step-up";
import { pageUser } from "@/lib/auth/page";
import { navFor } from "./_lib/nav";

export const metadata: Metadata = { title: { default: "Admin console", template: "%s · StayShare Admin" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await pageUser({ perm: "admin.access", next: "/admin" });
  const role = u.isSuperAdmin ? "Super administrator" : u.roles.includes("ADMIN") ? "Administrator" : (u.roles.find((r) => !["CUSTOMER", "OWNER", "STAFF"].includes(r)) ?? "Admin").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return (
    <DashboardShell title="Admin console" subtitle="StayShare platform" accent="slate" nav={navFor(u.perms)} user={{ name: u.name, role }}>
      <StepUpProvider>
        <div id="main">{children}</div>
      </StepUpProvider>
    </DashboardShell>
  );
}
