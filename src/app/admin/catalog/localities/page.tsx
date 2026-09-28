import { ResourcePage } from "../../_lib/resource-page";
import { cityOptions } from "../../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Localities" };

export default async function Page() {
  return <ResourcePage resource="localities" title="Localities" description="Neighbourhoods within each city, used for search filters and locality-scoped pricing rules." options={{ cities: await cityOptions() }} />;
}
