"use client";

import { useEffect, useState, useCallback } from "react";
import type { InsectDetectionData } from "@/lib/types";
import { Bug, Camera, RefreshCw, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";

const SEVERITY_STYLES = {
  none:   { badge: "bg-green-100 text-green-800",  bar: "bg-green-500",  dot: "bg-green-400",  label: "None"   },
  low:    { badge: "bg-yellow-100 text-yellow-800", bar: "bg-yellow-400", dot: "bg-yellow-400", label: "Low"    },
  medium: { badge: "bg-orange-100 text-orange-800", bar: "bg-orange-500", dot: "bg-orange-500", label: "Medium" },
  high:   { badge: "bg-red-100 text-red-800",       bar: "bg-red-600",    dot: "bg-red-500",    label: "High"   },
};

type CaptureState = "idle" | "sending" | "waiting";

export default function InsectDetectionPage() {
  const [latest, setLatest] = useState<InsectDetectionData | null>(null);
  const [history, setHistory] = useState<InsectDetectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [capture, setCapture] = useState<CaptureState>("idle");

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/insect");
      if (!res.ok) return;
      const data: InsectDetectionData = await res.json();
      setLatest((prev) => {
        if (!prev || data.timestamp !== prev.timestamp) {
          setHistory((h) => [data, ...h].slice(0, 10));
        }
        return data;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
    const id = setInterval(fetchLatest, 10_000);
    return () => clearInterval(id);
  }, [fetchLatest]);

  async function handleCapture() {
    setCapture("sending");
    try {
      await fetch("/api/insect", { method: "POST" });
      setCapture("waiting");
      // poll faster while waiting for Pi response
      const waitId = setInterval(async () => {
        await fetchLatest();
      }, 2000);
      setTimeout(() => {
        clearInterval(waitId);
        setCapture("idle");
      }, 15_000);
    } catch {
      setCapture("idle");
    }
  }

  const sev = latest ? SEVERITY_STYLES[latest.severity] : null;
  const detected = latest && latest.pest !== "No Pest Detected";

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bug className="w-6 h-6 text-primary-600" />
            Pest &amp; Insect Detection
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Powered by PlantInsectCNN · 19 pest classes · Images from Raspberry Pi camera
          </p>
        </div>
        <button
          type="button"
          onClick={fetchLatest}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-gray-500" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">

          {/* Capture command */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-1">Raspberry Pi Camera</p>
            <p className="text-xs text-gray-400 mb-4">
              Press the button to send a capture command to the Pi. The Pi will take a photo, run PlantInsectCNN, and the result will appear here automatically.
            </p>

            <button
              type="button"
              onClick={handleCapture}
              disabled={capture !== "idle"}
              className={`w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-semibold transition-all ${
                capture !== "idle"
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-primary-600 hover:bg-primary-700 text-white shadow-sm hover:shadow-md"
              }`}
            >
              {capture === "idle" && <><Camera className="w-5 h-5" /> Take Image Now</>}
              {capture === "sending" && <><Loader2 className="w-5 h-5 animate-spin" /> Sending command to Pi…</>}
              {capture === "waiting" && <><Loader2 className="w-5 h-5 animate-spin" /> Waiting for Pi image…</>}
            </button>

            {capture === "waiting" && (
              <p className="text-xs text-center text-gray-400 mt-2">
                Pi is capturing and processing — result will update within seconds
              </p>
            )}
          </div>

          {/* Latest result */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Latest Detection Result</p>

            {loading ? (
              <div className="h-32 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-primary-500" />
              </div>
            ) : latest ? (
              <div className="space-y-4">
                {/* Main result */}
                <div className={`flex items-start gap-4 p-4 rounded-lg ${detected ? "bg-red-50" : "bg-green-50"}`}>
                  <div className={`p-2.5 rounded-full ${detected ? "bg-red-100" : "bg-green-100"}`}>
                    {detected
                      ? <AlertTriangle className="w-6 h-6 text-red-600" />
                      : <CheckCircle className="w-6 h-6 text-green-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-gray-900">{latest.pest}</h3>
                      {sev && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sev.badge}`}>
                          {sev.label} Severity
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Plant: <span className="font-medium text-gray-700">{latest.plantAffected}</span>
                      &nbsp;·&nbsp;{new Date(latest.timestamp).toLocaleTimeString()}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-700">
                        {Math.round(latest.confidence * 100)}% confidence
                      </span>
                      <div className="flex-1">
                        <ProgressBar value={latest.confidence} color={sev?.bar ?? "bg-green-500"} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top predictions */}
                {latest.topPredictions.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top Predictions</p>
                    <div className="space-y-2">
                      {latest.topPredictions.map((p, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm text-gray-700 w-32 truncate">{p.pest}</span>
                          <div className="flex-1">
                            <ProgressBar value={p.confidence} color={i === 0 ? "bg-primary-500" : "bg-gray-300"} />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right">
                            {Math.round(p.confidence * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Treatment */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Recommended Treatment</p>
                  <p className="text-sm text-amber-900">{latest.treatment}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No detection data yet — press "Take Image Now"</p>
            )}
          </div>
        </div>

        {/* Detection log */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">Detection Log</p>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No history yet</p>
          ) : (
            <div className="space-y-2.5">
              {history.map((item, i) => {
                const s = SEVERITY_STYLES[item.severity];
                return (
                  <div key={i} className="flex items-start gap-2.5 pb-2.5 border-b border-gray-100 last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${s.dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.pest}</p>
                      <p className="text-xs text-gray-400">
                        {Math.round(item.confidence * 100)}% · {new Date(item.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Auto-updates every 10s. Pi camera sends images automatically; press "Take Image Now" for an immediate capture.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
