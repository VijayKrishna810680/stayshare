"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, House, MessageCircle, Search, User } from "lucide-react";
import { cn } from "@/lib/cn";

export const OPEN_CHAT_EVENT = "ss:open-chat";

/** Bottom tab bar for phones (and the Android app shell). */
export function MobileBottomNav({ chatEnabled }: { chatEnabled: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", icon: House, active: pathname === "/" },
    { href: "/search", label: "Search", icon: Search, active: pathname.startsWith("/search") },
    { href: "/account/bookings", label: "Bookings", icon: CalendarCheck, active: pathname.startsWith("/account/bookings") },
    { href: "#chat", label: "Chat", icon: MessageCircle, active: false, chat: true },
    { href: "/account", label: "Account", icon: User, active: pathname.startsWith("/account") && !pathname.startsWith("/account/bookings") },
  ];
  return (
    <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const inner = (
            <>
              <it.icon className={cn("h-5 w-5", it.active ? "text-brand-600" : "text-slate-500")} aria-hidden />
              <span className={cn("mt-0.5 text-[11px] font-medium", it.active ? "text-brand-700" : "text-slate-500")}>{it.label}</span>
            </>
          );
          return (
            <li key={it.label}>
              {it.chat ? (
                <button
                  type="button"
                  onClick={() => (chatEnabled ? window.dispatchEvent(new Event(OPEN_CHAT_EVENT)) : (window.location.href = "/contact"))}
                  className="flex w-full flex-col items-center py-2"
                >
                  {inner}
                </button>
              ) : (
                <Link href={it.href} aria-current={it.active ? "page" : undefined} className="flex flex-col items-center py-2">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
