"use client";

import { Leaf, AlertCircle, CheckCircle, Clock } from "lucide-react";
import type { DiseaseData } from "@/lib/types";

interface DiseasePanelProps {
  data: DiseaseData | null;
  loading?: boolean;
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function DiseasePanel({ data, loading = false }: DiseasePanelProps) {
  const isHealthy = data?.disease === "Healthy";
  const pct = data ? Math.round(data.confidence * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Leaf className="w-4 h-4 text-primary-600" />
        Disease Detection
      </h2>

      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* Leaf image placeholder */}
        <div className="w-full sm:w-36 h-32 sm:h-36 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center flex-shrink-0">
          <Leaf className="w-10 h-10 text-gray-300" />
          <span className="text-xs text-gray-400 mt-2 text-center px-2">Latest leaf image</span>
        </div>

        {/* Results */}
        <div className="flex-1 space-y-3">
          {loading || !data ? (
            <div className="space-y-2">
              <div className="h-5 bg-gray-100 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
            </div>
          ) : (
            <>
              {/* Disease name */}
              <div className="flex items-center gap-2">
                {isHealthy ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                )}
                <span
                  className={`text-lg font-bold ${
                    isHealthy ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {data.disease}
                </span>
              </div>

              {/* Plant type */}
              <p className="text-sm text-gray-600">
                Plant detected: <span className="font-semibold text-gray-800">{data.plantType}</span>
              </p>

              {/* Confidence bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Confidence</span>
                  <span className="font-semibold text-gray-700">{pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      isHealthy
                        ? "bg-green-500"
                        : pct >= 80
                        ? "bg-red-500"
                        : "bg-yellow-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Weed detected */}
              {data.weedDetected && (
                <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">
                  Weed presence detected in field
                </p>
              )}

              {/* Timestamp */}
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Analysed at {formatTime(data.timestamp)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
