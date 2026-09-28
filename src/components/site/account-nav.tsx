"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarCheck, ChevronRight, Crown, FileText, Heart, LayoutDashboard, LifeBuoy, LogOut, ReceiptIndianRupee, Star, User, Users } from "lucide-react";
import { cn } from "@/lib/cn";

export const ACCOUNT_LINKS = [
  { href: "/account", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/account/bookings", label: "My bookings", icon: CalendarCheck },
  { href: "/account/refunds", label: "Refunds", icon: ReceiptIndianRupee },
  { href: "/account/favourites", label: "Saved properties", icon: Heart },
  { href: "/account/reviews", label: "My reviews", icon: Star },
  { href: "/account/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
  { href: "/account/support", label: "Help & support", icon: LifeBuoy },
  { href: "/account/profile", label: "Profile & security", icon: User },
  { href: "/account/documents", label: "ID documents", icon: FileText },
  { href: "/account/guests", label: "Saved guests", icon: Users },
  { href: "/account/subscriptions", label: "StayShare Plus", icon: Crown },
] as const;

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

export function AccountSidebar({ name, unread }: { name: string; unread: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="card sticky top-20 hidden p-2 lg:block">
      <p className="truncate px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{name}</p>
      <ul className="space-y-0.5">
        {ACCOUNT_LINKS.map((l) => {
          const active = "exact" in l && l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium", active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")}>
                <l.icon className="h-4 w-4" aria-hidden />
                <span className="flex-1">{l.label}</span>
                {"badge" in l && unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
              </Link>
            </li>
          );
        })}
        <li>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Mobile: the account menu as a list (shown on the overview page). */
export function AccountMobileList({ unread }: { unread: number }) {
  return (
    <nav aria-label="Account menu" className="card divide-y divide-slate-100 overflow-hidden lg:hidden">
      {ACCOUNT_LINKS.slice(1).map((l) => (
        <Link key={l.href} href={l.href} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-slate-700 active:bg-slate-50">
          <l.icon className="h-5 w-5 text-slate-400" aria-hidden />
          <span className="flex-1">{l.label}</span>
          {"badge" in l && unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
          <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
        </Link>
      ))}
      <button onClick={logout} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-red-600">
        <LogOut className="h-5 w-5" aria-hidden /> Log out
      </button>
    </nav>
  );
}

/** Mobile back link to the account menu on sub-pages. */
export function AccountBack() {
  const pathname = usePathname();
  if (pathname === "/account") return null;
  return (
    <Link href="/account" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 lg:hidden">
      <ChevronRight className="h-4 w-4 rotate-180" aria-hidden /> Account
    </Link>
  );
}
