"use client";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/cn";

/** Live mm:ss countdown for the inventory hold / payment window. */
export function HoldCountdown({ until, className, onExpire, label = "Your beds are held for" }: { until: string | null | undefined; className?: string; onExpire?: () => void; label?: string }) {
  const [left, setLeft] = useState(() => (until ? new Date(until).getTime() - Date.now() : 0));
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => {
      const l = new Date(until).getTime() - Date.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [until, onExpire]);
  if (!until) return null;
  const s = Math.max(0, Math.floor(left / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const expired = s <= 0;
  return (
    <p role="timer" aria-live="off" className={cn("inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium", expired ? "bg-red-50 text-red-700" : s < 120 ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-800", className)}>
      <Timer className="h-4 w-4" aria-hidden />
      {expired ? "Payment window expired — the hold has been released" : (
        <>
          {label} <span className="tabular-nums font-bold">{mm}:{ss}</span>
        </>
      )}
    </p>
  );
}
