import { Alert } from "@/components/ui";
import { ResourcePage } from "../../_lib/resource-page";
import { bedOptions, cityOptions, customerOptions, localityOptions, propertyOptions, roomOptions } from "../../_lib/query";
import { PricingTabs } from "../tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing rules" };

export default async function Page() {
  const [cities, localities, properties, rooms, beds, customers] = await Promise.all([cityOptions(), localityOptions(), propertyOptions(), roomOptions(), bedOptions(), customerOptions()]);
  return (
    <ResourcePage
      resource="pricing-rules"
      title="Pricing"
      description="Seasonal, weekend, surge, festival, promotion and override rules adjust the nightly base price per night. Higher priority rules apply first; a SET_NIGHTLY_PRICE rule replaces the base price."
      options={{ cities, localities, properties, rooms, beds, customers }}
      before={
        <>
          <PricingTabs active="rules" />
          <div className="mb-4">
            <Alert tone="info">
              Percent values may be negative (e.g. −10 for a 10% discount). PROMOTION rules with a negative value are shown to customers as a separate “Promotional discount” line. Every create/edit requires a reason and is written to price history.
            </Alert>
          </div>
        </>
      }
    />
  );
}
