import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, payments, properties, subscriptions } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { env } from "@/lib/env";
import { EmptyState, LinkButton } from "@/components/ui";
import { MockGateway } from "@/components/site/mock-gateway";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test payment gateway", robots: { index: false } };

export default async function MockPayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await pageUser({ next: `/pay/mock/${orderId}` });
  const [p] = await db.select().from(payments).where(eq(payments.providerOrderId, orderId));
  let ownerId = p?.userId ?? null;
  let returnTo: string | undefined;
  let context: { title: string; subtitle: string; holdExpiresAt: string | null; bookingId: string | null } = { title: "Payment", subtitle: "", holdExpiresAt: null, bookingId: null };
  if (p?.bookingId) {
    const [b] = await db.select({ customerId: bookings.customerId, number: bookings.bookingNumber, lock: bookings.lockExpiresAt, prop: properties.name }).from(bookings).innerJoin(properties, eq(properties.id, bookings.propertyId)).where(eq(bookings.id, p.bookingId));
    ownerId = b?.customerId ?? null;
    context = { title: b?.prop ?? "Booking", subtitle: `Booking ${b?.number ?? ""} · ${p.purpose === "BOOKING" ? "Stay payment" : p.purpose === "EXTENSION" ? "Stay extension" : p.purpose.toLowerCase().replace(/_/g, " ")}`, holdExpiresAt: p.purpose === "BOOKING" ? (b?.lock?.toISOString() ?? null) : null, bookingId: p.bookingId };
  } else if (p?.subscriptionId) {
    const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, p.subscriptionId));
    if (s?.audience === "OWNER") returnTo = "/owner/subscription";
    context = { title: s?.planSnapshot.name ?? "Subscription", subtitle: "Membership purchase", holdExpiresAt: null, bookingId: null };
  }
  if (!p || (ownerId !== user.id && !user.isAdmin)) {
    return (
      <div className="container-page py-12">
        <EmptyState title="Payment not found" description="This payment link is invalid or belongs to another account." action={<LinkButton href="/account/bookings">My bookings</LinkButton>} />
      </div>
    );
  }
  return (
    <div className="container-page max-w-lg py-10">
      <MockGateway
        orderId={orderId}
        amount={p.amount}
        status={p.status}
        enabled={env.paymentProvider === "mock"}
        context={context}
        purpose={p.purpose}
        subscription={Boolean(p.subscriptionId)}
        returnTo={returnTo}
      />
    </div>
  );
}
