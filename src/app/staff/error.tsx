"use client";
import { Button, ErrorState } from "@/components/ui";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="This page couldn't load"
      description={error.digest ? `Something went wrong (ref ${error.digest}). Please try again.` : "Something went wrong. Please try again."}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
