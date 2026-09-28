import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cancellationPolicies, cities, properties } from "@/db/schema";
import { StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { SelectAction } from "@/components/admin/widgets";
import { ResourcePage } from "../_lib/resource-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cancellation policies" };

export default async function Page() {
  const [policies, props] = await Promise.all([
    db.select({ id: cancellationPolicies.id, name: cancellationPolicies.name, active: cancellationPolicies.active }).from(cancellationPolicies).orderBy(asc(cancellationPolicies.name)),
    db.select({ id: properties.id, name: properties.name, code: properties.code, city: cities.name, policyId: properties.cancellationPolicyId, status: properties.approvalStatus }).from(properties).innerJoin(cities, eq(cities.id, properties.cityId)).where(isNull(properties.deletedAt)).orderBy(asc(properties.name)),
  ]);
  const opts = policies.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));
  return (
    <ResourcePage
      resource="cancellation-policies"
      title="Cancellation & refund policies"
      description="Refund tiers by hours before check-in, no-show charge, early-checkout refund and whether the convenience fee is refunded. Bookings snapshot the policy at the time of booking, so edits apply to new bookings only."
      after={
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold">Policy per property</h2>
          <p className="mb-3 text-sm text-slate-500">Choose which policy applies to each property. Changes are saved immediately and audited.</p>
          <Table>
            <THead>
              <tr>
                <TH>Property</TH>
                <TH>City</TH>
                <TH>Status</TH>
                <TH>Cancellation policy</TH>
              </tr>
            </THead>
            <TBody>
              {props.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.code}</p>
                  </TD>
                  <TD>{p.city}</TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                  <TD>
                    <SelectAction url={`/api/admin/properties/${p.id}/policy`} method="POST" field="cancellationPolicyId" value={p.policyId} options={opts} label={`Policy for ${p.name}`} allowEmpty="— Not set —" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      }
    />
  );
}
