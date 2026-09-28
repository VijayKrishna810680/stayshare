import Link from "next/link";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { prettyDate } from "@/lib/dates";
import { EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar } from "@/components/admin/widgets";
import { one, type SearchParams } from "../../_lib/query";
import { listUsersWithRole, STATUS_OPTS } from "../../_lib/users";
import { StatusButton } from "../status-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const u = await pageUser({ perm: "users.view" });
  const sp = await searchParams;
  const { rows, total, page, pageSize } = await listUsersWithRole("CUSTOMER", sp);
  const stats = rows.length
    ? await db
        .select({ id: bookings.customerId, n: sql<number>`count(*)::int`, spend: sql<number>`coalesce(sum(${bookings.paidAmount} - ${bookings.refundedAmount}),0)::int` })
        .from(bookings)
        .where(inArray(bookings.customerId, rows.map((r) => r.id)))
        .groupBy(bookings.customerId)
    : [];
  const query = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <PageHeader title="Customers" description="Guests who book on StayShare. Suspending an account signs the user out of every device immediately." />
      <FilterBar fields={[{ name: "q", label: "Search", type: "text", placeholder: "Name, email or phone" }, { name: "status", label: "Status", type: "select", options: STATUS_OPTS }]} />
      {!rows.length ? (
        <EmptyState title="No customers found" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Customer</TH>
              <TH>Contact</TH>
              <TH>Joined</TH>
              <TH>Bookings</TH>
              <TH className="text-right">Net spend</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((c) => {
              const s = stats.find((x) => x.id === c.id);
              return (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/admin/users/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                  </TD>
                  <TD className="text-xs">
                    {c.email}
                    <br />
                    {c.phone}
                  </TD>
                  <TD className="text-xs">{prettyDate(c.createdAt)}</TD>
                  <TD>{s?.n ?? 0}</TD>
                  <TD className="text-right">
                    <Money paise={s?.spend ?? 0} />
                  </TD>
                  <TD>
                    <StatusBadge status={c.status} />
                  </TD>
                  <TD className="text-right">{u.has("users.manage") && c.id !== u.id && <StatusButton id={c.id} status={c.status} />}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/users/customers" query={query} />
    </>
  );
}
