import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cities, fileUploads, identityDocuments, ownerProfiles, properties, staffProfiles, subscriptionPlans, subscriptions, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { Alert, Badge, Card, CardBody, CardHeader, DescList, Money, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, FormDialogButton, Toggle } from "@/components/admin/widgets";
import { ownerBalance } from "@/services/settlement";
import { StatusButton } from "../../status-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Property owner" };

export default async function OwnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser({ perm: ["users.view", "kyc.approve"] });
  const { id } = await params;
  const [row] = await db.select({ u: users, op: ownerProfiles }).from(users).innerJoin(ownerProfiles, eq(ownerProfiles.userId, users.id)).where(eq(users.id, id));
  if (!row) notFound();
  const { u, op } = row;
  const [props, docs, subs, staff, bal] = await Promise.all([
    db.select({ p: properties, city: cities.name }).from(properties).innerJoin(cities, eq(cities.id, properties.cityId)).where(and(eq(properties.ownerId, id), isNull(properties.deletedAt))),
    db.select({ d: identityDocuments, fileName: fileUploads.fileName }).from(identityDocuments).leftJoin(fileUploads, eq(fileUploads.id, identityDocuments.fileId)).where(and(eq(identityDocuments.userId, id), isNull(identityDocuments.deletedAt))),
    db.select({ s: subscriptions, plan: subscriptionPlans.name }).from(subscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId)).where(eq(subscriptions.userId, id)).orderBy(desc(subscriptions.createdAt)).limit(5),
    db.select({ name: users.name, email: users.email, designation: staffProfiles.designation, active: staffProfiles.active }).from(staffProfiles).innerJoin(users, eq(users.id, staffProfiles.userId)).where(eq(staffProfiles.employerId, id)),
    me.has("payouts.manage") ? ownerBalance(id) : Promise.resolve(null),
  ]);
  const canKyc = me.has("kyc.approve");
  return (
    <>
      <PageHeader
        title={u.name}
        description={`${op.businessName}${op.businessType ? ` · ${op.businessType}` : ""}`}
        breadcrumbs={[{ label: "Property owners", href: "/admin/users/owners" }, { label: u.name }]}
        actions={
          <>
            {canKyc && op.kycStatus !== "APPROVED" && <ActionButton url={`/api/admin/owners/${id}/kyc`} body={{ action: "approve" }} label="Approve KYC" variant="primary" confirm="Approve this owner's KYC?" note={{ field: "notes", label: "Notes (optional)" }} success="KYC approved — owner notified" />}
            {canKyc && op.kycStatus !== "REJECTED" && <ActionButton url={`/api/admin/owners/${id}/kyc`} body={{ action: "reject" }} label="Reject KYC" danger note={{ field: "notes", label: "Reason (shared with owner)", required: true }} success="KYC rejected — owner notified" />}
            {me.has("users.manage") && <StatusButton id={id} status={u.status} />}
          </>
        }
      />
      {op.kycNotes && (
        <div className="mb-4">
          <Alert tone="info" title="KYC notes">
            {op.kycNotes}
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="KYC & business" action={<StatusBadge status={op.kycStatus} />} />
          <CardBody>
            <DescList
              className="sm:grid-cols-1"
              items={[
                { label: "Contact", value: `${u.email ?? ""} ${u.phone ?? ""}` },
                { label: "GSTIN", value: op.gstin ?? "—" },
                { label: "PAN", value: op.panLast4 ? `••••••${op.panLast4}` : "—" },
                { label: "Address", value: op.address ?? "—" },
                { label: "Reviewed", value: op.kycReviewedAt ? prettyDateTime(op.kycReviewedAt) : "—" },
                {
                  label: "Identity documents",
                  value: docs.length ? (
                    <ul className="space-y-1">
                      {docs.map(({ d, fileName }) => (
                        <li key={d.id}>
                          {d.docType} ••{d.numberLast4} <StatusBadge status={d.status} />{" "}
                          {d.fileId && (
                            <a className="text-brand-700 underline" href={`/api/files/${d.fileId}`} target="_blank" rel="noopener noreferrer">
                              {fileName ?? "View"}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "None uploaded"
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Bank & payouts" action={op.bankVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>} />
          <CardBody className="space-y-4">
            <DescList
              className="sm:grid-cols-1"
              items={[
                { label: "Account", value: op.bankAccountLast4 ? `${op.bankAccountName ?? ""} · ${op.bankName ?? ""} ••${op.bankAccountLast4} · ${op.bankIfsc ?? ""}` : "—" },
                { label: "UPI", value: op.upiId ?? "—" },
                ...(bal ? [{ label: "Balance", value: <span>Eligible <Money paise={bal.eligible} /> · pending <Money paise={bal.pending} /> · paid <Money paise={bal.paid} /></span> }] : []),
              ]}
            />
            <div className="flex flex-wrap gap-2">
              {(canKyc || me.has("payouts.manage")) && (op.bankAccountLast4 || op.upiId) && (op.bankVerified ? <ActionButton url={`/api/admin/owners/${id}/bank`} body={{ verified: false }} label="Mark unverified" danger confirm="Mark bank details as unverified? Payouts will be blocked." success="Bank marked unverified" /> : <ActionButton url={`/api/admin/owners/${id}/bank`} body={{ verified: true }} label="Verify bank" variant="primary" confirm="Confirm bank / UPI details were verified?" success="Bank verified" />)}
            </div>
            {me.has("payouts.manage") && (
              <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
                <Toggle url={`/api/admin/owners/${id}`} field="payoutHold" value={op.payoutHold} label="Hold payouts" />
                <div className="flex items-center gap-2">
                  Settlement cycle:
                  <FormDialogButton url={`/api/admin/owners/${id}`} method="PATCH" label={`${op.settlementCycleDays} days`} variant="ghost" title="Settlement cycle" fields={[{ name: "settlementCycleDays", label: "Days", type: "number", required: true, defaultValue: op.settlementCycleDays }]} success="Updated" />
                </div>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Commercial" />
          <CardBody className="space-y-3 text-sm">
            {me.has("pricing.manage") || me.has("users.manage") ? <Toggle url={`/api/admin/owners/${id}`} field="canSetFinalPrice" value={op.canSetFinalPrice} label="May set final customer prices" /> : <p>Final pricing: {op.canSetFinalPrice ? "allowed" : "not allowed"}</p>}
            <p className="text-xs text-slate-500">Off by default — the StayShare team sets all prices.</p>
            <div>
              <p className="mb-1 font-medium">Partner plan</p>
              {subs.map(({ s, plan }) => (
                <p key={s.id} className="text-xs">
                  {plan} <StatusBadge status={s.status} /> until {prettyDate(s.endsAt)}
                </p>
              ))}
              {!subs.length && <p className="text-xs text-slate-500">No partner plan</p>}
            </div>
            <div>
              <p className="mb-1 font-medium">Staff ({staff.length})</p>
              {staff.map((s) => (
                <p key={s.email ?? s.name} className="text-xs">
                  {s.name} · {s.designation ?? "staff"} {!s.active && <Badge>inactive</Badge>}
                </p>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Properties ({props.length})</h2>
      <Table>
        <THead>
          <tr>
            <TH>Property</TH>
            <TH>City</TH>
            <TH>Approval</TH>
            <TH>Flags</TH>
            <TH className="text-right">From</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {props.map(({ p, city }) => (
            <TR key={p.id}>
              <TD>
                <Link href={`/admin/properties/${p.id}`} className="font-medium text-brand-700 hover:underline">
                  {p.name}
                </Link>
                <p className="text-xs text-slate-500">{p.code}</p>
              </TD>
              <TD>{city}</TD>
              <TD>
                <StatusBadge status={p.approvalStatus} />
              </TD>
              <TD className="space-x-1">
                {p.blocked && <Badge tone="red">Blocked</Badge>}
                {!p.active && <Badge>Inactive</Badge>}
                {p.isFeatured && <Badge tone="amber">Featured</Badge>}
              </TD>
              <TD className="text-right">{p.startingPrice ? <Money paise={p.startingPrice} /> : "—"}</TD>
              <TD className="text-right">
                {p.approvalStatus !== "APPROVED" && (
                  <Link href={`/admin/approvals/${p.id}`} className="text-sm text-brand-700 hover:underline">
                    Review
                  </Link>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
