"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";

/** Run an API mutation with loading state, error toast, optional success toast and a router refresh. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, opts: { success?: string; refresh?: boolean } = {}): Promise<T | undefined> => {
      setPending(key);
      try {
        const out = await fn();
        if (opts.success) toast.success(opts.success);
        if (opts.refresh !== false) router.refresh();
        return out;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        return undefined;
      } finally {
        setPending(null);
      }
    },
    [router],
  );
  return { run, pending, busy: (k: string) => pending === k };
}

export const call = <T = unknown,>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST", json?: unknown) => apiFetch<T>(url, { method, json });

export function TabNav({ tabs, active, basePath, param = "tab", query = {} }: { tabs: { key: string; label: string; count?: number }[]; active: string; basePath: string; param?: string; query?: Record<string, string | undefined | null> }) {
  const extra = Object.entries(query)
    .filter(([, v]) => v)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v!)}`)
    .join("");
  return (
    <div className="mb-6 overflow-x-auto border-b border-slate-200 scrollbar-none">
      <nav className="-mb-px flex min-w-max gap-1" aria-label="Tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`${basePath}?${param}=${t.key}${extra}`}
            aria-current={active === t.key ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function ExportLinks({ href, label = "Export" }: { href: string; label?: string }) {
  const sep = href.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 hidden text-sm text-slate-500 sm:inline">{label}:</span>
      {(["csv", "xlsx", "pdf"] as const).map((f) => (
        <a key={f} href={`${href}${sep}format=${f}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50" download>
          <Download className="h-3.5 w-3.5" aria-hidden /> {f === "xlsx" ? "Excel" : f.toUpperCase()}
        </a>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3", disabled && "opacity-60")}>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

export { humanize } from "./format";
