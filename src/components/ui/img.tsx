"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Image with graceful fallback to a local illustrated placeholder (works offline in the Android app). */
export function Img({ src, alt, className, fallback = "/images/placeholder-room.svg" }: { src?: string | null; alt: string; className?: string; fallback?: string }) {
  const [err, setErr] = useState(false);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={!src || err ? fallback : src} alt={alt} loading="lazy" onError={() => setErr(true)} className={cn("object-cover", className)} />;
}
