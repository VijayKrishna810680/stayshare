"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { cn } from "@/lib/cn";
import { LogoutButton } from "./logout-button";

export type NavItem = { href: string; label: string; icon: keyof typeof Icons; section?: string; exact?: boolean };

/**
 * Responsive dashboard frame with a collapsible sidebar (desktop) and a slide-over drawer (mobile).
 * Icons are passed by lucide name so server layouts can define nav arrays.
 */
export function DashboardShell({ title, subtitle, nav, user, children, accent = "brand" }: { title: string; subtitle?: string; nav: NavItem[]; user: { name: string; role: string }; children: React.ReactNode; accent?: "brand" | "slate" }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ss_sidebar") === "1");
    } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("ss_sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };
  const sections = nav.reduce<Record<string, NavItem[]>>((acc, n) => {
    (acc[n.section ?? ""] ??= []).push(n);
    return acc;
  }, {});
  const isActive = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/"));
  const side = (
    <nav className="flex h-full flex-col" aria-label={`${title} navigation`}>
      <div className={cn("flex h-16 items-center gap-2 border-b px-4", accent === "slate" ? "border-slate-800" : "border-brand-800")}>
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
            <Icons.House className="h-4 w-4" />
          </span>
          {!collapsed && <span>StayShare</span>}
        </Link>
      </div>
      {!collapsed && (
        <div className="px-4 pt-4">
          <p className="text-xs uppercase tracking-wider text-white/60">{title}</p>
          {subtitle && <p className="truncate text-sm text-white/90">{subtitle}</p>}
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
        {Object.entries(sections).map(([sec, items]) => (
          <div key={sec}>
            {sec && !collapsed && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">{sec}</p>}
            <ul className="space-y-0.5">
              {items.map((n) => {
                const Icon = (Icons[n.icon] ?? Icons.Circle) as React.ComponentType<{ className?: string }>;
                const active = isActive(n);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      title={collapsed ? n.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", active ? "bg-white text-slate-900 shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white", collapsed && "justify-center px-2")}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{n.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className={cn("border-t p-3", accent === "slate" ? "border-slate-800" : "border-brand-800")}>
        {!collapsed && (
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="text-xs text-white/60">{user.role}</p>
          </div>
        )}
        <LogoutButton className={cn("w-full text-white/85 hover:bg-white/10 hover:text-white", collapsed && "px-0")} compact={collapsed} />
      </div>
    </nav>
  );
  const bg = accent === "slate" ? "bg-slate-900" : "bg-brand-900";
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden transition-[width] lg:block", bg, collapsed ? "w-[72px]" : "w-64")}>{side}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className={cn("absolute inset-y-0 left-0 w-72", bg)}>{side}</aside>
        </div>
      )}
      <div className={cn("transition-[padding]", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Icons.Menu className="h-5 w-5" />
          </button>
          <button onClick={toggle} className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:block" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <Icons.PanelLeftOpen className="h-5 w-5" /> : <Icons.PanelLeftClose className="h-5 w-5" />}
          </button>
          <p className="font-semibold text-slate-800">{title}</p>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="hidden text-sm text-slate-600 hover:text-brand-700 sm:block">
              View site
            </Link>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
