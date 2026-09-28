import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { beds, rooms } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { loadPropertyAssets, loadPropertyMeta, ownedPropertyOr404, toPropertyInfo } from "@/lib/owner-data";
import { PageHeader, StatusBadge } from "@/components/ui";
import { PropertyWizard, WIZARD_STEPS, type WizardStep } from "@/components/owner/property-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Property setup" };

export default async function SetupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const u = await pageUser({ role: "OWNER" });
  const { id } = await params;
  const sp = await searchParams;
  const p = await ownedPropertyOr404(u.id, id);
  const step = (WIZARD_STEPS.find((s) => s.key === sp.step)?.key ?? "basic") as WizardStep;
  const [meta, assets] = await Promise.all([loadPropertyMeta(), loadPropertyAssets(p.id)]);
  const [rc] = await db.select({ n: count(rooms.id) }).from(rooms).where(and(eq(rooms.propertyId, p.id), isNull(rooms.deletedAt)));
  const [bc] = await db.select({ n: count(beds.id) }).from(beds).innerJoin(rooms, eq(rooms.id, beds.roomId)).where(and(eq(rooms.propertyId, p.id), isNull(beds.deletedAt), isNull(rooms.deletedAt)));
  return (
    <>
      <PageHeader
        title={p.name}
        description={
          <span className="flex items-center gap-2">
            {p.code} <StatusBadge status={p.approvalStatus} />
          </span>
        }
        breadcrumbs={[{ label: "Properties", href: "/owner/properties" }, { label: p.name, href: `/owner/properties/${p.id}` }, { label: "Setup" }]}
      />
      <PropertyWizard
        meta={meta}
        step={step}
        property={toPropertyInfo(p)}
        facilitySel={assets.facilitySel}
        customFacilities={assets.customFacilities}
        rules={assets.rules}
        images={assets.images}
        docs={assets.documents}
        roomCount={Number(rc?.n ?? 0)}
        bedCount={Number(bc?.n ?? 0)}
      />
    </>
  );
}
