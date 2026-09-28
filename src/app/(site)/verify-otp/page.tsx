import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { AuthShell } from "@/components/site/auth-shell";
import { OtpFlow } from "@/components/site/login-form";
import { postLoginPath } from "@/components/site/auth-redirect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify with OTP" };

export default async function VerifyOtpPage({ searchParams }: { searchParams: Promise<{ next?: string; target?: string }> }) {
  const { next, target } = await searchParams;
  const u = await getCurrentUser();
  if (u) redirect(postLoginPath({ roles: u.roles, isAdmin: u.isAdmin }, next));
  return (
    <AuthShell title="Log in with OTP" subtitle="Quick and password-free." footer={<Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">Use password instead</Link>}>
      <OtpFlow next={next} initialTarget={target ?? ""} />
    </AuthShell>
  );
}
