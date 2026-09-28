import Link from "next/link";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ownerProfiles, properties } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate } from "@/lib/dates";
import { Badge, EmptyState, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar, Toggle } from "@/components/admin/widgets";
import { one, type SearchParams } from "../../_lib/query";
import { listUsersWithRole, STATUS_OPTS } from "../../_lib/users";

export const dynamic = "force-dynamic";
export const metadata = { title: "Property owners" };

export default async function OwnersPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: ["users.view", "kyc.approve"] });
  const sp = await searchParams;
  const { rows, total, page, pageSize } = await listUsersWithRole("OWNER", sp);
  const ids = rows.map((r) => r.id);
  const [profiles, props] = ids.length
    ? await Promise.all([
        db.select().from(ownerProfiles).where(inArray(ownerProfiles.userId, ids)),
        db.select({ ownerId: properties.ownerId, n: sql<number>`count(*)::int`, live: sql<number>`count(*) filter (where ${properties.approvalStatus} = 'APPROVED')::int` }).from(properties).where(inArray(properties.ownerId, ids)).groupBy(properties.ownerId),
      ])
    : [[], []];
  const kyc = one(sp.kyc);
  const shown = kyc ? rows.filter((r) => profiles.find((p) => p.userId === r.id)?.kycStatus === kyc) : rows;
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader title="Property owners" description="Partners who list properties. Review KYC and bank details, and control whether a partner may set final prices." />
      <FilterBar
        fields={[
          { name: "q", label: "Search", type: "text", placeholder: "Name, email or phone" },
          { name: "status", label: "Account", type: "select", options: STATUS_OPTS },
          { name: "kyc", label: "KYC", type: "select", options: ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) },
        ]}
      />
      {!shown.length ? (
        <EmptyState title="No owners found" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Owner</TH>
              <TH>Business</TH>
              <TH>Properties</TH>
              <TH>KYC</TH>
              <TH>Bank</TH>
              <TH>Final pricing</TH>
              <TH>Account</TH>
            </tr>
          </THead>
          <TBody>
            {shown.map((o) => {
              const p = profiles.find((x) => x.userId === o.id);
              const c = props.find((x) => x.ownerId === o.id);
              return (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/admin/users/owners/${o.id}`} className="font-medium text-brand-700 hover:underline">
                      {o.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {o.email ?? o.phone} · since {prettyDate(o.createdAt)}
                    </p>
                  </TD>
                  <TD className="text-sm">{p?.businessName ?? "—"}</TD>
                  <TD className="text-sm">
                    {c?.n ?? 0} <span className="text-xs text-slate-500">({c?.live ?? 0} live)</span>
                  </TD>
                  <TD>
                    <StatusBadge status={p?.kycStatus} />
                  </TD>
                  <TD>{p?.bankVerified ? <Badge tone="green">Verified</Badge> : p?.bankAccountLast4 || p?.upiId ? <Badge tone="amber">Unverified</Badge> : <Badge>None</Badge>}</TD>
                  <TD>{p && (u.has("pricing.manage") || u.has("users.manage")) ? <Toggle url={`/api/admin/owners/${o.id}`} field="canSetFinalPrice" value={p.canSetFinalPrice} label="Allowed" /> : p?.canSetFinalPrice ? "Yes" : "No"}</TD>
                  <TD>
                    <StatusBadge status={o.status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/users/owners" query={query} />
    </>
  );
}
