import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { faqs } from "@/db/schema";
import { humanize } from "@/lib/site/labels";
import { Breadcrumbs, EmptyState } from "@/components/ui";
import { FaqList } from "@/components/site/faq-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Frequently asked questions" };

export default async function FaqPage() {
  const rows = await db.select().from(faqs).where(eq(faqs.active, true)).orderBy(asc(faqs.category), asc(faqs.sortOrder));
  const groups = rows.reduce<Record<string, typeof rows>>((a, f) => ((a[f.category] ??= []).push(f), a), {});
  return (
    <div className="container-page max-w-3xl py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "FAQs" }]} />
      <h1 className="text-3xl font-bold">Frequently asked questions</h1>
      <p className="mt-2 text-slate-600">
        Can&apos;t find your answer?{" "}
        <Link href="/contact" className="font-medium text-brand-700 underline">
          Contact support
        </Link>
        .
      </p>
      <div className="mt-8 space-y-8">
        {rows.length === 0 && <EmptyState title="No FAQs yet" />}
        {Object.entries(groups).map(([cat, items]) => (
          <section key={cat} aria-labelledby={`faq-${cat}`}>
            {Object.keys(groups).length > 1 && (
              <h2 id={`faq-${cat}`} className="mb-3 text-lg font-semibold">
                {humanize(cat)}
              </h2>
            )}
            <FaqList items={items} />
          </section>
        ))}
      </div>
    </div>
  );
}
