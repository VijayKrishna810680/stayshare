"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/dialog";
import { call, useAction } from "./common";

export function SubmitForReviewButton({ propertyId, disabled }: { propertyId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Send className="h-4 w-4" /> Submit for review
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Submit for StayShare review?"
        description="Our team will verify your details, photos and documents and set prices for each room. You'll be notified once it's live."
        confirmText="Submit"
        loading={pending === "submit"}
        onConfirm={async () => {
          await run("submit", () => call(`/api/owner/properties/${propertyId}/submit`), { success: "Submitted for review" });
          setOpen(false);
        }}
      />
    </>
  );
}

export function DeleteDraftButton({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <>
      <Button variant="outline" className="text-red-600" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Delete draft
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this draft property?"
        description="This removes the draft with its rooms and photos. This can't be undone."
        confirmText="Delete"
        tone="danger"
        loading={pending === "del"}
        onConfirm={async () => {
          const r = await run("del", () => call(`/api/owner/properties/${propertyId}`, "DELETE"), { success: "Draft deleted", refresh: false });
          if (r) router.push("/owner/properties");
          setOpen(false);
        }}
      />
    </>
  );
}
