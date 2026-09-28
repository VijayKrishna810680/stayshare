import { pageUser } from "@/lib/auth/page";
import { deskContext, toLookupRows } from "@/lib/owner-data";
import { todayIST } from "@/lib/dates";
import { upcomingArrivals } from "@/services/owner-reports";
import { EmptyState, PageHeader } from "@/components/ui";
import { CheckInDesk } from "@/components/staff/check-in";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-in" };

export default async function StaffCheckIn({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const u = await pageUser({ role: ["STAFF", "OWNER"] });
  const sp = await searchParams;
  const ctx = await deskContext(u, sp.p);
  if (!ctx.properties.length) return <EmptyState title="No properties assigned" description="Ask your property owner to assign you to a property." />;
  const arrivals = await upcomingArrivals(ctx.scope, 0);
  return (
    <>
      <PageHeader title="Check-in" description="Find the booking, verify ID, confirm beds and collect any balance." />
      <CheckInDesk initialQuery={sp.q} arrivals={toLookupRows(arrivals)} today={todayIST()} />
    </>
  );
}
