import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ownerProfiles } from "@/db/schema";
import { pageUser } from "@/lib/auth/page";
import { DescList, LinkButton, PageHeader } from "@/components/ui";
import { LogoutAllButton, ProfileForm } from "@/components/owner/misc-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const u = await pageUser({ role: "OWNER" });
  const [op] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, u.id));
  return (
    <>
      <PageHeader title="Settings" description="Your partner profile, login and security." />
      <ProfileForm name={u.name} phone={u.phone} email={u.email} />
      <section className="card mt-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Partner account</h2>
          <LinkButton href="/owner/kyc" size="sm" variant="outline">
            Edit business details
          </LinkButton>
        </div>
        <DescList
          items={[
            { label: "Business", value: op?.businessName },
            { label: "Settlement cycle", value: op ? `Every ${op.settlementCycleDays} days` : "—" },
            { label: "Pricing", value: op?.canSetFinalPrice ? "You may set final prices (granted by StayShare)" : "Prices are set by the StayShare team" },
            { label: "Sessions", value: <LogoutAllButton /> },
          ]}
        />
      </section>
    </>
  );
}
