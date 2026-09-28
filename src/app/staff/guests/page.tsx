import { pageUser } from "@/lib/auth/page";
import { deskContext, toLookupRows } from "@/lib/owner-data";
import { arrivalsDepartures, upcomingArrivals, upcomingDepartures } from "@/services/owner-reports";
import { EmptyState } from "@/components/ui";
import { GuestsView } from "@/components/staff/guests-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guests & arrivals" };

export default async function StaffGuests({ searchParams }: { searchParams: Promise<{ tab?: string; p?: string }> }) {
  const u = await pageUser({ role: ["STAFF", "OWNER"] });
  const sp = await searchParams;
  const ctx = await deskContext(u, sp.p);
  if (!ctx.properties.length) return <EmptyState title="No properties assigned" />;
  const tab = ["current", "arrivals", "departures"].includes(sp.tab ?? "") ? sp.tab! : "current";
  const rows = toLookupRows(tab === "current" ? (await arrivalsDepartures(ctx.scope)).inHouse : tab === "arrivals" ? await upcomingArrivals(ctx.scope, 7, 200) : await upcomingDepartures(ctx.scope, 7, 200));
  return <GuestsView rows={rows} tab={tab} basePath="/staff/guests" props={ctx.properties} selected={ctx.selected} p={sp.p} />;
}

