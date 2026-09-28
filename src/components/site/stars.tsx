import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

export function RatingPill({ value, count, className }: { value: number; count?: number; className?: string }) {
  if (!value) return <span className={cn("text-xs font-medium text-slate-500", className)}>New</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">
        {value.toFixed(1)} <Star className="h-3 w-3 fill-white" aria-hidden />
      </span>
      {count !== undefined && <span className="text-xs text-slate-500">({count} review{count === 1 ? "" : "s"})</span>}
    </span>
  );
}

export function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(s, i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-slate-300")} aria-hidden />
      ))}
    </span>
  );
}
