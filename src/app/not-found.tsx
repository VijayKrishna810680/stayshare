import Link from "next/link";
import { House, MapPinOff, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-screen place-items-center bg-slate-50 px-4 py-16 text-center">
      <div>
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <House className="h-5 w-5" aria-hidden />
          </span>
          Stay<span className="-ml-2 text-brand-600">Share</span>
        </Link>
        <span className="mx-auto mt-10 grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600">
          <MapPinOff className="h-8 w-8" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-brand-700">404</p>
        <h1 className="mt-1 text-3xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-600">The link may be broken, or the stay you&apos;re looking for is no longer listed.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            <House className="h-4 w-4" aria-hidden /> Go home
          </Link>
          <Link href="/search" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
            <Search className="h-4 w-4" aria-hidden /> Search stays
          </Link>
        </div>
      </div>
    </main>
  );
}
