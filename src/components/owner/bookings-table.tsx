"use client";
import { useEffect, useState } from "react";
import { Check, FileText, Loader2, LogIn, LogOut, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { Alert, Badge, Button, DescList, LinkButton, Money, StatusBadge, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { BookingDetail } from "@/services/owner-reports";
import { call, useAction } from "./common";
import { humanize } from "./format";
import { Drawer } from "./drawer";

export type OwnerBookingRow = { id: string; bookingNumber: string; status: string; checkIn: string; checkOut: string; nights: number; unit: string; bedsCount: number; guestName: string; propertyName: string; roomNumber: string; totalAmount: number; paidAmount: number; pendingMods: number };

export function BookingsTable({ rows, today, openId }: { rows: OwnerBookingRow[]; today: string; openId?: string }) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Booking</TH>
            <TH>Guest</TH>
            <TH>Property / room</TH>
            <TH>Stay</TH>
            <TH className="text-right">Total</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id} className="cursor-pointer">
              <TD>
                <button type="button" onClick={() => setOpen(r.id)} className="text-left font-medium text-brand-700 hover:underline">
                  {r.bookingNumber}
                </button>
                {r.pendingMods > 0 && (
                  <Badge tone="amber" className="ml-2">
                    {r.pendingMods} request
                  </Badge>
                )}
              </TD>
              <TD>{r.guestName}</TD>
              <TD>
                {r.propertyName}
                <p className="text-xs text-slate-500">
                  Room {r.roomNumber} · {r.unit === "ROOM" ? "Entire room" : `${r.bedsCount} bed(s)`}
                </p>
              </TD>
              <TD className="whitespace-nowrap text-xs">
                {r.checkIn} → {r.checkOut}
                <p className="text-slate-500">{r.nights} night(s)</p>
              </TD>
              <TD className="text-right">
                <Money paise={r.totalAmount} />
                {r.paidAmount < r.totalAmount && ["CONFIRMED", "CHECK_IN_PENDING", "CHECKED_IN", "CHECKED_OUT"].includes(r.status) && (
                  <p className="text-xs text-amber-700">
                    Due <Money paise={r.totalAmount - r.paidAmount} />
                  </p>
                )}
              </TD>
              <TD>
                <StatusBadge status={r.status} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <BookingDrawer id={open} onClose={() => setOpen(null)} today={today} />
    </>
  );
}

