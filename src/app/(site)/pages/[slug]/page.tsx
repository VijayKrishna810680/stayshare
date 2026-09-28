import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentPages } from "@/db/schema";
import { prettyDate } from "@/lib/dates";
import { Breadcrumbs } from "@/components/ui";
import { Markdown } from "@/components/site/markdown";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const [p] = await db.select().from(contentPages).where(eq(contentPages.slug, slug));
  return p ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  return { title: p?.title ?? "Page not found" };
}

export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  return (
    <div className="container-page max-w-3xl py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: p.title }]} />
      <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-3xl font-bold">{p.title}</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated {prettyDate(p.updatedAt)}</p>
        <div className="mt-6">
          <Markdown source={p.body} />
        </div>
      </article>
    </div>
  );
}
