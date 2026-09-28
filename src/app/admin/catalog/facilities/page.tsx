import { ResourcePage } from "../../_lib/resource-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facilities" };

export default function Page() {
  return (
    <ResourcePage
      resource="facilities"
      title="Facilities & amenities"
      description="Master list of amenities. Custom facilities submitted by owners appear here as 'Custom' and inactive until you approve (activate) them. Per-property facility approvals happen on the property review page."
    />
  );
}
