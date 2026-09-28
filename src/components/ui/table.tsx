import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
      </div>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</thead>;
}
export function TH({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th scope="col" className={cn("px-4 py-3", className)}>{children}</th>;
}
export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}
export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tr className={cn("hover:bg-slate-50/60", className)}>{children}</tr>;
}
export function TD({ className, children, colSpan }: { className?: string; children?: React.ReactNode; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

/** Server-friendly pagination using query-string links. */
export function Pagination({ page, pageSize, total, basePath, query = {} }: { page: number; pageSize: number; total: number; basePath: string; query?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-xs text-slate-500">{total} result{total === 1 ? "" : "s"}</p>;
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...query, page: String(p) }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    return `${basePath}?${q.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      <p className="text-slate-500">
        Page {page} of {pages} · {total} results
      </p>
      <div className="flex gap-2">
        <Link aria-disabled={page <= 1} className={cn("inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5", page <= 1 && "pointer-events-none opacity-40")} href={href(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Link>
        <Link aria-disabled={page >= pages} className={cn("inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5", page >= pages && "pointer-events-none opacity-40")} href={href(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </nav>
  );
}
