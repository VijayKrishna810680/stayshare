"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { Img } from "@/components/ui/img";

/** Photo mosaic + full-screen lightbox (keyboard: ←/→/Esc). */
export function Gallery({ images, name }: { images: { url: string; caption: string | null }[]; name: string }) {
  const [idx, setIdx] = useState<number | null>(null);
  const n = images.length;
  const prev = useCallback(() => setIdx((i) => (i === null ? i : (i - 1 + n) % n)), [n]);
  const next = useCallback(() => setIdx((i) => (i === null ? i : (i + 1) % n)), [n]);
  useEffect(() => {
    if (idx === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIdx(null);
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [idx, prev, next]);

  if (!n) {
    return (
      <div className="grid aspect-[16/7] place-items-center overflow-hidden rounded-3xl bg-slate-100">
        <Img src={null} alt={name} fallback="/images/placeholder-building.svg" className="h-full w-full" />
      </div>
    );
  }
  const shown = images.slice(0, 5);
  return (
    <>
      <div className="relative grid h-64 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-3xl sm:h-[26rem]">
        {shown.map((im, i) => (
          <button
            key={im.url + i}
            type="button"
            onClick={() => setIdx(i)}
            className={i === 0 ? "col-span-4 row-span-2 sm:col-span-2" : "hidden sm:block"}
            aria-label={`Open photo ${i + 1} of ${n}${im.caption ? `: ${im.caption}` : ""}`}
          >
            <Img src={im.url} alt={im.caption ?? `${name} photo ${i + 1}`} className="h-full w-full transition hover:brightness-90" />
          </button>
        ))}
        <button type="button" onClick={() => setIdx(0)} className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold shadow ring-1 ring-slate-200 hover:bg-white">
          <Images className="h-4 w-4" aria-hidden /> Show all {n} photos
        </button>
      </div>
      {idx !== null && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label="Photo gallery">
          <div className="flex items-center justify-between p-4">
            <p className="text-sm text-white/80">
              {idx + 1} / {n} {images[idx]?.caption && `· ${images[idx]!.caption}`}
            </p>
            <button onClick={() => setIdx(null)} className="rounded-full p-2 hover:bg-white/10" aria-label="Close gallery" autoFocus>
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
            <Img src={images[idx]!.url} alt={images[idx]!.caption ?? `${name} photo ${idx + 1}`} className="max-h-full max-w-full rounded-xl object-contain" />
            {n > 1 && (
              <>
                <button onClick={prev} className="absolute left-2 rounded-full bg-white/10 p-3 hover:bg-white/20 sm:left-6" aria-label="Previous photo">
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button onClick={next} className="absolute right-2 rounded-full bg-white/10 p-3 hover:bg-white/20 sm:right-6" aria-label="Next photo">
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
          <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-4">
            {images.map((im, i) => (
              <button key={im.url + i} onClick={() => setIdx(i)} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 ${i === idx ? "ring-white" : "ring-transparent opacity-60"}`} aria-label={`Photo ${i + 1}`}>
                <Img src={im.url} alt="" className="h-full w-full" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
