import { ResourcePage } from "../../_lib/resource-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banners" };

export default function Page() {
  return <ResourcePage resource="banners" title="Banners" description="Promotional banners displayed on the customer site (home hero, strips, search)." />;
}
