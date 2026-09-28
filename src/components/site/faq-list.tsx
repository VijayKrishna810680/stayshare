import { ChevronDown } from "lucide-react";
import { Markdown } from "./markdown";

/** Accessible accordion using native <details>/<summary>. */
export function FaqList({ items }: { items: { id: string; question: string; answer: string }[] }) {
  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {items.map((f) => (
        <details key={f.id} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-slate-900 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            {f.question}
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-5 pb-5 text-sm">
            <Markdown source={f.answer} className="space-y-2 text-sm" />
          </div>
        </details>
      ))}
    </div>
  );
}
