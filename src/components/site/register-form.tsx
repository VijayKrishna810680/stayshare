"use client";
import { useState } from "react";
import { Building2, Eye, EyeOff, User } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Alert, Button, Input, Label } from "@/components/ui";
import { GoogleButton } from "./auth-shell";
import { postLoginPath } from "./auth-redirect";
import { PasswordRules, pwOk } from "./password-forms";

export function RegisterForm({ initialType, next }: { initialType: "CUSTOMER" | "OWNER"; next?: string }) {
  const [type, setType] = useState(initialType);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email.trim() && !phone.trim()) return setErr("Add an email or a mobile number");
    if (!pwOk(password)) return setErr("Your password doesn't meet all the requirements");
    if (type === "OWNER" && businessName.trim().length < 2) return setErr("Enter your business or property brand name");
    setBusy(true);
    try {
      const r = await apiFetch<{ id: string; name: string; roles: string[] }>("/api/auth/register", {
        method: "POST",
        json: { name: name.trim(), email: email.trim(), phone: phone.trim(), password, accountType: type, businessName: type === "OWNER" ? businessName.trim() : undefined },
      });
      toast.success(`Welcome to StayShare, ${r.name.split(" ")[0]}!`);
      window.location.href = type === "OWNER" ? "/owner" : postLoginPath(r, next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
        {[
          { v: "CUSTOMER" as const, l: "I want to book stays", icon: User },
          { v: "OWNER" as const, l: "I'm a property owner", icon: Building2 },
        ].map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={type === o.v} onClick={() => setType(o.v)} className={cn("flex flex-col items-center gap-1 rounded-2xl border p-3 text-sm font-semibold", type === o.v ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-200" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
            <o.icon className="h-5 w-5" aria-hidden /> {o.l}
          </button>
        ))}
      </div>
      <div>
        <Label htmlFor="rg-name">Full name</Label>
        <Input id="rg-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} />
      </div>
      {type === "OWNER" && (
        <div>
          <Label htmlFor="rg-biz">Business / brand name</Label>
          <Input id="rg-biz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Sunrise Co-Living" required maxLength={120} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="rg-email">Email</Label>
          <Input id="rg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="rg-phone">Mobile number</Label>
          <Input id="rg-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="10-digit mobile" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate-500">Provide at least one — you can log in with either.</p>
      <div>
        <Label htmlFor="rg-pw">Password</Label>
        <div className="relative">
          <Input id="rg-pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3 text-slate-500" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordRules value={password} />
      </div>
      {type === "OWNER" && <Alert tone="info">After signing up you can add your building, rooms and photos. StayShare verifies your property and sets customer prices before it goes live.</Alert>}
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {type === "OWNER" ? "Create partner account" : "Create account"}
      </Button>
      {type === "CUSTOMER" && (
        <>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
          </div>
          <GoogleButton next={next} />
        </>
      )}
    </form>
  );
}
