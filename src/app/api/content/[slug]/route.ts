import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentPages } from "@/db/schema";
import { api } from "@/lib/api";
import { notFound } from "@/lib/errors";

/** Public CMS page (markdown body). */
export const GET = api<{ slug: string }>(async (_req, { params }) => {
  const [p] = await db.select({ slug: contentPages.slug, title: contentPages.title, body: contentPages.body, updatedAt: contentPages.updatedAt }).from(contentPages).where(eq(contentPages.slug, params.slug));
  if (!p) throw notFound("Page not found");
  return p;
});
