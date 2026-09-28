import { pageUser } from "@/lib/auth/page";
import { deskContext, loadBoard } from "@/lib/owner-data";
import { EmptyState, PageHeader } from "@/components/ui";
import { PropertyPicker, RoomsBoard } from "@/components/staff/board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rooms & beds" };

export default async function StaffBoard({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await pageUser({ role: ["STAFF", "OWNER"] });
  const sp = await searchParams;
  const ctx = await deskContext(u, sp.p, true);
  if (!ctx.selected) return <EmptyState title="No properties assigned" description="Ask your property owner to assign you to a property." />;
  const rooms = await loadBoard(ctx.selected);
  return (
    <>
      <PageHeader title="Rooms & beds" description="Housekeeping status for every room and bed. Updates instantly for the whole team." actions={<PropertyPicker properties={ctx.properties} value={ctx.selected} />} />
      <RoomsBoard rooms={rooms} />
    </>
  );
}
