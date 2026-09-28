"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, LogOut, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { Button, Card, CardBody, CardHeader, Checkbox, Input, Label, Select, TableSkeleton, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PasswordRules, pwOk } from "./password-forms";

type Profile = { name: string; email: string; phone: string; emailVerified: boolean; phoneVerified: boolean; gender: string; dateOfBirth: string; occupation: string; address: string; city: string; emergencyName: string; emergencyPhone: string };

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/account/profile", {
        method: "PATCH",
        json: { name: f.name, email: f.email, phone: f.phone, gender: f.gender, dateOfBirth: f.dateOfBirth, occupation: f.occupation, address: f.address, city: f.city, emergencyName: f.emergencyName, emergencyPhone: f.emergencyPhone },
      });
      toast.success("Profile saved");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const max = new Date(Date.now() - 16 * 365.25 * 86400_000).toISOString().slice(0, 10);
  return (
    <Card>
      <CardHeader title="Personal details" description="Used to pre-fill bookings and share with the property at check-in." />
      <CardBody>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="pf-name">Full name</Label>
            <Input id="pf-name" value={f.name} onChange={set("name")} required minLength={2} maxLength={80} autoComplete="name" />
          </div>
          <div>
            <Label htmlFor="pf-email">
              Email {f.email && f.email === initial.email && initial.emailVerified && <BadgeCheck className="ml-1 inline h-4 w-4 text-emerald-600" aria-label="verified" />}
            </Label>
            <Input id="pf-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="pf-phone">
              Mobile {f.phone && f.phone === initial.phone && initial.phoneVerified && <BadgeCheck className="ml-1 inline h-4 w-4 text-emerald-600" aria-label="verified" />}
            </Label>
            <Input id="pf-phone" value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" />
          </div>
          <div>
            <Label htmlFor="pf-gender">Gender</Label>
            <Select id="pf-gender" value={f.gender} onChange={set("gender")}>
              <option value="">Prefer not to say</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="pf-dob">Date of birth</Label>
            <Input id="pf-dob" type="date" max={max} value={f.dateOfBirth} onChange={set("dateOfBirth")} />
          </div>
          <div>
            <Label htmlFor="pf-occ">Occupation</Label>
            <Select id="pf-occ" value={["", "Student", "Working professional", "Self-employed", "Traveller", "Other"].includes(f.occupation) ? f.occupation : "Other"} onChange={set("occupation")}>
              <option value="">Select</option>
              <option>Student</option>
              <option>Working professional</option>
              <option>Self-employed</option>
              <option>Traveller</option>
              <option>Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="pf-city">Home city</Label>
            <Input id="pf-city" value={f.city} onChange={set("city")} maxLength={80} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pf-addr">Permanent address</Label>
            <Textarea id="pf-addr" value={f.address} onChange={set("address")} maxLength={300} rows={2} />
          </div>
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">Emergency contact</legend>
            <div>
              <Label htmlFor="pf-en">Name</Label>
              <Input id="pf-en" value={f.emergencyName} onChange={set("emergencyName")} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="pf-ep">Mobile</Label>
              <Input id="pf-ep" value={f.emergencyPhone} onChange={set("emergencyPhone")} inputMode="tel" />
            </div>
          </fieldset>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={busy}>
              Save changes
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function ChangePassword({ hasPassword }: { hasPassword: boolean }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [others, setOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pwOk(pw)) return toast.error("New password doesn't meet the requirements");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await apiFetch("/api/account/password", { method: "POST", json: { currentPassword: hasPassword ? cur : undefined, newPassword: pw, logoutOthers: others } });
      toast.success(hasPassword ? "Password changed" : "Password set — you can now log in with it");
      setCur("");
      setPw("");
      setPw2("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader title={hasPassword ? "Change password" : "Set a password"} description={hasPassword ? undefined : "You signed up with OTP or Google. Add a password to log in with it too."} />
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {hasPassword && (
            <div className="sm:col-span-2 sm:max-w-sm">
              <Label htmlFor="cp-cur">Current password</Label>
              <Input id="cp-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
            </div>
          )}
          <div>
            <Label htmlFor="cp-new">New password</Label>
            <Input id="cp-new" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
            <PasswordRules value={pw} />
          </div>
          <div>
            <Label htmlFor="cp-new2">Confirm new password</Label>
            <Input id="cp-new2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
          </div>
          <Checkbox label="Sign out of all other devices" checked={others} onChange={(e) => setOthers(e.target.checked)} className="sm:col-span-2" />
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={busy}>
              {hasPassword ? "Update password" : "Set password"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

type Session = { id: string; userAgent: string | null; ip: string | null; createdAt: string; lastUsedAt: string; current: boolean };

function device(ua: string | null) {
  if (!ua) return { name: "Unknown device", mobile: false };
  const mobile = /android|iphone|ipad|mobile/i.test(ua);
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Device";
  const br = /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /firefox\//i.test(ua) ? "Firefox" : /safari\//i.test(ua) ? "Safari" : "Browser";
  return { name: `${br} on ${os}`, mobile };
}

export function DevicesList() {
  const [rows, setRows] = useState<Session[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => apiFetch<Session[]>("/api/auth/sessions").then(setRows).catch((e) => toast.error((e as Error).message)), []);
  useEffect(() => {
    void load();
  }, [load]);
  async function revoke(id: string) {
    setBusy(id);
    try {
      await apiFetch(`/api/auth/sessions?id=${id}`, { method: "DELETE" });
      toast.success("Device signed out");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function logoutAll() {
    setBusy("all");
    try {
      await apiFetch("/api/auth/logout-all", { method: "POST" });
      window.location.href = "/login";
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }
  return (
    <Card>
      <CardHeader
        title="Active devices"
        description="Devices currently signed in to your account."
        action={
          <Button variant="outline" size="sm" onClick={() => setConfirmAll(true)} className="border-red-200 text-red-700 hover:bg-red-50">
            <LogOut className="h-4 w-4" aria-hidden /> Log out everywhere
          </Button>
        }
      />
      <CardBody>
        {!rows ? (
          <TableSkeleton rows={2} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((s) => {
              const d = device(s.userAgent);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">{d.mobile ? <Smartphone className="h-5 w-5" aria-hidden /> : <Monitor className="h-5 w-5" aria-hidden />}</span>
                    <span>
                      <span className="block text-sm font-medium">
                        {d.name} {s.current && <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">This device</span>}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {s.ip ?? "Unknown IP"} · last active {new Date(s.lastUsedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </span>
                  </span>
                  {!s.current && (
                    <Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => revoke(s.id)}>
                      Log out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} onConfirm={logoutAll} loading={busy === "all"} tone="danger" title="Log out of all devices?" description="You'll be signed out everywhere, including this device." confirmText="Log out everywhere" />
    </Card>
  );
}
