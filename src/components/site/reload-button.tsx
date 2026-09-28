"use client";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

export function ReloadButton() {
  return (
    <Button onClick={() => window.location.reload()}>
      <RotateCcw className="h-4 w-4" aria-hidden /> Try again
    </Button>
  );
}
