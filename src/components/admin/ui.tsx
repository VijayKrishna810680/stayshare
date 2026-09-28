import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";

/** Server-friendly link tabs (active tab passed in). */
export function LinkTabs({ tabs, active, className }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <div className={cn("mb-4 overflow-x-auto border-b border-slate-200", className)}>
      <nav className="-mb-px flex min-w-max gap-1" aria-label="Tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={cn("inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium", t.key === active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700")}
          >
            {t.label}
            {t.count !== undefined && <span className={cn("rounded-full px-1.5 text-xs", t.count > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500")}>{t.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}

type Pt = { label: string; value: number };
const fmt = (v: number, money?: boolean) => (money ? formatINR(v) : v.toLocaleString("en-IN"));
const short = (v: number, money?: boolean) => {
  const x = money ? v / 100 : v;
  if (Math.abs(x) >= 1e7) return (x / 1e7).toFixed(1) + "Cr";
  if (Math.abs(x) >= 1e5) return (x / 1e5).toFixed(1) + "L";
  if (Math.abs(x) >= 1e3) return (x / 1e3).toFixed(1) + "k";
  return String(Math.round(x));
};

/** Simple responsive SVG bar chart (no chart library). */
export function BarChart({ data, money, height = 180, title, color = "#1c7b6e" }: { data: Pt[]; money?: boolean; height?: number; title: string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 600;
  const pad = { l: 36, r: 8, t: 8, b: 22 };
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const h = height - pad.t - pad.b;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        <title>{title}</title>
        {ticks.map((t, i) => {
          const y = pad.t + h - (t / max) * h;
          return (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={i ? "3 3" : undefined} />
              <text x={pad.l - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">
                {short(t, money)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const bh = (d.value / max) * h;
          const x = pad.l + i * bw + bw * 0.15;
          return (
            <g key={d.label}>
              <rect x={x} y={pad.t + h - bh} width={bw * 0.7} height={Math.max(bh, d.value > 0 ? 1 : 0)} rx={2} fill={color}>
                <title>{`${d.label}: ${fmt(d.value, money)}`}</title>
              </rect>
              {(data.length <= 12 || i % Math.ceil(data.length / 10) === 0) && (
                <text x={x + bw * 0.35} y={height - 6} textAnchor="middle" fontSize="9" fill="#64748b">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Simple SVG line/area chart. */
export function LineChart({ data, money, height = 180, title, color = "#f29a1f" }: { data: Pt[]; money?: boolean; height?: number; title: string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 600;
  const pad = { l: 40, r: 8, t: 8, b: 22 };
  const h = height - pad.t - pad.b;
  const step = (W - pad.l - pad.r) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => [pad.l + i * step, pad.t + h - (d.value / max) * h] as const);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = pts.length ? `${path} L${pts[pts.length - 1]![0]},${pad.t + h} L${pts[0]![0]},${pad.t + h} Z` : "";
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        <title>{title}</title>
        {[0, 0.5, 1].map((f, i) => {
          const y = pad.t + h - f * h;
          return (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={i ? "3 3" : undefined} />
              <text x={pad.l - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">
                {short(f * max, money)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={color} opacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={color}>
            <title>{`${data[i]!.label}: ${fmt(data[i]!.value, money)}`}</title>
          </circle>
        ))}
        {data.map((d, i) =>
          i % Math.ceil(data.length / 8) === 0 ? (
            <text key={d.label} x={pad.l + i * step} y={height - 6} textAnchor="middle" fontSize="9" fill="#64748b">
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}

/** Horizontal bars for rankings (top cities / properties). */
export function RankBars({ data, money }: { data: Pt[]; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-slate-500">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate text-slate-700">{d.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{fmt(d.value, money)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "red" | "amber" }) {
  const t = { slate: "bg-slate-100 text-slate-600", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-800" }[tone];
  return <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium", t)}>{children}</span>;
}

/** Minimal, safe markdown → React (headings, lists, bold/italic, paragraphs, links). No raw HTML. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = source.replace(/\r/g, "").split(/\n{2,}/);
  const inline = (s: string, k: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const t = m[0];
      if (t.startsWith("**")) out.push(<strong key={`${k}-${i++}`}>{t.slice(2, -2)}</strong>);
      else if (t.startsWith("[")) {
        const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
        const href = /^(https?:|\/|mailto:|tel:)/.test(mm[2]!) ? mm[2]! : "#";
        out.push(
          <a key={`${k}-${i++}`} href={href} className="text-brand-700 underline" rel="noopener noreferrer">
            {mm[1]}
          </a>,
        );
      } else out.push(<em key={`${k}-${i++}`}>{t.slice(1, -1)}</em>);
      last = m.index + t.length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-slate-700", className)}>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (/^#{1,3} /.test(b)) {
          const lvl = b.match(/^#+/)![0].length;
          const text = b.replace(/^#+ /, "");
          return lvl === 1 ? (
            <h2 key={bi} className="text-xl font-bold">
              {inline(text, `h${bi}`)}
            </h2>
          ) : (
            <h3 key={bi} className="text-base font-semibold">
              {inline(text, `h${bi}`)}
            </h3>
          );
        }
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*] /, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+\. /.test(l))) {
          return (
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*\d+\. /, ""), `${bi}-${li}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
