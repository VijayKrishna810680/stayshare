import { notFound } from "next/navigation";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { cities, priceHistory, pricePlans, properties, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDateTime } from "@/lib/dates";
import { Badge, Card, CardBody, CardHeader, DescList, Money, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { PricingEditor } from "@/components/admin/pricing-editor";
import { ActionButton } from "@/components/admin/widgets";
import { roomPricingFrom } from "../../../_lib/pricing-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room pricing" };

const moneyField = (f: string) => !["daysOfWeek", "unit", "scope", "scopeId", "adjustmentType", "ruleType", "active", "startDate", "endDate", "minNights", "priority"].includes(f);

export default async function RoomPricingPage({ params }: { params: Promise<{ roomId: string }> }) {
  await pageUser({ perm: "pricing.manage" });
  const { roomId } = await params;
  const [r] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!r) notFound();
  const [p] = await db.select({ id: properties.id, name: properties.name, code: properties.code, status: properties.approvalStatus, city: cities.name }).from(properties).innerJoin(cities, eq(cities.id, properties.cityId)).where(eq(properties.id, r.propertyId));
  const data = await roomPricingFrom(r);
  const [similar, plans, history] = await Promise.all([
    db.select({ id: rooms.id, roomNumber: rooms.roomNumber, name: rooms.name }).from(rooms).where(and(eq(rooms.propertyId, r.propertyId), eq(rooms.category, r.category), eq(rooms.sharingCapacity, r.sharingCapacity), eq(rooms.isAC, r.isAC), ne(rooms.id, r.id), isNull(rooms.deletedAt))),
    db.select().from(pricePlans).where(eq(pricePlans.roomId, r.id)).orderBy(desc(pricePlans.createdAt)).limit(20),
    db.select({ h: priceHistory, by: users.name }).from(priceHistory).leftJoin(users, eq(users.id, priceHistory.changedBy)).where(and(eq(priceHistory.entityType, "ROOM"), eq(priceHistory.entityId, r.id))).orderBy(desc(priceHistory.createdAt)).limit(60),
  ]);
  return (
    <>
      <PageHeader
        title={`Pricing · Room ${r.roomNumber}`}
        description={`${p?.name} (${p?.code}) · ${p?.city}`}
        breadcrumbs={[{ label: "Pricing", href: "/admin/pricing" }, { label: p?.name ?? "Property", href: `/admin/properties/${r.propertyId}` }, { label: `Room ${r.roomNumber}` }]}
        actions={
          <>
            {p?.status !== "APPROVED" && (
              <a href={`/admin/approvals/${r.propertyId}`} className="inline-flex h-8 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
                Back to property review
              </a>
            )}
            {similar.length > 0 && data.plan && (
              <ActionButton
                url="/api/admin/pricing/copy"
                body={{ roomId: r.id }}
                label={`Copy plan to ${similar.length} similar room${similar.length > 1 ? "s" : ""}`}
                confirm={`Copy this plan to rooms ${similar.map((s) => s.roomNumber).join(", ")}?`}
                note={{ field: "reason", label: "Reason", required: true, placeholder: "Same pricing for identical rooms" }}
                success="Plan copied"
              />
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Price plan editor" description={data.planMeta ? `Active plan since ${prettyDateTime(data.planMeta.effectiveFrom)}` : "No active plan"} action={<StatusBadge status={r.approvalStatus} />} />
          <CardBody>
            <PricingEditor key={data.planMeta?.id ?? "new"} room={data.room} plan={data.plan} suggestion={data.suggestion} />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Room" />
            <CardBody>
              <DescList
                items={[
                  { label: "Category", value: r.category.toLowerCase() },
                  { label: "Sharing / beds", value: `${r.sharingCapacity} / ${r.totalBeds}` },
                  { label: "Max occupancy", value: r.maxOccupancy },
                  { label: "AC", value: r.isAC ? "Yes" : "No" },
                  { label: "Bathroom", value: r.bathroom.toLowerCase() },
                  { label: "Gender", value: r.genderEligibility.replace("_", " ").toLowerCase() },
                ]}
              />
              {similar.length > 0 && <p className="mt-4 text-xs text-slate-500">Similar rooms (same category, sharing & AC): {similar.map((s) => s.roomNumber).join(", ")}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Plan versions" />
            <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {plans.map((pl) => (
                <div key={pl.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">
                      {pl.name} {pl.active && <Badge tone="green">Active</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {prettyDateTime(pl.effectiveFrom)} → {pl.effectiveTo ? prettyDateTime(pl.effectiveTo) : "open"}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    {pl.nightlyBed != null && (
                      <p>
                        Bed <Money paise={pl.nightlyBed} />
                      </p>
                    )}
                    {pl.nightlyRoom != null && (
                      <p>
                        Room <Money paise={pl.nightlyRoom} />
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {!plans.length && <p className="px-5 py-4 text-sm text-slate-500">No plans yet.</p>}
            </div>
          </Card>
        </div>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Price history</h2>
      {history.length ? (
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Field</TH>
              <TH className="text-right">Old</TH>
              <TH className="text-right">New</TH>
              <TH>Reason</TH>
              <TH>By</TH>
            </tr>
          </THead>
          <TBody>
            {history.map(({ h, by }) => (
              <TR key={h.id}>
                <TD className="whitespace-nowrap text-xs">{prettyDateTime(h.createdAt)}</TD>
                <TD>
                  <code className="text-xs">{h.field}</code>
                </TD>
                <TD className="text-right">{h.oldValue == null ? "—" : moneyField(h.field) ? <Money paise={Number(h.oldValue)} /> : h.oldValue}</TD>
                <TD className="text-right">{h.newValue == null ? "—" : moneyField(h.field) ? <Money paise={Number(h.newValue)} /> : h.newValue}</TD>
                <TD className="max-w-xs text-xs">{h.reason}</TD>
                <TD className="text-xs">{by ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <p className="text-sm text-slate-500">No price changes recorded yet.</p>
      )}
    </>
  );
}
