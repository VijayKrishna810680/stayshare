import type { NavItem } from "@/components/layout/dashboard-shell";
import type { PermissionKey } from "@/lib/rbac";

/** Admin navigation; each item is shown only when the user holds ANY of its permissions. */
export const ADMIN_NAV: (NavItem & { perms: PermissionKey[] })[] = [
  { href: "/admin", label: "Dashboard", icon: "LayoutDashboard", section: "Overview", exact: true, perms: ["admin.access"] },
  { href: "/admin/approvals", label: "Approvals", icon: "ClipboardCheck", section: "Operations", perms: ["properties.approve", "kyc.approve"] },
  { href: "/admin/properties", label: "Properties", icon: "Building2", section: "Operations", perms: ["properties.view", "properties.manage"] },
  { href: "/admin/availability", label: "Availability", icon: "CalendarRange", section: "Operations", perms: ["properties.manage"] },
  { href: "/admin/bookings", label: "Bookings", icon: "CalendarCheck", section: "Operations", perms: ["bookings.view"] },
  { href: "/admin/pricing", label: "Pricing", icon: "IndianRupee", section: "Pricing & policies", perms: ["pricing.manage"] },
  { href: "/admin/taxes", label: "Taxes", icon: "Receipt", section: "Pricing & policies", perms: ["taxes.manage"] },
  { href: "/admin/commissions", label: "Commissions", icon: "Percent", section: "Pricing & policies", perms: ["commissions.manage"] },
  { href: "/admin/coupons", label: "Coupons", icon: "TicketPercent", section: "Pricing & policies", perms: ["coupons.manage"] },
  { href: "/admin/policies", label: "Cancellation policies", icon: "ShieldAlert", section: "Pricing & policies", perms: ["policies.manage"] },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: "Crown", section: "Pricing & policies", perms: ["pricing.manage", "users.manage"] },
  { href: "/admin/payments", label: "Payments", icon: "CreditCard", section: "Finance", perms: ["payments.view"] },
  { href: "/admin/refunds", label: "Refunds", icon: "Undo2", section: "Finance", perms: ["refunds.approve"] },
  { href: "/admin/payouts", label: "Payouts", icon: "Wallet", section: "Finance", perms: ["payouts.manage"] },
  { href: "/admin/reports", label: "Reports", icon: "ChartColumn", section: "Finance", perms: ["reports.view"] },
  { href: "/admin/users/customers", label: "Customers", icon: "Users", section: "People", perms: ["users.view"] },
  { href: "/admin/users/owners", label: "Property owners", icon: "Briefcase", section: "People", perms: ["users.view", "kyc.approve"] },
  { href: "/admin/users/staff", label: "Staff", icon: "UserCheck", section: "People", perms: ["users.view"] },
  { href: "/admin/admins", label: "Administrators", icon: "UserCog", section: "People", perms: ["admins.manage"] },
  { href: "/admin/reviews", label: "Reviews", icon: "Star", section: "Engagement", perms: ["reviews.moderate"] },
  { href: "/admin/support", label: "Support tickets", icon: "LifeBuoy", section: "Engagement", perms: ["support.manage"] },
  { href: "/admin/chat", label: "Live chat", icon: "MessagesSquare", section: "Engagement", perms: ["livechat.manage", "support.manage"] },
  { href: "/admin/notifications", label: "Notifications", icon: "Bell", section: "Engagement", perms: ["content.manage"] },
  { href: "/admin/catalog/cities", label: "Cities", icon: "MapPin", section: "Catalogue & content", perms: ["content.manage"] },
  { href: "/admin/catalog/localities", label: "Localities", icon: "Map", section: "Catalogue & content", perms: ["content.manage"] },
  { href: "/admin/catalog/facilities", label: "Facilities", icon: "Sparkles", section: "Catalogue & content", perms: ["content.manage"] },
  { href: "/admin/catalog/property-types", label: "Property types", icon: "House", section: "Catalogue & content", perms: ["content.manage"] },
  { href: "/admin/content/banners", label: "Banners", icon: "Image", section: "Catalogue & content", perms: ["content.manage"] },
  { href: "/admin/content/faqs", label: "FAQs", icon: "CircleHelp", section: "Catalogue & content", perms: ["content.manage"] },
  { href: "/admin/content/pages", label: "Content pages", icon: "FileText", section: "Catalogue & content", perms: ["content.manage"] },
  { href: "/admin/settings", label: "Settings", icon: "Settings", section: "System", perms: ["settings.manage"] },
  { href: "/admin/audit", label: "Audit logs", icon: "ScrollText", section: "System", perms: ["audit.view"] },
];

export function navFor(perms: string[]): NavItem[] {
  return ADMIN_NAV.filter((n) => n.perms.some((p) => perms.includes(p))).map(({ perms: _p, ...n }) => {
    void _p;
    return n;
  });
}
