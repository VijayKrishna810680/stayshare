import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, couponUsage, coupons, users } from "@/db/schema";
import { prettyDateTime } from "@/lib/dates";
import { Money, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ResourcePage } from "../_lib/resource-page";
import { cityOptions, propertyOptions } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coupons" };

export default async function Page() {
  const [cities, properties, usage] = await Promise.all([
    cityOptions(),
    propertyOptions(),
    db
      .select({ id: couponUsage.id, code: coupons.code, user: users.name, bookingId: bookings.id, bookingNumber: bookings.bookingNumber, discount: couponUsage.discount, at: couponUsage.createdAt, fundedBy: coupons.fundedBy })
      .from(couponUsage)
      .innerJoin(coupons, eq(coupons.id, couponUsage.couponId))
      .innerJoin(users, eq(users.id, couponUsage.userId))
      .leftJoin(bookings, eq(bookings.id, couponUsage.bookingId))
      .orderBy(desc(couponUsage.createdAt))
      .limit(100),
  ]);
  return (
    <ResourcePage
      resource="coupons"
      title="Coupons & promotions"
      description="Percentage or flat discounts with caps, minimums, validity, usage limits and city/property/unit restrictions. Property-funded coupons reduce the owner's payout; platform-funded ones do not."
      options={{ cities, properties }}
      after={
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent redemptions</h2>
            <Link href="/admin/reports?report=coupons" className="text-sm text-brand-700 hover:underline">
              Full coupon report
            </Link>
          </div>
          {!usage.length ? (
            <p className="text-sm text-slate-500">No coupon redemptions yet.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Coupon</TH>
                  <TH>Customer</TH>
                  <TH>Booking</TH>
                  <TH>Funded by</TH>
                  <TH className="text-right">Discount</TH>
                </tr>
              </THead>
              <TBody>
                {usage.map((u) => (
                  <TR key={u.id}>
                    <TD className="whitespace-nowrap text-xs">{prettyDateTime(u.at)}</TD>
                    <TD>
                      <code className="text-xs">{u.code}</code>
                    </TD>
                    <TD>{u.user}</TD>
                    <TD>{u.bookingId ? <Link href={`/admin/bookings/${u.bookingId}`} className="text-brand-700 hover:underline">{u.bookingNumber}</Link> : "—"}</TD>
                    <TD className="text-xs">{u.fundedBy.toLowerCase()}</TD>
                    <TD className="text-right">
                      <Money paise={u.discount} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </section>
      }
    />
  );
}
