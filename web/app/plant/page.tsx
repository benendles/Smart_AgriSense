"use client";

import { useEffect, useState, useCallback } from "react";
import type { PlantDetectionData } from "@/lib/types";
import { Sprout, Camera, RefreshCw, Leaf, Clock, Loader2 } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";

const HEALTH_BADGE: Record<string, string> = {
  healthy:  "bg-green-100 text-green-800",
  stressed: "bg-yellow-100 text-yellow-800",
  diseased: "bg-red-100 text-red-800",
};

const HEALTH_COLOR: Record<string, string> = {
  healthy:  "bg-green-500",
  stressed: "bg-yellow-400",
  diseased: "bg-red-500",
};

const GROWTH_ORDER = ["Seedling", "Vegetative", "Flowering", "Fruiting", "Maturity"];

type CaptureState = "idle" | "sending" | "waiting";

export default function PlantDetectionPage() {
  const [latest, setLatest] = useState<PlantDetectionData | null>(null);
  const [history, setHistory] = useState<PlantDetectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [capture, setCapture] = useState<CaptureState>("idle");

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/plant");
      if (!res.ok) return;
      const data: PlantDetectionData = await res.json();
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
      await fetch("/api/plant", { method: "POST" });
      setCapture("waiting");
      const waitId = setInterval(fetchLatest, 2000);
      setTimeout(() => { clearInterval(waitId); setCapture("idle"); }, 15_000);
    } catch {
      setCapture("idle");
    }
  }

  const stageIndex = latest ? GROWTH_ORDER.indexOf(latest.growthStage) : -1;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Sprout className="w-6 h-6 text-primary-600" />
            Plant Detection
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Identifies crop type, variety &amp; growth stage · Images from Raspberry Pi camera
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
              Press the button to send a capture command to the Pi. The Pi will take a photo of the crop, identify the plant type and growth stage, and the result will appear here automatically.
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

          {/* Detection result */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Latest Detection Result</p>
            {loading ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-primary-500" />
              </div>
            ) : latest ? (
              <div className="space-y-5">
                {/* Plant ID */}
                <div className="flex items-start gap-4 p-4 bg-primary-50 rounded-xl">
                  <div className="p-3 bg-primary-100 rounded-full">
                    <Leaf className="w-7 h-7 text-primary-700" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold text-gray-900">{latest.plant}</h3>
                      {latest.variety && <span className="text-sm text-gray-500">· {latest.variety}</span>}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HEALTH_BADGE[latest.healthStatus]}`}>
                        {latest.healthStatus.charAt(0).toUpperCase() + latest.healthStatus.slice(1)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-700">
                        {Math.round(latest.confidence * 100)}% confidence
                      </span>
                      <div className="flex-1">
                        <ProgressBar value={latest.confidence} color={HEALTH_COLOR[latest.healthStatus]} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(latest.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {/* Growth stage */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Growth Stage</p>
                    <span className="text-sm font-bold text-primary-700">{latest.growthStage}</span>
                  </div>
                  <div className="flex gap-1">
                    {GROWTH_ORDER.map((stage, i) => (
                      <div key={stage} className="flex-1 text-center">
                        <div className={`h-2 rounded-full mb-1 ${i <= stageIndex ? "bg-primary-500" : "bg-gray-200"}`} />
                        <p className="text-xs text-gray-400 hidden sm:block">{stage}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Days to harvest */}
                {latest.daysToHarvest !== null && (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <p className="text-sm text-amber-800 font-medium">Estimated days to harvest</p>
                    <span className="text-2xl font-bold text-amber-700">{latest.daysToHarvest}</span>
                  </div>
                )}
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
              {history.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 pb-2.5 border-b border-gray-100 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${HEALTH_COLOR[item.healthStatus]}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{item.plant}</p>
                    <p className="text-xs text-gray-400">
                      {item.growthStage} · {Math.round(item.confidence * 100)}% · {new Date(item.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
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
