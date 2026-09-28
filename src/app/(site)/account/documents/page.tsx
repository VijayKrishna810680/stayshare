import type { Metadata } from "next";
import { pageUser } from "@/lib/auth/page";
import { PageHeader } from "@/components/ui";
import { DocumentsManager } from "@/components/site/documents-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ID documents" };

export default async function DocumentsPage() {
  await pageUser({ next: "/account/documents" });
  return (
    <div>
      <PageHeader title="ID documents" description="Saved IDs speed up checkout at properties that require government ID. Numbers are encrypted and only the last 4 digits are shown." breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Documents" }]} />
      <DocumentsManager />
    </div>
  );
}
