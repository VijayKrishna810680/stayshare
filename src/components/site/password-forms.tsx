"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Alert, Button, Input, Label } from "@/components/ui";

export const PW_RULES: { label: string; test: (s: string) => boolean }[] = [
  { label: "At least 8 characters", test: (s) => s.length >= 8 },
  { label: "An uppercase letter", test: (s) => /[A-Z]/.test(s) },
  { label: "A lowercase letter", test: (s) => /[a-z]/.test(s) },
  { label: "A number", test: (s) => /\d/.test(s) },
  { label: "A symbol (e.g. @ # $ !)", test: (s) => /[^A-Za-z0-9]/.test(s) },
];
export const pwOk = (s: string) => PW_RULES.every((r) => r.test(s)) && s.length <= 72;

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
      {PW_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.label} className={cn("flex items-center gap-1.5", ok ? "text-emerald-700" : "text-slate-500")}>
            {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />} {r.label}
          </li>
        );
      })}
    </ul>
  );
}

export function ForgotForm() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (sent) {
    return (
      <div className="space-y-3">
        <Alert tone="success" title="Check your inbox">
          If an account exists for {identifier}, we&apos;ve sent a link to reset your password. It expires in 30 minutes.
        </Alert>
        {sent.devLink && (
          <Alert tone="info" title="Development mode">
            <Link href={sent.devLink} className="font-semibold underline">
              Open the reset link
            </Link>
          </Alert>
        )}
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try {
          setSent(await apiFetch<{ devLink?: string }>("/api/auth/forgot", { method: "POST", json: { identifier: identifier.trim() } }));
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="fp-id">Email or mobile number</Label>
        <Input id="fp-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required minLength={3} autoComplete="username" />
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-slate-600">
        Or <Link href="/verify-otp" className="font-medium text-brand-700 underline">log in with an OTP</Link> instead.
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <Alert tone="success" title="Password updated">
        You&apos;ve been signed out of all devices for security. <Link href="/login" className="font-semibold underline">Log in with your new password</Link>.
      </Alert>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pwOk(pw)) return setErr("Your password doesn't meet all the requirements");
        if (pw !== pw2) return setErr("Passwords don't match");
        setErr(null);
        setBusy(true);
        try {
          await apiFetch("/api/auth/reset", { method: "POST", json: { token, password: pw } });
          setDone(true);
          toast.success("Password updated");
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="rp-1">New password</Label>
        <Input id="rp-1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
        <PasswordRules value={pw} />
      </div>
      <div>
        <Label htmlFor="rp-2">Confirm new password</Label>
        <Input id="rp-2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required aria-invalid={pw2.length > 0 && pw !== pw2 ? true : undefined} />
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        Update password
      </Button>
    </form>
  );
}
