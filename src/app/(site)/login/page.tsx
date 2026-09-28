import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { AuthShell } from "@/components/site/auth-shell";
import { LoginForm } from "@/components/site/login-form";
import { postLoginPath } from "@/components/site/auth-redirect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const u = await getCurrentUser();
  if (u) redirect(postLoginPath({ roles: u.roles, isAdmin: u.isAdmin }, next));
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to manage your bookings and stays."
      footer={
        <>
          New to StayShare?{" "}
          <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} error={error} />
    </AuthShell>
  );
}
