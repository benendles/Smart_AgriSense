"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, Loader2, Check, RotateCcw, ZoomIn, X, Upload } from "lucide-react";

type State = "idle" | "sending" | "waiting" | "review" | "analyzing";

/**
 * Capture → review → confirm flow for the vision services.
 *  1. "Take Image Now"  → POST /api/<service>  (Pi captures, uploads, holds image)
 *  2. poll /api/capture/<service>/pending until the photo is available
 *  3. show it → farmer picks "Use this image" (confirm → analyse) or "Retake" (discard → recapture)
 */
export default function CaptureReview({
  service,
  onResult,
}: {
  service: "plant" | "insect" | "disease";
  onResult: () => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [src, setSrc] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);   // fullscreen inspect view
  const [zoomed, setZoomed] = useState(false);       // toggle fit ↔ 2.5×
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const stop = () => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
  };

  // No file → the Pi camera captures. With a file → upload that photo instead
  // (e.g. a sharp phone photo), bypassing the Pi camera. Same review flow either way.
  const capture = useCallback(async (file?: File) => {
    setState("sending");
    setSrc(null);
    // Clear any previously-held photo FIRST, so the poll below can only ever
    // return the genuinely NEW image (not the last one still sitting in /pending).
    try { await fetch(`/api/capture/${service}/discard`, { method: "POST" }); } catch { /* ignore */ }
    if (file) {
      const fd = new FormData(); fd.append("image", file);
      try { await fetch(`/api/capture/${service}/upload`, { method: "POST", body: fd }); } catch { /* ignore */ }
    } else {
      try { await fetch(`/api/${service}`, { method: "POST" }); } catch { /* ignore */ }
    }
    setState("waiting");
    let tries = 0;
    stop();
    poll.current = setInterval(async () => {
      tries += 1;
      try {
        const r = await fetch(`/api/capture/${service}/pending?t=${Date.now()}`, { cache: "no-store" });
        if (r.ok) {
          stop();
          setSrc(`/api/capture/${service}/pending?t=${Date.now()}`);
          setState("review");
          return;
        }
      } catch { /* keep polling */ }
      if (tries >= 45) { stop(); setState("idle"); }   // give up after ~45s
    }, 1000);
  }, [service]);

  const useImage = async () => {
    setState("analyzing");
    try { await fetch(`/api/capture/${service}/confirm`, { method: "POST" }); } catch { /* ignore */ }
    setSrc(null);
    setState("idle");
    onResult();   // refresh the result card
  };

  const retake = async () => {
    try { await fetch(`/api/capture/${service}/discard`, { method: "POST" }); } catch { /* ignore */ }
    capture();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm font-semibold text-gray-700 mb-1">Raspberry Pi Camera</p>
      <p className="text-xs text-gray-400 mb-4">
        Capture a photo, then review it below — keep it or retake before it&apos;s analysed.
      </p>

      {state === "review" && src ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => { setZoomed(false); setZoomOpen(true); }}
            className="relative block w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50 cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Captured by the Pi" className="w-full max-h-80 object-contain" />
            <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[11px] px-2 py-1 rounded-full flex items-center gap-1">
              <ZoomIn className="w-3 h-3" /> Tap to zoom
            </span>
          </button>
          <p className="text-xs text-center text-gray-500">
            Zoom in to check it&apos;s clear &amp; in focus, then choose:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={retake}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Retake
            </button>
            <button
              type="button"
              onClick={useImage}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              <Check className="w-4 h-4" /> Use this image
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => capture()}
            disabled={state !== "idle"}
            className={`w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-semibold transition-all ${
              state !== "idle"
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-primary-600 hover:bg-primary-700 text-white shadow-sm hover:shadow-md"
            }`}
          >
            {state === "idle"      && <><Camera className="w-5 h-5" /> Take Image Now</>}
            {state === "sending"   && <><Loader2 className="w-5 h-5 animate-spin" /> Sending…</>}
            {state === "waiting"   && <><Loader2 className="w-5 h-5 animate-spin" /> Waiting for image…</>}
            {state === "analyzing" && <><Loader2 className="w-5 h-5 animate-spin" /> Analysing…</>}
          </button>

          {/* Upload a photo instead (e.g. a sharp phone photo) — bypasses the Pi camera */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            aria-label="Upload a photo"
            title="Upload a photo"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) capture(f); e.target.value = ""; }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={state !== "idle"}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" /> Upload a photo instead
          </button>
        </div>
      )}

      {/* Fullscreen inspect / zoom — tap image to zoom 2.5×, tap outside to close */}
      {zoomOpen && src && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => { setZoomOpen(false); setZoomed(false); }}
        >
          <button
            type="button"
            onClick={() => { setZoomOpen(false); setZoomed(false); }}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            aria-label="Close zoom"
          >
            <X className="w-7 h-7" />
          </button>
          <div className="max-w-full max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Captured photo — zoom"
              onClick={() => setZoomed((z) => !z)}
              className={`origin-center transition-transform ${zoomed ? "scale-[2.5] cursor-zoom-out" : "cursor-zoom-in"}`}
              style={{ maxHeight: zoomed ? "none" : "85vh", maxWidth: zoomed ? "none" : "90vw" }}
            />
          </div>
          <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">
            Tap the image to zoom in / out · tap outside to close
          </p>
        </div>
      )}
    </div>
  );
}
