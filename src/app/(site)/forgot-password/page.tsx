import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/site/auth-shell";
import { ForgotForm } from "@/components/site/password-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email or mobile number and we'll send you a reset link." footer={<Link href="/login" className="font-semibold text-brand-700 hover:underline">Back to log in</Link>}>
      <ForgotForm />
    </AuthShell>
  );
}
