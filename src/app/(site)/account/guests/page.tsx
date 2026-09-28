import type { Metadata } from "next";
import { pageUser } from "@/lib/auth/page";
import { PageHeader } from "@/components/ui";
import { GuestsManager } from "@/components/site/guests-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved guests" };

export default async function GuestsPage() {
  await pageUser({ next: "/account/guests" });
  return (
    <div>
      <PageHeader title="Saved guests" description="Family, friends or colleagues you often travel with — pick them at checkout." breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Saved guests" }]} />
      <GuestsManager />
    </div>
  );
}
