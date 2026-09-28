import { pageUser } from "@/lib/auth/page";
import { deskContext, toLookupRows } from "@/lib/owner-data";
import { arrivalsDepartures } from "@/services/owner-reports";
import { EmptyState, PageHeader } from "@/components/ui";
import { CheckOutDesk } from "@/components/staff/check-out";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-out" };

export default async function StaffCheckOut({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const u = await pageUser({ role: ["STAFF", "OWNER"] });
  const sp = await searchParams;
  const ctx = await deskContext(u, sp.p);
  if (!ctx.properties.length) return <EmptyState title="No properties assigned" description="Ask your property owner to assign you to a property." />;
  const { inHouse } = await arrivalsDepartures(ctx.scope);
  return (
    <>
      <PageHeader title="Check-out" description="Inspect the room, add charges, settle the deposit and complete the stay." />
      <CheckOutDesk initialQuery={sp.q} inHouse={toLookupRows(inHouse)} />
    </>
  );
}
