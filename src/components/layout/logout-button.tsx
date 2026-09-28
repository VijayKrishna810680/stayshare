"use client";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function LogoutButton({ className, compact }: { className?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
      className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", compact && "justify-center", className)}
    >
      <LogOut className="h-4 w-4" />
      {!compact && "Log out"}
    </button>
  );
}
