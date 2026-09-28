import { ResourcePage } from "../../_lib/resource-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cities" };

export default function Page() {
  return <ResourcePage resource="cities" title="Cities" description="Cities where StayShare operates. The code is used in booking numbers (e.g. SS-HYD-2026-000123). Popular cities are highlighted on the home page." />;
}
