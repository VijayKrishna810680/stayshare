import { pageUser } from "@/lib/auth/page";
import { deskContext, toLookupRows } from "@/lib/owner-data";
import { arrivalsDepartures } from "@/services/owner-reports";
import { EmptyState, PageHeader } from "@/components/ui";
import { CheckOutDesk } from "@/components/staff/check-out";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-out" };

export default async function OwnerCheckOut({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const sp = await searchParams;
  const ctx = await deskContext(u);
  if (!ctx.properties.length) return <EmptyState title="No properties yet" />;
  const { inHouse } = await arrivalsDepartures(ctx.scope);
  return (
    <>
      <PageHeader title="Check-out" description="Inspect, settle charges against the deposit and complete the stay." />
      <CheckOutDesk initialQuery={sp.q} inHouse={toLookupRows(inHouse)} />
    </>
  );
}
