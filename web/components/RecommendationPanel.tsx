"use client";

import { Sprout, Clock } from "lucide-react";
import type { RecommendationData } from "@/lib/types";

interface RecommendationPanelProps {
  data: RecommendationData | null;
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

export default function RecommendationPanel({ data, loading = false }: RecommendationPanelProps) {
  const pct = data ? Math.round(data.confidence * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Sprout className="w-4 h-4 text-primary-600" />
        Crop Recommendation
      </h2>

      {loading || !data ? (
        <div className="space-y-3">
          <div className="h-8 bg-gray-100 rounded animate-pulse w-1/3" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Recommended crop */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Recommended Crop</p>
              <p className="text-2xl font-bold text-primary-700 mt-0.5">{data.crop}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Confidence</p>
              <p className="text-xl font-bold text-gray-800">{pct}%</p>
            </div>
          </div>

          {/* Confidence bar */}
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-primary-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Reason */}
          <p className="text-sm text-gray-600 bg-primary-50 rounded-lg px-3 py-2.5 border border-primary-100">
            {data.reason}
          </p>

          {/* Alternatives */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1.5">Alternative crops:</p>
            <div className="flex flex-wrap gap-2">
              {(data.alternatives ?? []).map((alt) => (
                <span
                  key={alt}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                >
                  {alt}
                </span>
              ))}
            </div>
          </div>

          {/* Timestamp */}
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Updated at {formatTime(data.timestamp)}
          </p>
        </div>
      )}
    </div>
  );
}
