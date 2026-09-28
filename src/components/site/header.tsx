"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, Crown, House, LayoutDashboard, LogOut, MapPin, Menu, ShieldCheck, User, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/site/labels";

export type HeaderUser = { name: string; isAdmin: boolean; isOwner: boolean; isStaff: boolean } | null;

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-bold text-slate-900", className)} aria-label="StayShare home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
        <House className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-lg tracking-tight">
        Stay<span className="text-brand-600">Share</span>
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/search", label: "Stays" },
  { href: "/search?stay=monthly", label: "Monthly" },
  { href: "/partner", label: "Partner with us" },
  { href: "/plus", label: "Plus membership" },
];

function CityPicker({ cities }: { cities: { name: string; slug: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const current = pathname === "/search" ? (sp.get("city") ?? "") : "";
  return (
    <label className="relative hidden items-center md:flex">
      <span className="sr-only">Choose city</span>
      <MapPin className="pointer-events-none absolute left-2.5 h-4 w-4 text-brand-600" aria-hidden />
      <select
        value={current}
        onChange={(e) => router.push(e.target.value ? `/search?city=${e.target.value}` : "/search")}
        className="h-9 appearance-none rounded-full border border-slate-200 bg-white pl-8 pr-7 text-sm font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <option value="">All cities</option>
        {cities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400" aria-hidden />
    </label>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

function UserMenu({ user }: { user: NonNullable<HeaderUser> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const links = [
    { href: "/account", label: "My account", icon: User },
    { href: "/account/bookings", label: "My bookings", icon: LayoutDashboard },
    ...(user.isOwner ? [{ href: "/owner", label: "Owner portal", icon: Building2 }] : []),
    ...(user.isStaff ? [{ href: "/staff", label: "Staff portal", icon: Users }] : []),
    ...(user.isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-medium hover:shadow-sm">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{initials(user.name)}</span>
        <span className="hidden max-w-[8rem] truncate sm:inline">{user.name.split(" ")[0]}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{user.name}</span>
          </p>
          {links.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <l.icon className="h-4 w-4 text-slate-400" aria-hidden />
              {l.label}
            </Link>
          ))}
          <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function SiteHeader({ user, cities }: { user: HeaderUser; cities: { name: string; slug: string }[] }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  useEffect(() => setDrawer(false), [pathname]);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="container-page flex h-16 items-center gap-4">
        <Logo />
        <Suspense fallback={null}>
          <CityPicker cities={cities} />
        </Suspense>
        <nav aria-label="Main" className="ml-2 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900", pathname === n.href.split("?")[0] && n.href.indexOf("?") < 0 && "text-brand-700")}>
              {n.label === "Plus membership" ? (
                <span className="inline-flex items-center gap-1">
                  <Crown className="h-3.5 w-3.5 text-accent-500" aria-hidden /> {n.label}
                </span>
              ) : (
                n.label
              )}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              <Link href={`/login${pathname && pathname !== "/" && !pathname.startsWith("/login") ? `?next=${encodeURIComponent(pathname)}` : ""}`} className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:block">
                Log in
              </Link>
              <Link href="/register" className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                Sign up
              </Link>
            </>
          )}
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85%] flex-col bg-white shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <Logo />
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3" aria-label="Mobile">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-xl px-3 py-3 font-medium text-slate-700 hover:bg-slate-50">
                  {n.label}
                </Link>
              ))}
              <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Cities</p>
              <div className="mt-2 flex flex-wrap gap-2 px-3">
                {cities.map((c) => (
                  <Link key={c.slug} href={`/search?city=${c.slug}`} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:border-brand-300">
                    {c.name}
                  </Link>
                ))}
              </div>
            </nav>
            <div className="border-t border-slate-100 p-4">
              {user ? (
                <div className="space-y-1">
                  <Link href="/account" className="block rounded-xl px-3 py-2 font-medium hover:bg-slate-50">My account</Link>
                  {user.isOwner && <Link href="/owner" className="block rounded-xl px-3 py-2 font-medium hover:bg-slate-50">Owner portal</Link>}
                  {user.isStaff && <Link href="/staff" className="block rounded-xl px-3 py-2 font-medium hover:bg-slate-50">Staff portal</Link>}
                  {user.isAdmin && <Link href="/admin" className="block rounded-xl px-3 py-2 font-medium hover:bg-slate-50">Admin</Link>}
                  <button onClick={logout} className="block w-full rounded-xl px-3 py-2 text-left font-medium text-red-600 hover:bg-red-50">Log out</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/login" className="rounded-xl border border-slate-300 py-2.5 text-center font-medium">Log in</Link>
                  <Link href="/register" className="rounded-xl bg-brand-600 py-2.5 text-center font-semibold text-white">Sign up</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
