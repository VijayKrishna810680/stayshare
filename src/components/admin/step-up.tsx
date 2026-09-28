"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/client-api";
import { Dialog } from "@/components/ui/dialog";
import { Button, Input, Label, Select } from "@/components/ui";

type Runner = <T>(fn: () => Promise<T>) => Promise<T>;
const Ctx = createContext<Runner | null>(null);

/**
 * Wrap any admin API call: when the server answers 428 STEP_UP_REQUIRED, an OTP dialog opens,
 * the admin verifies via POST /api/auth/step-up and the original request is retried once.
 */
export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"phone" | "email">("phone");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);

  const run: Runner = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 428) {
        await new Promise<void>((resolve, reject) => {
          pending.current = { resolve, reject };
          setCode("");
          setSent(false);
          setDevCode(null);
          setOpen(true);
        });
        return fn();
      }
      throw e;
    }
  }, []);

  const close = () => {
    setOpen(false);
    pending.current?.reject(new ApiClientError(428, "STEP_UP_CANCELLED", "Verification cancelled"));
    pending.current = null;
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await apiFetch<{ sent: boolean; devCode?: string }>("/api/auth/step-up", { method: "POST", json: { action: "send", channel } });
      setSent(true);
      setDevCode(r.devCode ?? null);
      toast.success(`OTP sent to your registered ${channel}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/auth/step-up", { method: "POST", json: { action: "verify", code, channel } });
      toast.success("Verified — you can make sensitive changes for the next 10 minutes");
      setOpen(false);
      pending.current?.resolve();
      pending.current = null;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Ctx.Provider value={run}>
      {children}
      <Dialog
        open={open}
        onClose={close}
        title="Verify it's you"
        description="This change is protected. Enter the one-time password sent to your registered phone or email."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            {sent ? (
              <Button onClick={verify} loading={busy} disabled={code.length !== 6}>
                Verify & continue
              </Button>
            ) : (
              <Button onClick={send} loading={busy}>
                Send OTP
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden /> Step-up verification lasts 10 minutes for this session.
          </div>
          <div>
            <Label htmlFor="su-channel">Send code to</Label>
            <Select id="su-channel" value={channel} onChange={(e) => setChannel(e.target.value as "phone" | "email")} disabled={sent}>
              <option value="phone">Registered phone (SMS)</option>
              <option value="email">Registered email</option>
            </Select>
          </div>
          {sent && (
            <div>
              <Label htmlFor="su-code">6-digit OTP</Label>
              <Input id="su-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
              {devCode && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Development mode — your OTP is <strong className="font-mono">{devCode}</strong></p>}
              <button type="button" className="mt-2 text-xs text-brand-700 hover:underline" onClick={send} disabled={busy}>
                Resend code
              </button>
            </div>
          )}
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useStepUp(): Runner {
  const r = useContext(Ctx);
  return r ?? (async (fn) => fn());
}

/**
 * Standard mutation helper: runs the request through step-up, toasts success/error and refreshes the
 * server components. Returns the response (or undefined on error).
 */
export function useAdminAction() {
  const run = useStepUp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const exec = useCallback(
    async <T,>(fn: () => Promise<T>, opts: { success?: string; refresh?: boolean } = {}): Promise<T | undefined> => {
      setBusy(true);
      try {
        const out = await run(fn);
        if (opts.success) toast.success(opts.success);
        if (opts.refresh !== false) router.refresh();
        return out;
      } catch (e) {
        if (!(e instanceof ApiClientError && e.code === "STEP_UP_CANCELLED")) toast.error((e as Error).message);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [run, router],
  );
  return { exec, busy };
}
