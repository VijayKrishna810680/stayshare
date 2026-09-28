"use client";
import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiClientError } from "@/lib/client-api";
import { cn } from "@/lib/cn";

export function FavouriteButton({ propertyId, initial, className, withLabel }: { propertyId: string; initial: boolean; className?: string; withLabel?: boolean }) {
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      if (fav) await apiFetch(`/api/favourites?propertyId=${propertyId}`, { method: "DELETE" });
      else await apiFetch("/api/favourites", { method: "POST", json: { propertyId } });
      setFav(!fav);
      toast.success(fav ? "Removed from saved properties" : "Saved to your favourites");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={fav}
      aria-label={fav ? "Remove from favourites" : "Save to favourites"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-white/95 p-2 text-sm font-medium shadow-sm ring-1 ring-slate-200 transition hover:scale-105 disabled:opacity-60",
        withLabel && "px-3",
        className,
      )}
    >
      <Heart className={cn("h-4 w-4", fav ? "fill-red-500 text-red-500" : "text-slate-600")} aria-hidden />
      {withLabel && <span>{fav ? "Saved" : "Save"}</span>}
    </button>
  );
}
