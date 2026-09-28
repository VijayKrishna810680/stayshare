import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { AuthShell } from "@/components/site/auth-shell";
import { RegisterForm } from "@/components/site/register-form";
import { postLoginPath } from "@/components/site/auth-redirect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create your account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ type?: string; next?: string }> }) {
  const { type, next } = await searchParams;
  const u = await getCurrentUser();
  if (u) redirect(postLoginPath({ roles: u.roles, isAdmin: u.isAdmin }, next));
  const owner = type === "owner" || type === "OWNER";
  return (
    <AuthShell
      title={owner ? "Become a StayShare partner" : "Create your account"}
      subtitle={owner ? "List your hotel, hostel, PG or co-living space." : "Book beds, rooms and monthly stays in minutes."}
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <RegisterForm initialType={owner ? "OWNER" : "CUSTOMER"} next={next} />
    </AuthShell>
  );
}
