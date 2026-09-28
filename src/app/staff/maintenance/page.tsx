import { pageUser } from "@/lib/auth/page";
import { deskContext, loadMaintenance } from "@/lib/owner-data";
import { todayIST } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/ui";
import { PropertyPicker } from "@/components/staff/board";
import { MaintenanceBoard } from "@/components/staff/maintenance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Maintenance" };

export default async function StaffMaintenance({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await pageUser({ role: ["STAFF", "OWNER"] });
  const sp = await searchParams;
  const ctx = await deskContext(u, sp.p);
  if (!ctx.properties.length) return <EmptyState title="No properties assigned" />;
  const m = await loadMaintenance(ctx.scope);
  const props = ctx.selected ? ctx.properties.filter((p) => p.id === ctx.selected) : ctx.properties;
  return (
    <>
      <PageHeader title="Maintenance" description="Report and track repairs. Take rooms out of service so they aren't sold." actions={<PropertyPicker properties={ctx.properties} value={ctx.selected ?? ""} allowAll />} />
      <MaintenanceBoard properties={props} rooms={m.rooms} issues={m.issues} fixedPropertyId={ctx.selected ?? undefined} today={todayIST()} />
    </>
  );
}
