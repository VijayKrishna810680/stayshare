import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  beds,
  bookingBeds,
  bookingGuests,
  bookingModifications,
  bookingServices,
  bookingStatusHistory,
  bookings,
  cancellations,
  checkIns,
  checkOuts,
  cities,
  invoices,
  ownerEarnings,
  paymentTransactions,
  payments,
  properties,
  refunds,
  rooms,
  users,
  type PriceBreakdownJson,
} from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate, prettyDateTime, todayIST } from "@/lib/dates";
import { Alert, Badge, Card, CardBody, CardHeader, DescList, Money, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { CancelBookingButton } from "@/components/admin/cancel-booking";
import { ActionButton, JsonView } from "@/components/admin/widgets";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking details" };

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await pageUser({ perm: "bookings.view" });
  const { id } = await params;
  const owner = alias(users, "owner");
  const [row] = await db
    .select({ b: bookings, customer: users, prop: properties, city: cities.name, room: rooms, ownerName: owner.name, ownerId: owner.id })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.customerId))
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(cities, eq(cities.id, properties.cityId))
    .innerJoin(rooms, eq(rooms.id, bookings.roomId))
    .innerJoin(owner, eq(owner.id, properties.ownerId))
    .where(eq(bookings.id, id));
  if (!row) notFound();
  const { b, customer, prop, room } = row;
  const actor = alias(users, "actor");
  const [guests, bedRows, services, history, mods, pays, refundRows, [cancel], [ci], [co], invs, [earning]] = await Promise.all([
    db.select().from(bookingGuests).where(eq(bookingGuests.bookingId, b.id)).orderBy(desc(bookingGuests.isPrimary)),
    db.select({ code: beds.code, active: bookingBeds.active }).from(bookingBeds).innerJoin(beds, eq(beds.id, bookingBeds.bedId)).where(eq(bookingBeds.bookingId, b.id)),
    db.select().from(bookingServices).where(eq(bookingServices.bookingId, b.id)).orderBy(asc(bookingServices.createdAt)),
    db.select({ h: bookingStatusHistory, by: actor.name }).from(bookingStatusHistory).leftJoin(actor, eq(actor.id, bookingStatusHistory.changedBy)).where(eq(bookingStatusHistory.bookingId, b.id)).orderBy(asc(bookingStatusHistory.createdAt)),
    db.select().from(bookingModifications).where(eq(bookingModifications.bookingId, b.id)).orderBy(desc(bookingModifications.createdAt)),
    db.select().from(payments).where(eq(payments.bookingId, b.id)).orderBy(asc(payments.createdAt)),
    db.select().from(refunds).where(eq(refunds.bookingId, b.id)).orderBy(asc(refunds.createdAt)),
    db.select().from(cancellations).where(eq(cancellations.bookingId, b.id)),
    db.select({ c: checkIns, staff: actor.name }).from(checkIns).leftJoin(actor, eq(actor.id, checkIns.staffId)).where(eq(checkIns.bookingId, b.id)),
    db.select({ c: checkOuts, staff: actor.name }).from(checkOuts).leftJoin(actor, eq(actor.id, checkOuts.staffId)).where(eq(checkOuts.bookingId, b.id)),
    db.select().from(invoices).where(eq(invoices.bookingId, b.id)).orderBy(desc(invoices.issuedAt)),
    db.select().from(ownerEarnings).where(eq(ownerEarnings.bookingId, b.id)),
  ]);
  const txns = pays.length ? await db.select().from(paymentTransactions).where(inArray(paymentTransactions.paymentId, pays.map((p) => p.id))).orderBy(asc(paymentTransactions.createdAt)) : [];
  const bd = (b.priceBreakdown ?? { lines: [] }) as PriceBreakdownJson;
  const canManage = u.has("bookings.manage");
  const cancellable = ["PAYMENT_PENDING", "INVENTORY_LOCKED", "DRAFT", "CONFIRMED", "CHECK_IN_PENDING"].includes(b.status);
  const noShowable = ["CONFIRMED", "CHECK_IN_PENDING"].includes(b.status) && b.checkIn <= todayIST();
  const pol = (b.cancellationPolicy ?? {}) as { name?: string; key?: string; tiers?: { hoursBeforeCheckIn: number; refundBps: number }[] };

  return (
    <>
      <PageHeader
        title={b.bookingNumber}
        description={`${prop.name} · ${row.city} · booked ${prettyDateTime(b.confirmedAt ?? b.createdAt)}`}
        breadcrumbs={[{ label: "Bookings", href: "/admin/bookings" }, { label: b.bookingNumber }]}
        actions={
          <>
            {invs.length > 0 && (
              <a href={`/api/admin/bookings/${b.id}/invoice`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
                Invoice PDF
              </a>
            )}
            {canManage && ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN"].includes(b.status) && <ActionButton url={`/api/admin/bookings/${b.id}/resend`} label="Resend confirmation" success="Confirmation sent" />}
            {canManage && noShowable && <ActionButton url={`/api/admin/bookings/${b.id}/no-show`} label="Mark no-show" danger confirm="Mark this booking as a no-show? The policy's no-show charge applies and inventory is released." success="Marked as no-show" />}
            {canManage && cancellable && <CancelBookingButton bookingId={b.id} bookingNumber={b.bookingNumber} />}
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={b.status} className="text-sm" />
        {b.payAtProperty && <Badge tone="amber">Pay at property</Badge>}
        {b.nonRefundable && <Badge tone="red">Non-refundable</Badge>}
        {b.couponCode && <Badge tone="purple">Coupon {b.couponCode}</Badge>}
        <Badge>Source: {b.source.toLowerCase()}</Badge>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Stay" />
            <CardBody>
              <DescList
                items={[
                  { label: "Property", value: <Link className="text-brand-700 hover:underline" href={`/admin/properties/${prop.id}`}>{prop.name}</Link> },
                  { label: "Owner", value: <Link className="hover:underline" href={`/admin/users/owners/${row.ownerId}`}>{row.ownerName}</Link> },
                  { label: "Room", value: `${room.roomNumber}${room.name ? ` · ${room.name}` : ""} (${room.category.toLowerCase()}, ${room.sharingCapacity}-sharing, ${room.isAC ? "AC" : "non-AC"})` },
                  { label: "Booked as", value: b.unit === "BED" ? `${b.bedsCount} bed(s)` : "Entire room" },
                  { label: "Beds", value: bedRows.map((x) => `${x.code}${x.active ? "" : " (released)"}`).join(", ") || "Assigned at check-in" },
                  { label: "Dates", value: `${prettyDate(b.checkIn)} → ${prettyDate(b.checkOut)} (${b.nights} nights)` },
                  { label: "Guests", value: `${b.adults} adult(s), ${b.children} child(ren)` },
                  { label: "Services", value: b.selectedServices.join(", ") || "—" },
                  { label: "Cancellation policy", value: pol.name ?? pol.key ?? "—" },
                  { label: "Special requests", value: b.specialRequests ?? "—" },
                ]}
              />
              {guests.length > 0 && (
                <div className="mt-5">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Guest list</h4>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                    {guests.map((g) => (
                      <li key={g.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                        <span>
                          {g.name} {g.isPrimary && <Badge tone="brand">Primary</Badge>}
                        </span>
                        <span className="text-xs text-slate-500">
                          {[g.gender?.toLowerCase(), g.age ? `${g.age} yrs` : null, g.phone, g.idType ? `${g.idType} ••${g.idLast4 ?? ""}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payments" description={`Paid ${pays.length ? "" : "— no payment attempts"}`} />
            {pays.length > 0 && (
              <Table className="rounded-none border-0 shadow-none">
                <THead>
                  <tr>
                    <TH>Created</TH>
                    <TH>Purpose</TH>
                    <TH>Provider / ref</TH>
                    <TH>Method</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                  </tr>
                </THead>
                <TBody>
                  {pays.map((p) => (
                    <TR key={p.id}>
                      <TD className="whitespace-nowrap text-xs">{prettyDateTime(p.createdAt)}</TD>
                      <TD className="text-xs">{p.purpose.toLowerCase().replace("_", " ")}</TD>
                      <TD className="text-xs">
                        {p.provider}
                        <p className="font-mono text-[11px] text-slate-500">{p.providerPaymentId ?? p.providerOrderId}</p>
                      </TD>
                      <TD className="text-xs">{p.method}</TD>
                      <TD>
                        <StatusBadge status={p.status} />
                        {p.failureReason && <p className="text-xs text-red-600">{p.failureReason}</p>}
                      </TD>
                      <TD className="text-right">
                        <Money paise={p.amount} />
                        {p.refundedAmount > 0 && (
                          <p className="text-xs text-purple-700">
                            refunded <Money paise={p.refundedAmount} />
                          </p>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            {txns.length > 0 && (
              <details className="border-t border-slate-100 px-5 py-3 text-sm">
                <summary className="cursor-pointer font-medium">Transaction log ({txns.length})</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {txns.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-500">{prettyDateTime(t.createdAt)}</span>
                      <code>{t.event}</code>
                      <StatusBadge status={t.status} />
                      <Money paise={t.amount} />
                      <JsonView value={t.raw} label="raw" />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {(refundRows.length > 0 || cancel) && (
            <Card>
              <CardHeader title="Cancellation & refunds" />
              <CardBody className="space-y-4">
                {cancel && (
                  <Alert tone="warn" title={`Cancelled by ${cancel.requestedRole.toLowerCase()} on ${prettyDateTime(cancel.createdAt)}`}>
                    {cancel.reason} · refund <Money paise={cancel.refundAmount} /> · retained <Money paise={cancel.penalty} />
                    {cancel.adminNotes && <p className="mt-1 text-xs">Notes: {cancel.adminNotes}</p>}
                  </Alert>
                )}
                {refundRows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <div>
                      <p>
                        <Money paise={r.amount} /> · {r.kind.toLowerCase()} · <StatusBadge status={r.status} />
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.reason}
                        {r.providerRefundId && ` · ref ${r.providerRefundId}`}
                      </p>
                    </div>
                    {u.has("refunds.approve") && (
                      <Link href="/admin/refunds" className="text-xs text-brand-700 hover:underline">
                        Refund queue
                      </Link>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {mods.length > 0 && (
            <Card>
              <CardHeader title="Modification requests" />
              <CardBody className="space-y-3">
                {mods.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">
                        {m.type.replace(/_/g, " ").toLowerCase()} · <StatusBadge status={m.status} />
                      </p>
                      <p className="text-xs text-slate-500">
                        {prettyDateTime(m.createdAt)} · price difference <Money paise={m.priceDiff} />
                        {m.note && ` · ${m.note}`}
                      </p>
                    </div>
                    {m.status === "REQUESTED" && canManage && (
                      <div className="flex gap-2">
                        <ActionButton url={`/api/admin/modifications/${m.id}`} body={{ approve: true }} label="Approve" variant="primary" success="Approved" />
                        <ActionButton url={`/api/admin/modifications/${m.id}`} body={{ approve: false }} label="Reject" danger note={{ field: "note", label: "Reason", required: true }} success="Rejected" />
                      </div>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {(ci || co) && (
            <Card>
              <CardHeader title="Check-in / check-out" />
              <CardBody className="grid gap-6 sm:grid-cols-2">
                {ci && (
                  <DescList
                    className="sm:grid-cols-1"
                    items={[
                      { label: "Checked in", value: `${prettyDateTime(ci.c.actualTime)} by ${ci.staff ?? "staff"}` },
                      { label: "ID verified", value: ci.c.idVerified ? `${ci.c.idDocType ?? "ID"} ••${ci.c.idLast4 ?? ""}` : "No" },
                      { label: "ID document", value: ci.c.idFileId ? <a className="text-brand-700 underline" href={`/api/files/${ci.c.idFileId}`} target="_blank" rel="noopener noreferrer">View</a> : "—" },
                      { label: "Deposit collected", value: <Money paise={ci.c.depositCollected} /> },
                      { label: "Notes", value: ci.c.notes ?? "—" },
                    ]}
                  />
                )}
                {co && (
                  <DescList
                    className="sm:grid-cols-1"
                    items={[
                      { label: "Checked out", value: `${prettyDateTime(co.c.actualTime)} by ${co.staff ?? "staff"}` },
                      { label: "Damage charges", value: <Money paise={co.c.damageCharges} /> },
                      { label: "Extra charges", value: <Money paise={co.c.extraCharges} /> },
                      { label: "Deposit refund", value: <Money paise={co.c.depositRefund} /> },
                      { label: "Amount due", value: <Money paise={co.c.amountDue} /> },
                      { label: "Inspection", value: <JsonView value={co.c.inspection} label="View inspection" /> },
                    ]}
                  />
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Status history" />
            <CardBody>
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {history.map(({ h, by }) => (
                  <li key={h.id}>
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-400" aria-hidden />
                    <p className="text-sm">
                      {h.fromStatus && (
                        <>
                          <StatusBadge status={h.fromStatus} /> →{" "}
                        </>
                      )}
                      <StatusBadge status={h.toStatus} />
                    </p>
                    <p className="text-xs text-slate-500">
                      {prettyDateTime(h.createdAt)} · {by ?? "system"}
                      {h.note && ` · ${h.note}`}
                    </p>
                  </li>
                ))}
                {!history.length && <li className="text-sm text-slate-500">No history recorded.</li>}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer" action={u.has("users.view") ? <Link className="text-sm text-brand-700 hover:underline" href={`/admin/users/customers/${customer.id}`}>Profile</Link> : undefined} />
            <CardBody>
              <DescList className="sm:grid-cols-1" items={[{ label: "Name", value: customer.name }, { label: "Email", value: customer.email ?? "—" }, { label: "Phone", value: customer.phone ?? "—" }, { label: "Account", value: <StatusBadge status={customer.status} /> }]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Price breakdown" />
            <CardBody>
              <dl className="space-y-1.5 text-sm">
                {bd.lines.map((l) => (
                  <div key={l.key} className={cn("flex justify-between gap-3", l.kind === "discount" && "text-emerald-700", l.kind === "info" && "text-slate-500")}>
                    <dt>{l.label}</dt>
                    <dd className="tabular-nums">
                      <Money paise={l.amount} exact />
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                  <dt>Total</dt>
                  <dd>
                    <Money paise={b.totalAmount} exact />
                  </dd>
                </div>
                <div className="flex justify-between text-slate-600">
                  <dt>Paid</dt>
                  <dd>
                    <Money paise={b.paidAmount} exact />
                  </dd>
                </div>
                {b.refundedAmount > 0 && (
                  <div className="flex justify-between text-purple-700">
                    <dt>Refunded</dt>
                    <dd>
                      <Money paise={b.refundedAmount} exact />
                    </dd>
                  </div>
                )}
                {b.depositRefunded > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <dt>Deposit refunded</dt>
                    <dd>
                      <Money paise={b.depositRefunded} exact />
                    </dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>
          {services.length > 0 && (
            <Card>
              <CardHeader title="Services & charges" />
              <CardBody>
                <ul className="space-y-1 text-sm">
                  {services.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>
                        {s.description} ×{s.quantity} {s.atCheckout && <Badge>checkout</Badge>}
                      </span>
                      <Money paise={s.amount} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {earning && u.has("payouts.manage") && (
            <Card>
              <CardHeader title="Owner settlement" action={<StatusBadge status={earning.status} />} />
              <CardBody>
                <dl className="space-y-1 text-sm">
                  {(
                    [
                      ["Room revenue", earning.roomRevenue],
                      [`Commission (${earning.commissionBps / 100}%)`, -earning.commission],
                      ["Gateway fee", -earning.gatewayFee],
                      ["Property discount", -earning.propertyDiscount],
                      ["Refund deduction", -earning.refundDeduction],
                      ["Penalties", -earning.penalties],
                      ["Adjustments", earning.adjustments],
                    ] as [string, number][]
                  )
                    .filter(([, v]) => v !== 0)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <dt className="text-slate-600">{k}</dt>
                        <dd className="tabular-nums">
                          <Money paise={v} />
                        </dd>
                      </div>
                    ))}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold">
                    <dt>Net payable</dt>
                    <dd>
                      <Money paise={earning.netPayable} />
                    </dd>
                  </div>
                  {earning.eligibleAt && <p className="text-xs text-slate-500">Eligible from {prettyDateTime(earning.eligibleAt)}</p>}
                </dl>
              </CardBody>
            </Card>
          )}
          {invs.length > 0 && (
            <Card>
              <CardHeader title="Invoices" />
              <CardBody>
                <ul className="space-y-1 text-sm">
                  {invs.map((i) => (
                    <li key={i.id} className="flex justify-between">
                      <span>
                        {i.invoiceNumber} <Badge>{i.kind.toLowerCase()}</Badge>
                      </span>
                      <Money paise={i.total} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
