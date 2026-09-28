import { ResourcePage } from "../../_lib/resource-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQs" };

export default function Page() {
  return <ResourcePage resource="faqs" title="FAQs" description="Frequently asked questions shown on the help and partner pages." />;
}
