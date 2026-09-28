import { Alert } from "@/components/ui";
import { ResourcePage } from "../_lib/resource-page";
import { cityOptions, propertyOptions } from "../_lib/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Commissions" };

export default async function Page() {
  return (
    <ResourcePage
      resource="commissions"
      title="Platform commission"
      description="Commission is charged on the owner's room revenue (after property-funded discounts). The most specific active rule applies: property → city → global. Owner partner plans may lower it further."
      options={{ cities: await cityOptions(), properties: await propertyOptions() }}
      before={
        <div className="mb-4">
          <Alert tone="info">Changes apply to new bookings. Existing owner earnings keep the commission rate captured at booking time. Every rate change is written to price history.</Alert>
        </div>
      }
    />
  );
}
