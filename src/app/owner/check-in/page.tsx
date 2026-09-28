import { pageUser } from "@/lib/auth/page";
import { deskContext, toLookupRows } from "@/lib/owner-data";
import { todayIST } from "@/lib/dates";
import { upcomingArrivals } from "@/services/owner-reports";
import { EmptyState, PageHeader } from "@/components/ui";
import { CheckInDesk } from "@/components/staff/check-in";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-in" };

export default async function OwnerCheckIn({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const sp = await searchParams;
  const ctx = await deskContext(u);
  if (!ctx.properties.length) return <EmptyState title="No properties yet" />;
  const arrivals = await upcomingArrivals(ctx.scope, 0);
  return (
    <>
      <PageHeader title="Check-in" description="Search by booking number or phone, or scan the guest's booking QR." />
      <CheckInDesk initialQuery={sp.q} arrivals={toLookupRows(arrivals)} today={todayIST()} />
    </>
  );
}
