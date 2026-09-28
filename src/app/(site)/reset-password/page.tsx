import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/site/auth-shell";
import { ResetForm } from "@/components/site/password-forms";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password" footer={<Link href="/login" className="font-semibold text-brand-700 hover:underline">Back to log in</Link>}>
      {token && token.length >= 20 ? (
        <ResetForm token={token} />
      ) : (
        <Alert tone="error" title="Invalid reset link">
          This link is incomplete. Please request a new one from <Link href="/forgot-password" className="underline">Forgot password</Link>.
        </Alert>
      )}
    </AuthShell>
  );
}
