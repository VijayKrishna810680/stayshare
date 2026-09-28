import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Star } from "lucide-react";
import { db } from "@/db";
import { bookings, properties, reviewReplies, reviews } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate } from "@/lib/dates";
import { listMyBookings } from "@/lib/site/bookings";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { Img } from "@/components/ui/img";
import { Stars } from "@/components/site/stars";
import { ReviewForm } from "@/components/site/booking-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My reviews" };

export default async function MyReviewsPage() {
  const user = await pageUser({ next: "/account/reviews" });
  const rows = await db
    .select({ r: reviews, property: properties.name, slug: properties.slug, bookingNumber: bookings.bookingNumber })
    .from(reviews)
    .innerJoin(properties, eq(properties.id, reviews.propertyId))
    .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
    .where(eq(reviews.customerId, user.id))
    .orderBy(desc(reviews.createdAt));
  const replies = rows.length ? await db.select().from(reviewReplies).where(inArray(reviewReplies.reviewId, rows.map((x) => x.r.id))) : [];
  const toReview = (await listMyBookings(user.id, ["CHECKED_OUT", "COMPLETED"])).filter((b) => !b.reviewed);
  return (
    <div className="space-y-6">
      <PageHeader title="My reviews" breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Reviews" }]} />
      {toReview.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold">Waiting for your review</h2>
          <ul className="mt-3 space-y-3">
            {toReview.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <Img src={b.image} alt="" fallback="/images/placeholder-building.svg" className="h-12 w-12 rounded-lg" />
                  <span>
                    <span className="block text-sm font-medium">{b.propertyName}</span>
                    <span className="block text-xs text-slate-500">
                      {prettyDate(b.checkIn)} – {prettyDate(b.checkOut)}
                    </span>
                  </span>
                </span>
                <ReviewForm bookingId={b.id} propertyName={b.propertyName} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<Star className="h-6 w-6" />} title="You haven't written any reviews yet" description="After your stay, share your experience to help other guests." action={<LinkButton href="/account/bookings?tab=past">Past stays</LinkButton>} />
      ) : (
        <ul className="space-y-4">
          {rows.map(({ r, property, slug, bookingNumber }) => (
            <li key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/property/${slug}`} className="font-semibold hover:text-brand-700">
                    {property}
                  </Link>
                  <p className="text-xs text-slate-500">
                    Booking {bookingNumber} · {prettyDate(r.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Stars value={r.overall} />
                  <StatusBadge status={r.status} />
                </div>
              </div>
              {r.title && <p className="mt-3 font-medium">{r.title}</p>}
              {r.text && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{r.text}</p>}
              {r.images.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {r.images.map((u) => (
                    <Img key={u} src={u} alt="Review photo" className="h-16 w-16 rounded-lg" />
                  ))}
                </div>
              )}
              {replies
                .filter((x) => x.reviewId === r.id)
                .map((x) => (
                  <p key={x.id} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <span className="block text-xs font-semibold text-slate-500">Property response</span>
                    {x.text}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
