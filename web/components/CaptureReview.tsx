"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, Loader2, Check, RotateCcw } from "lucide-react";

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
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
  };

  const capture = useCallback(async () => {
    setState("sending");
    setSrc(null);
    try { await fetch(`/api/${service}`, { method: "POST" }); } catch { /* ignore */ }
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
      if (tries >= 30) { stop(); setState("idle"); }   // give up after ~60s
    }, 2000);
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
          <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Captured by the Pi" className="w-full max-h-80 object-contain" />
          </div>
          <p className="text-xs text-center text-gray-500">Is this image clear enough to analyse?</p>
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
        <button
          type="button"
          onClick={capture}
          disabled={state !== "idle"}
          className={`w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-semibold transition-all ${
            state !== "idle"
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-primary-600 hover:bg-primary-700 text-white shadow-sm hover:shadow-md"
          }`}
        >
          {state === "idle"      && <><Camera className="w-5 h-5" /> Take Image Now</>}
          {state === "sending"   && <><Loader2 className="w-5 h-5 animate-spin" /> Sending command to Pi…</>}
          {state === "waiting"   && <><Loader2 className="w-5 h-5 animate-spin" /> Waiting for Pi image…</>}
          {state === "analyzing" && <><Loader2 className="w-5 h-5 animate-spin" /> Analysing…</>}
        </button>
      )}
    </div>
  );
}
