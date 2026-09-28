import { Alert } from "@/components/ui";
import { ResourcePage } from "../_lib/resource-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taxes" };

export default function Page() {
  return (
    <ResourcePage
      resource="tax-rules"
      title="Taxes (GST)"
      description="Tax slabs applied by the pricing engine. The slab is chosen by the per-unit nightly tariff actually charged; exemption rules (highest priority) are checked first."
      before={
        <div className="mb-4 space-y-3">
          <Alert tone="info" title="Currently seeded GST configuration">
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Accommodation with nightly tariff up to ₹7,500 per unit → <strong>5% GST</strong> (SAC 996311, without ITC).</li>
              <li>Nightly tariff above ₹7,500 → <strong>18% GST</strong>.</li>
              <li>Long stays of <strong>90 days or more</strong> costing <strong>≤ ₹20,000 per person per month</strong> (hostel / PG style residential accommodation) → <strong>exempt</strong>.</li>
              <li>GST on the platform convenience fee is configured in Settings → Fees &amp; booking.</li>
            </ul>
          </Alert>
          <Alert tone="warn" title="Verify with your CA">Tax law changes frequently. These rates are a starting configuration — confirm slabs, exemptions and SAC codes with your chartered accountant before going live.</Alert>
        </div>
      }
    />
  );
}
