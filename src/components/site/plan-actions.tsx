"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiClientError } from "@/lib/client-api";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/dialog";
import { startPayment, type Checkout } from "./pay";

export function BuyPlanButton({ planId, label = "Buy now", variant = "primary", doneUrl = "/account/subscriptions?payment=success" }: { planId: string; label?: string; variant?: "primary" | "accent" | "outline"; doneUrl?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      className="w-full"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await apiFetch<{ subscriptionId: string; checkout: Checkout; activated: boolean }>("/api/subscriptions", { method: "POST", json: { planId } });
          if (r.activated) {
            toast.success("Plan activated!");
            router.refresh();
            return;
          }
          const res = await startPayment(r.checkout, { doneUrl, description: "StayShare membership" });
          if (res === "dismissed") toast.info("Payment not completed");
        } catch (e) {
          if (e instanceof ApiClientError && e.status === 401) {
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
            return;
          }
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

export function CancelPlanButton({ subscriptionId, endsAt }: { subscriptionId: string; endsAt: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setOpen(true)}>
        Cancel plan
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        loading={busy}
        title="Cancel your membership?"
        description={`Your benefits stay active until ${new Date(endsAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}. Plans never auto-renew.`}
        confirmText="Cancel membership"
        onConfirm={async () => {
          setBusy(true);
          try {
            await apiFetch(`/api/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
            toast.success("Membership cancelled — benefits continue until the end date");
            setOpen(false);
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
