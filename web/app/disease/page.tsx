"use client";

import { useEffect, useState, useCallback } from "react";
import type { DiseaseData } from "@/lib/types";
import { Leaf, Camera, RefreshCw, AlertCircle, CheckCircle, Clock, Loader2 } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";

type CaptureState = "idle" | "sending" | "waiting";

export default function DiseaseDetectionPage() {
  const [latest, setLatest] = useState<DiseaseData | null>(null);
  const [history, setHistory] = useState<DiseaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [capture, setCapture] = useState<CaptureState>("idle");

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/disease");
      if (!res.ok) return;
      const data: DiseaseData = await res.json();
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
      await fetch("/api/disease", { method: "POST" });
      setCapture("waiting");
      const waitId = setInterval(fetchLatest, 2000);
      setTimeout(() => { clearInterval(waitId); setCapture("idle"); }, 15_000);
    } catch {
      setCapture("idle");
    }
  }

  const isHealthy = latest?.disease === "Healthy";
  const pct = latest ? latest.confidence : 0;
  const barColor = isHealthy ? "bg-green-500" : (pct >= 0.8 ? "bg-red-500" : "bg-yellow-500");

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Leaf className="w-6 h-6 text-primary-600" />
            Disease Detection
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Detects plant diseases from leaf images · Images from Raspberry Pi camera
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
              Press the button to command the Pi to take a close-up of a plant leaf. The disease detection model will run automatically and the result will appear here.
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
              {capture === "idle"    && <><Camera className="w-5 h-5" /> Take Image Now</>}
              {capture === "sending" && <><Loader2 className="w-5 h-5 animate-spin" /> Sending command to Pi…</>}
              {capture === "waiting" && <><Loader2 className="w-5 h-5 animate-spin" /> Waiting for Pi image…</>}
            </button>
            {capture === "waiting" && (
              <p className="text-xs text-center text-gray-400 mt-2">
                Pi is capturing — result will update within seconds
              </p>
            )}
          </div>

          {/* Result */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Latest Detection Result</p>
            {loading ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-primary-500" />
              </div>
            ) : latest ? (
              <div className="space-y-4">
                {/* Status block */}
                <div className={`flex items-start gap-4 p-4 rounded-xl ${isHealthy ? "bg-green-50" : "bg-red-50"}`}>
                  <div className={`p-2.5 rounded-full ${isHealthy ? "bg-green-100" : "bg-red-100"}`}>
                    {isHealthy
                      ? <CheckCircle className="w-6 h-6 text-green-600" />
                      : <AlertCircle className="w-6 h-6 text-red-600" />
                    }
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-lg font-bold ${isHealthy ? "text-green-800" : "text-red-800"}`}>
                      {latest.disease}
                    </h3>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Plant: <span className="font-semibold text-gray-800">{latest.plantType}</span>
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-700">
                        {Math.round(latest.confidence * 100)}% confidence
                      </span>
                      <div className="flex-1">
                        <ProgressBar value={latest.confidence} color={barColor} />
                      </div>
                    </div>
                  </div>
                </div>

                {latest.weedDetected && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    <p className="text-sm text-yellow-800 font-medium">
                      ⚠ Weed presence detected — consider manual removal or herbicide.
                    </p>
                  </div>
                )}

                {!isHealthy && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-800 mb-1">Recommended Action</p>
                    <p className="text-sm text-amber-900">
                      Remove infected leaves immediately to limit spread. Check the Farm Practice page for a full treatment plan.
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Analysed at {new Date(latest.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No detection data yet — press "Take Image Now"</p>
            )}
          </div>
        </div>

        {/* Log */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">Detection Log</p>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No history yet</p>
          ) : (
            <div className="space-y-2.5">
              {history.map((item, i) => {
                const healthy = item.disease === "Healthy";
                return (
                  <div key={i} className="flex items-start gap-2.5 pb-2.5 border-b border-gray-100 last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${healthy ? "bg-green-400" : "bg-red-500"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.disease}</p>
                      <p className="text-xs text-gray-400">
                        {item.plantType} · {Math.round(item.confidence * 100)}% · {new Date(item.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Auto-updates every 10s. Press "Take Image Now" for an immediate capture.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
