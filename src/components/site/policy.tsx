import { ShieldCheck } from "lucide-react";

type Tier = { hoursBeforeCheckIn: number; refundBps: number };

function hoursLabel(h: number) {
  if (h === 0) return "check-in time";
  if (h % 24 === 0) return `${h / 24} day${h / 24 > 1 ? "s" : ""}`;
  return `${h} hours`;
}

/** Human explanation of cancellation tiers (highest hours first). */
export function PolicyTiers({ tiers, name, description }: { tiers: Tier[]; name?: string; description?: string }) {
  const sorted = [...tiers].sort((a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn);
  return (
    <div>
      {name && (
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden /> {name} policy
        </p>
      )}
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <ol className="mt-3 space-y-2">
        {sorted.map((t, i) => {
          const upper = i > 0 ? sorted[i - 1]!.hoursBeforeCheckIn : null;
          const when =
            i === 0 && t.hoursBeforeCheckIn > 0
              ? `Cancel ${hoursLabel(t.hoursBeforeCheckIn)} or more before check-in`
              : t.hoursBeforeCheckIn === 0
                ? upper !== null
                  ? `Cancel less than ${hoursLabel(upper)} before check-in`
                  : "Any time before check-in"
                : `Cancel between ${hoursLabel(t.hoursBeforeCheckIn)} and ${hoursLabel(upper ?? t.hoursBeforeCheckIn)} before check-in`;
          const pct = t.refundBps / 100;
          return (
            <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-700">{when}</span>
              <span className={pct === 100 ? "font-semibold text-emerald-700" : pct === 0 ? "font-semibold text-red-600" : "font-semibold text-amber-700"}>{pct === 0 ? "No refund" : `${pct}% refund`}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-slate-500">Security deposits are always refunded in full if you cancel before check-in. Convenience fees are non-refundable unless stated.</p>
    </div>
  );
}
