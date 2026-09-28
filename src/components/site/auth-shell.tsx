import Link from "next/link";
import { BadgeCheck, BedDouble, ShieldCheck } from "lucide-react";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="container-page grid min-h-[calc(100vh-4rem)] items-center gap-10 py-10 lg:grid-cols-2">
      <div className="hidden lg:block">
        <div className="rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-10 text-white shadow-xl">
          <h2 className="text-3xl font-bold leading-tight text-white">Flexible stays. Affordable sharing. Comfortable living.</h2>
          <ul className="mt-8 space-y-4 text-white/90">
            <li className="flex gap-3"><ShieldCheck className="h-6 w-6 shrink-0 text-accent-400" aria-hidden /> Every property is verified by the StayShare team</li>
            <li className="flex gap-3"><BedDouble className="h-6 w-6 shrink-0 text-accent-400" aria-hidden /> Book one bed, a private room or the whole family room</li>
            <li className="flex gap-3"><BadgeCheck className="h-6 w-6 shrink-0 text-accent-400" aria-hidden /> Transparent prices with a full breakdown before you pay</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
        <p className="mt-4 text-center text-xs text-slate-500">
          By continuing you agree to our <Link href="/pages/terms" className="underline">Terms</Link> and <Link href="/pages/privacy" className="underline">Privacy policy</Link>.
        </p>
      </div>
    </div>
  );
}

export function GoogleButton({ next }: { next?: string }) {
  return (
    <a href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1S8.7 5.7 12 5.7c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.3 6.6 2.3 12s4.3 9.8 9.7 9.8c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
      </svg>
      Continue with Google
    </a>
  );
}
