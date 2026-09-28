"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, QrCode } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";

type Detector = { detect: (src: CanvasImageSource | ImageBitmap) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

function getDetector(): Detector | null {
  const C = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!C) return null;
  try {
    return new C({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/**
 * Booking QR scanner. Uses the browser BarcodeDetector API with the rear camera when available;
 * otherwise (or if camera permission is denied) falls back to scanning a photo or manual entry.
 */
export function QrScanner({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [manual, setManual] = useState("");
  const done = useRef(false);
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    if (!open) return;
    done.current = false;
    setError(null);
    const detector = getDetector();
    if (!detector) {
      setSupported(false);
      return;
    }
    setSupported(true);
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        timer = setInterval(async () => {
          if (done.current || !v.videoWidth) return;
          try {
            const codes = await detector.detect(v);
            if (codes[0]?.rawValue) {
              done.current = true;
              cb.current(codes[0].rawValue);
            }
          } catch {
            /* frame not ready */
          }
        }, 300);
      } catch (e) {
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access or enter the booking number." : "Couldn't start the camera on this device.");
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  const fromPhoto = async (f: File | undefined) => {
    if (!f) return;
    const detector = getDetector();
    if (!detector) return setError("This browser can't read QR codes from photos. Enter the booking number instead.");
    try {
      const bmp = await createImageBitmap(f);
      const codes = await detector.detect(bmp);
      if (codes[0]?.rawValue) onResult(codes[0].rawValue);
      else setError("No QR code found in that photo. Try again closer to the code.");
    } catch {
      setError("Couldn't read that photo.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Scan booking QR" description="Point the camera at the QR code in the guest's booking confirmation.">
      <div className="space-y-4">
        {supported ? (
          <div className="relative overflow-hidden rounded-2xl bg-slate-900">
            <video ref={video} className="aspect-square w-full object-cover" muted playsInline aria-label="Camera preview" />
            <div className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-white/70" aria-hidden />
            <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">
              <Camera className="mr-1 inline h-3.5 w-3.5" /> Scanning…
            </p>
          </div>
        ) : (
          <Alert tone="info" title="Camera scanning isn't supported in this browser">
            Use Chrome on Android for live scanning, or type the booking number / phone below.
          </Alert>
        )}
        {error && <Alert tone="warn">{error}</Alert>}
        {supported && (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ImageUp className="h-4 w-4" /> Scan from a photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => fromPhoto(e.target.files?.[0])} />
          </label>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onResult(manual.trim());
          }}
        >
          <Input aria-label="Booking number or phone" placeholder="Booking number or phone" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Button type="submit" variant="outline">
            <QrCode className="h-4 w-4" /> Find
          </Button>
        </form>
      </div>
    </Dialog>
  );
}
