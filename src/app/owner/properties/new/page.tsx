import { and, count, eq, isNull } from "drizzle-orm";
import { Crown } from "lucide-react";
import { db } from "@/db";
import { properties } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { loadPropertyMeta } from "@/lib/owner-data";
import { ownerPropertyLimit } from "@/services/subscriptions";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PropertyWizard } from "@/components/owner/property-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add property" };

export default async function NewPropertyPage() {
  const u = await pageUser({ role: "OWNER" });
  const [{ n }] = (await db.select({ n: count(properties.id) }).from(properties).where(and(eq(properties.ownerId, u.id), isNull(properties.deletedAt)))) as [{ n: number }];
  const limit = await ownerPropertyLimit(u.id);
  const crumbs = [{ label: "Properties", href: "/owner/properties" }, { label: "Add property" }];
  if (Number(n) >= limit) {
    return (
      <>
        <PageHeader title="Add property" breadcrumbs={crumbs} />
        <EmptyState
          icon={<Crown className="h-6 w-6" />}
          title="You've reached your plan's property limit"
          description={`Your partner plan allows ${limit} properties and you have ${n}. Upgrade to list more buildings.`}
          action={<LinkButton href="/owner/subscription" variant="accent">See partner plans</LinkButton>}
        />
      </>
    );
  }
  const meta = await loadPropertyMeta();
  return (
    <>
      <PageHeader title="Add property" description="Tell us about your building. No prices needed — the StayShare team sets them after review." breadcrumbs={crumbs} />
      <PropertyWizard meta={meta} step="basic" />
    </>
  );
}