function BookingDrawer({ id, onClose, today }: { id: string | null; onClose: () => void; today: string }) {
  const [d, setD] = useState<BookingDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [noShow, setNoShow] = useState(false);
  const [decide, setDecide] = useState<{ id: string; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const { run, pending } = useAction();
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (!id) return;
    setD(null);
    setErr(null);
    apiFetch<BookingDetail>(`/api/owner/bookings/${id}`)
      .then(setD)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load"));
  }, [id, ver]);
  const reload = () => setVer((v) => v + 1);
  const canNoShow = d && ["CONFIRMED", "CHECK_IN_PENDING"].includes(d.status) && d.checkIn <= today;
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={d?.bookingNumber ?? "Booking"}
      subtitle={d && <span className="flex items-center gap-2"><StatusBadge status={d.status} /> {d.propertyName}</span>}
      footer={
        d && (
          <>
            <LinkButton href={`/api/staff/bookings/${d.id}/invoice`} target="_blank" variant="ghost" size="sm">
              <FileText className="h-4 w-4" /> Invoice
            </LinkButton>
            {canNoShow && (
              <Button variant="outline" size="sm" className="text-red-600" onClick={() => setNoShow(true)}>
                <UserX className="h-4 w-4" /> Mark no-show
              </Button>
            )}
            {["CONFIRMED", "CHECK_IN_PENDING"].includes(d.status) && (
              <LinkButton href={`/owner/check-in?q=${encodeURIComponent(d.bookingNumber)}`} size="sm">
                <LogIn className="h-4 w-4" /> Check in
              </LinkButton>
            )}
            {d.status === "CHECKED_IN" && (
              <LinkButton href={`/owner/check-out?q=${encodeURIComponent(d.bookingNumber)}`} size="sm">
                <LogOut className="h-4 w-4" /> Check out
              </LinkButton>
            )}
          </>
        )
      }
    >
      {err && <Alert tone="error">{err}</Alert>}
      {!d && !err && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {d && (
        <div className="space-y-6">
          <DescList
            items={[
              { label: "Stay", value: `${d.checkIn} → ${d.checkOut} · ${d.nights} night(s)` },
              { label: "Room", value: `Room ${d.roomNumber}${d.roomName ? ` · ${d.roomName}` : ""} · ${d.unit === "ROOM" ? "Entire room" : `${d.bedsCount} bed(s)`}` },
              { label: "Beds", value: d.beds.map((b) => b.code).join(", ") || "—" },
              { label: "Guests", value: `${d.adults} adult(s)${d.children ? `, ${d.children} child(ren)` : ""}` },
              { label: "Booked by", value: `${d.customer.name} · ${d.customer.phone}` },
              { label: "Booked on", value: new Date(d.createdAt).toLocaleString("en-IN") },
            ]}
          />
          {d.specialRequests && <Alert tone="info" title="Special requests">{d.specialRequests}</Alert>}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Guests</h3>
            <ul className="space-y-1 text-sm">
              {d.guests.map((g) => (
                <li key={g.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span>
                    {g.name} {g.isPrimary && <Badge tone="brand">Primary</Badge>}
                    <span className="block text-xs text-slate-500">{[g.gender && humanize(g.gender), g.age && `${g.age} yrs`, g.idType && `${humanize(g.idType)} ••${g.idLast4 ?? ""}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-xs text-slate-500">{g.phone}</span>
                </li>
              ))}
            </ul>
            {d.status !== "CHECKED_IN" && <p className="mt-1 text-xs text-slate-500">Phone numbers are masked until the guest checks in.</p>}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Payment summary</h3>
            <ul className="space-y-1 text-sm">
              {d.money.lines.filter((l) => l.kind !== "info").map((l) => (
                <li key={l.key + l.label} className="flex justify-between">
                  <span className="text-slate-600">{l.label}</span>
                  <Money paise={l.amount} className={l.amount < 0 ? "text-emerald-700" : ""} />
                </li>
              ))}
              <li className="flex justify-between border-t border-slate-100 pt-1 font-semibold">
                <span>Total</span>
                <Money paise={d.money.totalAmount} />
              </li>
              <li className="flex justify-between">
                <span className="text-slate-600">Paid</span>
                <Money paise={d.money.paidAmount} />
              </li>
              {d.money.refundedAmount > 0 && (
                <li className="flex justify-between">
                  <span className="text-slate-600">Refunded</span>
                  <Money paise={d.money.refundedAmount} />
                </li>
              )}
              <li className="flex justify-between">
                <span className="text-slate-600">Balance due</span>
                <Money paise={d.money.balanceDue} className={d.money.balanceDue ? "font-semibold text-amber-700" : ""} />
              </li>
            </ul>
            {d.earning && (
              <div className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
                Your net earning: <strong><Money paise={d.earning.netPayable} /></strong> · commission {d.earning.commissionBps / 100}% · <StatusBadge status={d.earning.status} />
              </div>
            )}
          </section>

          {d.modifications.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Change requests</h3>
              <ul className="space-y-2">
                {d.modifications.map((m) => (
                  <li key={m.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{humanize(m.type)}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {describeMod(m.payload)} · price difference <Money paise={m.priceDiff} /> · {new Date(m.createdAt).toLocaleDateString("en-IN")}
                    </p>
                    {m.note && <p className="mt-1 text-xs text-slate-600">Note: {m.note}</p>}
                    {m.status === "REQUESTED" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => (setNote(""), setDecide({ id: m.id, approve: true }))}>
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => (setNote(""), setDecide({ id: m.id, approve: false }))}>
                          <X className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {d.checkInRecord && (
            <section className="text-sm">
              <h3 className="mb-1 font-semibold">Check-in</h3>
              <p className="text-slate-600">
                {new Date(d.checkInRecord.at).toLocaleString("en-IN")} · ID {d.checkInRecord.idDocType ? humanize(d.checkInRecord.idDocType) : "—"} ••{d.checkInRecord.idLast4 ?? ""}
                {d.checkInRecord.idFileId && (
                  <>
                    {" · "}
                    <a href={`/api/files/${d.checkInRecord.idFileId}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                      view ID photo
                    </a>
                  </>
                )}
              </p>
            </section>
          )}
          {d.checkOutRecord && (
            <section className="text-sm">
              <h3 className="mb-1 font-semibold">Check-out</h3>
              <p className="text-slate-600">
                {new Date(d.checkOutRecord.at).toLocaleString("en-IN")} · deposit refund <Money paise={d.checkOutRecord.depositRefund} /> · extras <Money paise={d.checkOutRecord.extraCharges + d.checkOutRecord.damageCharges} />
              </p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
            <ol className="space-y-2 border-l border-slate-200 pl-4 text-xs">
              {d.history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{humanize(h.to)}</span> · {new Date(h.at).toLocaleString("en-IN")}
                  {h.note && <span className="block text-slate-500">{h.note}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      <ConfirmDialog
        open={noShow}
        onClose={() => setNoShow(false)}
        title="Mark as no-show?"
        description="The guest didn't arrive. The booking's cancellation policy no-show charge applies and any refund is processed automatically. This can't be undone."
        confirmText="Mark no-show"
        tone="danger"
        loading={pending === "ns"}
        onConfirm={async () => {
          const r = await run("ns", () => call(`/api/owner/bookings/${d!.id}/no-show`), { success: "Marked as no-show" });
          setNoShow(false);
          if (r) reload();
        }}
      />
      <ConfirmDialog
        open={!!decide}
        onClose={() => setDecide(null)}
        title={decide?.approve ? "Approve this request?" : "Reject this request?"}
        description={decide?.approve ? "If there's a price difference the guest is asked to pay it before the change applies." : "Any held inventory for this request is released."}
        confirmText={decide?.approve ? "Approve" : "Reject"}
        tone={decide?.approve ? "primary" : "danger"}
        loading={pending === "dec"}
        onConfirm={async () => {
          const r = await run("dec", () => call<{ status: string }>(`/api/owner/modifications/${decide!.id}`, "POST", { approve: decide!.approve, note: note || undefined }));
          if (r) toast.success(`Request ${humanize(r.status).toLowerCase()}`);
          setDecide(null);
          reload();
        }}
      >
        <label htmlFor="mod-note" className="mb-1 block text-sm font-medium text-slate-700">
          Note to guest (optional)
        </label>
        <Textarea id="mod-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </ConfirmDialog>
    </Drawer>
  );
}

function describeMod(p: Record<string, unknown>) {
  if (typeof p.newCheckOut === "string") return `New check-out ${p.newCheckOut}`;
  if (typeof p.time === "string") return `Time ${p.time}`;
  if (p.guest && typeof p.guest === "object") return `Guest ${(p.guest as { name?: string }).name ?? ""}`;
  if (typeof p.unit === "string") return `Move to ${p.unit === "ROOM" ? "entire room" : "bed(s)"}`;
  return "Details on request";
}
