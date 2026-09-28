import type { Metadata } from "next";
import { pageUser } from "@/lib/auth/page";
import { loadProfile } from "@/lib/site/profile";
import { PageHeader } from "@/components/ui";
import { ChangePassword, DevicesList, ProfileForm } from "@/components/site/profile-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile & security" };

export default async function ProfilePage() {
  const user = await pageUser({ next: "/account/profile" });
  const p = await loadProfile(user.id);
  return (
    <div className="space-y-6">
      <PageHeader title="Profile & security" breadcrumbs={[{ label: "Account", href: "/account" }, { label: "Profile" }]} />
      <ProfileForm
        initial={{
          name: p.name,
          email: p.email ?? "",
          phone: p.phone ?? "",
          emailVerified: Boolean(p.emailVerifiedAt),
          phoneVerified: Boolean(p.phoneVerifiedAt),
          gender: p.profile.gender ?? "",
          dateOfBirth: p.profile.dateOfBirth ?? "",
          occupation: p.profile.occupation ?? "",
          address: p.profile.address ?? "",
          city: p.profile.city ?? "",
          emergencyName: p.profile.emergencyName ?? "",
          emergencyPhone: p.profile.emergencyPhone ?? "",
        }}
      />
      <ChangePassword hasPassword={p.hasPassword} />
      <DevicesList />
    </div>
  );
}
