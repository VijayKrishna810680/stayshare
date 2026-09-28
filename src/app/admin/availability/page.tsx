import Link from "next/link";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { beds, inventoryBlocks, properties, rooms, users } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate, prettyDateTime, todayIST } from "@/lib/dates";
import { Badge, EmptyState, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, FilterBar, FormDialogButton } from "@/components/admin/widgets";
import { bedOptions, one, pageArgs, propertyOptions, roomOptions, type SearchParams } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Availability" };

export default async function AvailabilityPage({ searchParams }: { searchParams: SearchParams }) {
  await pageUser({ perm: "properties.manage" });
  const sp = await searchParams;
  const { page, pageSize, offset } = pageArgs(sp, 30);
  const conds: SQL[] = [];
  if (one(sp.property)) conds.push(eq(inventoryBlocks.propertyId, one(sp.property)));
  if (one(sp.reason)) conds.push(eq(inventoryBlocks.reason, one(sp.reason)));
  if (one(sp.show) !== "all") conds.push(isNull(inventoryBlocks.releasedAt), sql`${inventoryBlocks.endDate} >= ${todayIST()}::date`);
  const where = conds.length ? and(...conds) : undefined;
  const creator = alias(users, "creator");
  const [rows, total, props, roomOpts, bedOpts] = await Promise.all([
    db.select({ b: inventoryBlocks, prop: properties.name, room: rooms.roomNumber, bed: beds.code, by: creator.name }).from(inventoryBlocks).innerJoin(properties, eq(properties.id, inventoryBlocks.propertyId)).leftJoin(rooms, eq(rooms.id, inventoryBlocks.roomId)).leftJoin(beds, eq(beds.id, inventoryBlocks.bedId)).leftJoin(creator, eq(creator.id, inventoryBlocks.createdBy)).where(where).orderBy(desc(inventoryBlocks.createdAt)).limit(pageSize).offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventoryBlocks)
      .where(where)
      .then((r) => r[0]?.n ?? 0),
    propertyOptions(),
    roomOptions(),
    bedOptions(),
  ]);
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader
        title="Availability & blocks"
        description="Inventory blocks close dates for a whole property, a room or a single bed. Blocks cannot overlap existing bookings."
        actions={
          <FormDialogButton
            url="/api/admin/blocks"
            label="Create block"
            variant="primary"
            title="Block inventory"
            description="Choose the property; optionally narrow to a room or bed (the room/bed must belong to that property). End date is exclusive (the first night that is open again)."
            fields={[
              { name: "propertyId", label: "Property", type: "select", options: props, required: true },
              { name: "roomId", label: "Room (optional)", type: "select", options: roomOpts },
              { name: "bedId", label: "Bed (optional)", type: "select", options: bedOpts },
              { name: "reason", label: "Reason", type: "select", options: [{ value: "ADMIN_BLOCK", label: "Admin block" }, { value: "MAINTENANCE", label: "Maintenance" }, { value: "OFFLINE_BOOKING", label: "Offline booking" }], required: true, defaultValue: "ADMIN_BLOCK" },
              { name: "startDate", label: "From", type: "date", required: true },
              { name: "endDate", label: "Until (exclusive)", type: "date", required: true },
              { name: "note", label: "Note", type: "textarea" },
            ]}
            submitText="Block dates"
            success="Inventory blocked"
          />
        }
      />
      <FilterBar
        fields={[
          { name: "property", label: "Property", type: "select", options: props },
          { name: "reason", label: "Reason", type: "select", options: ["ADMIN_BLOCK", "OWNER_BLOCK", "MAINTENANCE", "OFFLINE_BOOKING"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase() })) },
          { name: "show", label: "Show", type: "select", options: [{ value: "all", label: "Including released & past" }] },
        ]}
      />
      {!rows.length ? (
        <EmptyState title="No active blocks" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Property</TH>
              <TH>Scope</TH>
              <TH>Dates</TH>
              <TH>Reason</TH>
              <TH>Created</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map(({ b, prop, room, bed, by }) => (
              <TR key={b.id}>
                <TD>
                  <Link href={`/admin/properties/${b.propertyId}`} className="hover:underline">
                    {prop}
                  </Link>
                </TD>
                <TD className="text-xs">{bed ? `Bed ${bed}` : room ? `Room ${room}` : "Whole property"}</TD>
                <TD className="whitespace-nowrap text-xs">
                  {prettyDate(b.startDate)} → {prettyDate(b.endDate)}
                </TD>
                <TD>
                  <Badge>{b.reason.replace("_", " ").toLowerCase()}</Badge>
                  {b.note && <p className="text-xs text-slate-500">{b.note}</p>}
                </TD>
                <TD className="text-xs">
                  {prettyDateTime(b.createdAt)}
                  <br />
                  {by ?? ""}
                </TD>
                <TD className="text-right">{b.releasedAt ? <span className="text-xs text-slate-500">Released {prettyDate(b.releasedAt)}</span> : <ActionButton url={`/api/admin/blocks/${b.id}`} method="DELETE" label="Release" confirm="Release this block and reopen the dates?" success="Block released" />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/availability" query={query} />
    </>
  );
}
