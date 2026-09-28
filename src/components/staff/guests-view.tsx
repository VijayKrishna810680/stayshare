import Link from "next/link";
import { EmptyState, Money, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { TabNav } from "@/components/owner/common";
import { PropertyPicker } from "./board";
import type { LookupRow } from "./booking-search";

/** Server-rendered guest lists shared by the staff and owner portals. */
export function GuestsView({ rows, tab, basePath, props, selected, p, deskBase = "/staff" }: { rows: LookupRow[]; tab: string; basePath: string; props: { id: string; name: string }[]; selected: string | null; p?: string; deskBase?: string }) {
  return (
    <>
      <PageHeader title="Guests" description="Who is staying, who is arriving and who leaves in the next 7 days." actions={<PropertyPicker properties={props} value={selected ?? ""} allowAll />} />
      <TabNav
        tabs={[
          { key: "current", label: "In house" },
          { key: "arrivals", label: "Arrivals (7 days)" },
          { key: "departures", label: "Departures (7 days)" },
        ]}
        active={tab}
        basePath={basePath}
        query={{ p }}
      />
      {rows.length === 0 ? (
        <EmptyState title="Nobody here" description="No guests match this list right now." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Guest</TH>
              <TH>Booking</TH>
              <TH>Property / room</TH>
              <TH>Stay</TH>
              <TH>Balance</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <p className="font-medium">{r.guestName}</p>
                  <p className="text-xs text-slate-500">{r.guestPhone}</p>
                </TD>
                <TD className="text-xs">{r.bookingNumber}</TD>
                <TD>
                  {r.propertyName}
                  <p className="text-xs text-slate-500">
                    Room {r.roomNumber} · {r.unit === "ROOM" ? "Entire room" : `${r.bedsCount} bed(s)`}
                  </p>
                </TD>
                <TD className="whitespace-nowrap text-xs">
                  {r.checkIn} → {r.checkOut}
                </TD>
                <TD>{r.balanceDue > 0 ? <Money paise={r.balanceDue} className="text-amber-700" /> : "—"}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD className="text-right">
                  <Link href={`${deskBase}/${r.status === "CHECKED_IN" ? "check-out" : "check-in"}?q=${encodeURIComponent(r.bookingNumber)}`} className="text-sm font-medium text-brand-700 hover:underline">
                    {r.status === "CHECKED_IN" ? "Check out" : "Check in"}
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
