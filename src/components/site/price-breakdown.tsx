import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";

export type Line = { key: string; label: string; amount: number; kind: "charge" | "discount" | "tax" | "deposit" | "info" | string };

/** Full price breakdown with charges, discounts, taxes, deposit and total. */
export function PriceBreakdown({ lines, total, paid, refunded, className, totalLabel = "Total payable" }: { lines: Line[]; total: number; paid?: number; refunded?: number; className?: string; totalLabel?: string }) {
  const visible = lines.filter((l) => l.kind !== "info" || l.amount !== 0);
  return (
    <dl className={cn("space-y-1.5 text-sm", className)}>
      {visible.map((l, i) => (
        <div key={`${l.key}-${i}`} className="flex items-start justify-between gap-3">
          <dt className={cn("text-slate-600", l.kind === "info" && "text-xs text-slate-500", l.kind === "deposit" && "text-slate-700")}>
            {l.label}
            {l.kind === "deposit" && <span className="ml-1 text-xs text-slate-400">(refundable)</span>}
          </dt>
          <dd className={cn("shrink-0 tabular-nums", l.kind === "discount" ? "font-medium text-emerald-700" : "text-slate-900", l.kind === "info" && "text-xs text-slate-500")}>
            {l.kind === "discount" ? `− ${formatINR(Math.abs(l.amount))}` : l.kind === "info" ? (l.amount ? formatINR(l.amount) : "") : formatINR(l.amount)}
          </dd>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-dashed border-slate-200 pt-2 text-base font-bold">
        <dt>{totalLabel}</dt>
        <dd className="tabular-nums">{formatINR(total)}</dd>
      </div>
      {paid !== undefined && (
        <div className="flex items-center justify-between text-sm">
          <dt className="text-slate-600">Paid</dt>
          <dd className="tabular-nums font-medium text-emerald-700">{formatINR(paid)}</dd>
        </div>
      )}
      {refunded !== undefined && refunded > 0 && (
        <div className="flex items-center justify-between text-sm">
          <dt className="text-slate-600">Refunded</dt>
          <dd className="tabular-nums font-medium text-violet-700">{formatINR(refunded)}</dd>
        </div>
      )}
      {paid !== undefined && total - paid > 0 && (
        <div className="flex items-center justify-between text-sm">
          <dt className="text-slate-600">Balance due</dt>
          <dd className="tabular-nums font-semibold text-amber-700">{formatINR(total - paid)}</dd>
        </div>
      )}
    </dl>
  );
}
