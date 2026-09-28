import Link from "next/link";
import { and, desc, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { properties, reviewReplies, reviews, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Badge, EmptyState, PageHeader, Pagination, StatusBadge } from "@/components/ui";
import { ActionButton, FilterBar } from "@/components/admin/widgets";
import { one, pageArgs, propertyOptions, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  await pageUser({ perm: "reviews.moderate" });
  const sp = await searchParams;
  const { page, pageSize, offset } = pageArgs(sp, 20);
  const conds: SQL[] = [];
  if (one(sp.status)) conds.push(eq(reviews.status, one(sp.status) as "PUBLISHED"));
  if (one(sp.reported) === "1") conds.push(gt(reviews.reportCount, 0));
  if (one(sp.property)) conds.push(eq(reviews.propertyId, one(sp.property)));
  if (one(sp.rating)) conds.push(sql`${reviews.overall} <= ${Number(one(sp.rating))}`);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total, props] = await Promise.all([
    db.select({ r: reviews, prop: properties.name, customer: users.name }).from(reviews).innerJoin(properties, eq(properties.id, reviews.propertyId)).innerJoin(users, eq(users.id, reviews.customerId)).where(where).orderBy(desc(reviews.reportCount), desc(reviews.createdAt)).limit(pageSize).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    propertyOptions(),
  ]);
  const replies = rows.length ? await db.select({ rp: reviewReplies, author: users.name }).from(reviewReplies).innerJoin(users, eq(users.id, reviewReplies.authorId)).where(inArray(reviewReplies.reviewId, rows.map((x) => x.r.id))) : [];
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader title="Reviews" description="Publish or hide reviews, handle reports and remove inappropriate replies. Property ratings are recalculated from published reviews after every change." />
      <FilterBar
        fields={[
          { name: "status", label: "Status", type: "select", options: ["PUBLISHED", "PENDING", "HIDDEN"].map((s) => ({ value: s, label: s.toLowerCase() })) },
          { name: "reported", label: "Reports", type: "select", options: [{ value: "1", label: "Reported only" }] },
          { name: "rating", label: "Rating", type: "select", options: [1, 2, 3].map((n) => ({ value: String(n), label: `≤ ${n} stars` })) },
          { name: "property", label: "Property", type: "select", options: props },
        ]}
      />
      {!rows.length ? (
        <EmptyState title="No reviews match" />
      ) : (
        <div className="space-y-4">
          {rows.map(({ r, prop, customer }) => (
            <article key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {"★".repeat(r.overall)}
                    <span className="text-slate-300">{"★".repeat(5 - r.overall)}</span> {r.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {customer} · <Link href={`/admin/properties/${r.propertyId}`} className="hover:underline">{prop}</Link> · {prettyDateTime(r.createdAt)} ·{" "}
                    <Link href={`/admin/bookings/${r.bookingId}`} className="hover:underline">
                      booking
                    </Link>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={r.status} />
                  {r.reportCount > 0 && <Badge tone="red">{r.reportCount} report(s)</Badge>}
                  {r.status !== "PUBLISHED" && <ActionButton url={`/api/admin/reviews/${r.id}`} method="PATCH" body={{ status: "PUBLISHED" }} label="Publish" variant="primary" success="Review published" />}
                  {r.status !== "HIDDEN" && <ActionButton url={`/api/admin/reviews/${r.id}`} method="PATCH" body={{ status: "HIDDEN" }} label="Hide" danger confirm="Hide this review from the site?" success="Review hidden" />}
                  {r.reportCount > 0 && <ActionButton url={`/api/admin/reviews/${r.id}`} method="PATCH" body={{ clearReports: true }} label="Dismiss reports" success="Reports dismissed" />}
                </div>
              </div>
              {r.text && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.text}</p>}
              <p className="mt-2 text-xs text-slate-500">
                Cleanliness {r.cleanliness} · Location {r.location} · Staff {r.staff} · Facilities {r.facilities} · Value {r.valueForMoney} · Safety {r.safety}
                {r.foodQuality != null && ` · Food ${r.foodQuality}`}
              </p>
              {r.reportReasons.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                  {r.reportReasons.map((x, i) => (
                    <li key={i}>{x.reason}</li>
                  ))}
                </ul>
              )}
              {replies
                .filter((x) => x.rp.reviewId === r.id)
                .map(({ rp, author }) => (
                  <div key={rp.id} className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <p>
                      <span className="font-medium">{author}:</span> {rp.text}
                    </p>
                    <ActionButton url={`/api/admin/review-replies/${rp.id}`} method="DELETE" label="Delete reply" danger confirm="Delete this reply?" success="Reply deleted" />
                  </div>
                ))}
            </article>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/reviews" query={query} />
    </>
  );
}
