"use client";
import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { toast } from "sonner";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Add to home screen" (PWA) + Android app link (NEXT_PUBLIC_ANDROID_APP_URL when published). */
export function InstallApp() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const androidUrl = process.env.NEXT_PUBLIC_ANDROID_APP_URL;
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => setInstalled(true));
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  async function install() {
    if (evt) {
      await evt.prompt();
      const c = await evt.userChoice;
      if (c.outcome === "accepted") setInstalled(true);
      setEvt(null);
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast.info(ios ? "Tap the Share button in Safari, then “Add to Home Screen”." : "Open your browser menu (⋮) and choose “Install app” or “Add to Home screen”.", { duration: 7000 });
  }
  return (
    <div className="flex flex-wrap gap-3">
      {androidUrl ? (
        <a href={androidUrl} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
          <Smartphone className="h-5 w-5" aria-hidden /> Get the Android app
        </a>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-xl bg-slate-900/80 px-4 py-3 text-sm font-semibold text-white/90">
          <Smartphone className="h-5 w-5" aria-hidden /> Android app — coming soon on Google Play
        </span>
      )}
      <button onClick={install} disabled={installed} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-brand-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60">
        <Download className="h-5 w-5" aria-hidden /> {installed ? "Installed on this device" : "Add to home screen"}
      </button>
    </div>
  );
}
