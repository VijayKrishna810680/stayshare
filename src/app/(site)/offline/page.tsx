import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { ReloadButton } from "@/components/site/reload-button";

export const metadata: Metadata = { title: "You're offline" };

export default function OfflinePage() {
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-500">
          <WifiOff className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold">You&apos;re offline</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-600">Check your internet connection. Your bookings and QR codes will be available again as soon as you&apos;re back online.</p>
        <div className="mt-6">
          <ReloadButton />
        </div>
      </div>
    </div>
  );
}
