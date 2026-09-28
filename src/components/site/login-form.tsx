"use client";
import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, KeyRound, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiClientError } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Alert, Button, Input, Label } from "@/components/ui";
import { GoogleButton } from "./auth-shell";
import { postLoginPath } from "./auth-redirect";

type AuthRes = { id: string; name: string; roles: string[]; isAdmin?: boolean; isNew?: boolean };

export function OtpFlow({ next, initialTarget = "" }: { next?: string; initialTarget?: string }) {
  const [target, setTarget] = useState(initialTarget);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [needName, setNeedName] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function request(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await apiFetch<{ target: string; devCode?: string }>("/api/auth/otp/request", { method: "POST", json: { target: target.trim(), purpose: "LOGIN" } });
      setSentTo(r.target);
      setDevCode(r.devCode ?? null);
      toast.success(`OTP sent to ${r.target}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await apiFetch<AuthRes>("/api/auth/otp/verify", { method: "POST", json: { target: sentTo, code, ...(needName ? { name: name.trim() } : {}) } });
      toast.success(r.isNew ? `Welcome to StayShare, ${r.name.split(" ")[0]}!` : `Welcome back, ${r.name.split(" ")[0]}`);
      window.location.href = postLoginPath(r, next);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "NAME_REQUIRED") {
        setNeedName(true);
        setErr(null);
        toast.info("Looks like you're new here — tell us your name to create your account");
      } else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <form onSubmit={request} className="space-y-4">
        <div>
          <Label htmlFor="otp-target">Mobile number or email</Label>
          <Input id="otp-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="98xxxxxx10 or you@example.com" autoComplete="username" required />
          <p className="mt-1 text-xs text-slate-500">We&apos;ll send a 6-digit one-time password. New here? We&apos;ll create your account.</p>
        </div>
        {err && <Alert tone="error">{err}</Alert>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Send OTP
        </Button>
      </form>
    );
  }
  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-slate-600">
        Enter the code sent to <span className="font-semibold">{sentTo}</span>.{" "}
        <button type="button" className="font-medium text-brand-700 underline" onClick={() => (setSentTo(null), setCode(""), setNeedName(false))}>
          Change
        </button>
      </p>
      {devCode && (
        <Alert tone="info" title="Development mode">
          Your OTP is <span className="font-mono font-bold">{devCode}</span> (shown only in development).
        </Alert>
      )}
      <div>
        <Label htmlFor="otp-code">One-time password</Label>
        <Input id="otp-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" className="text-center text-lg tracking-[0.5em]" required minLength={6} maxLength={6} autoFocus />
      </div>
      {needName && (
        <div>
          <Label htmlFor="otp-name">Your full name</Label>
          <Input id="otp-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} autoFocus />
        </div>
      )}
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={busy} disabled={code.length !== 6 || (needName && name.trim().length < 2)}>
        {needName ? "Create account & continue" : "Verify & continue"}
      </Button>
      <button type="button" onClick={() => request()} disabled={busy} className="w-full text-center text-sm font-medium text-brand-700 hover:underline disabled:opacity-50">
        Resend OTP
      </button>
    </form>
  );
}

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [tab, setTab] = useState<"password" | "otp">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(error === "google_not_configured" ? "Google sign-in isn't set up yet. Please use your password or an OTP." : error ? "Sign-in failed. Please try again." : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await apiFetch<AuthRes>("/api/auth/login", { method: "POST", json: { identifier: identifier.trim(), password } });
      toast.success(`Welcome back, ${r.name.split(" ")[0]}`);
      window.location.href = postLoginPath(r, next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Login method">
        {[
          { v: "password" as const, l: "Password", icon: KeyRound },
          { v: "otp" as const, l: "OTP", icon: Smartphone },
        ].map((t) => (
          <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => setTab(t.v)} className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold", tab === t.v ? "bg-white text-brand-700 shadow-sm" : "text-slate-600")}>
            <t.icon className="h-4 w-4" aria-hidden /> {t.l}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "password" ? (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="identifier">Email or mobile number</Label>
              <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="mb-1 text-xs font-medium text-brand-700 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input id="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="pr-10" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3 text-slate-500" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {err && <Alert tone="error">{err}</Alert>}
            <Button type="submit" className="w-full" size="lg" loading={busy}>
              Log in
            </Button>
          </form>
        ) : (
          <OtpFlow next={next} />
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
      </div>
      <GoogleButton next={next} />
    </div>
  );
}
