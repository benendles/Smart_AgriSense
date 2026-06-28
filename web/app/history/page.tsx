"use client";

import { useEffect, useState } from "react";
import { LineChart as LineChartIcon, RefreshCw } from "lucide-react";
import SensorChart from "@/components/SensorChart";
import type { HistoryData } from "@/lib/types";

type LineKey = "temperature" | "humidity" | "soilMoisture" | "soilTemp" | "ph";

const LINE_TOGGLES: { key: LineKey; label: string; color: string; precision: number }[] = [
  { key: "temperature", label: "Air Temp (°C)", color: "bg-red-400", precision: 1 },
  { key: "humidity", label: "Humidity (%)", color: "bg-blue-400", precision: 1 },
  { key: "soilMoisture", label: "Soil Moisture (%)", color: "bg-purple-400", precision: 0 },
  { key: "soilTemp", label: "Soil Temp (°C)", color: "bg-orange-400", precision: 1 },
  { key: "ph", label: "pH", color: "bg-amber-400", precision: 2 },
];

export default function HistoryPage() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleLines, setVisibleLines] = useState<Record<LineKey, boolean>>({
    temperature: true,
    humidity: true,
    soilMoisture: true,
    soilTemp: true,
    ph: true,
  });

  async function fetchHistory() {
    try {
      const res = await fetch("/api/history");
      const json: HistoryData = await res.json();
      setData(json);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchHistory();
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetchHistory();
  }

  function toggleLine(key: LineKey) {
    setVisibleLines((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LineChartIcon className="w-6 h-6 text-primary-600 md:hidden" />
            Sensor History
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Last 24 hourly readings</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {LINE_TOGGLES.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => toggleLine(key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              visibleLines[key]
                ? "bg-white border-gray-300 text-gray-700 shadow-sm"
                : "bg-gray-100 border-transparent text-gray-400"
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${visibleLines[key] ? color : "bg-gray-300"}`}
            />
            {label}
          </button>
        ))}
      </div>

      {/* Combined chart */}
      <div className="mb-6">
        <SensorChart data={data} loading={loading} visibleLines={visibleLines} />
      </div>

      {/* Individual sensor summaries */}
      {!loading && data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {LINE_TOGGLES.map(({ key, label, color, precision }) => {
            const values = data[key] ?? [];
            const has = values.length > 0;
            const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(precision));
            const latest = has ? values[values.length - 1] : null;
            const min = has ? Math.min(...values) : null;
            const max = has ? Math.max(...values) : null;
            const avg = has ? values.reduce((s, v) => s + v, 0) / values.length : null;

            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-xs font-medium text-gray-500">{label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-2">{fmt(latest)}</p>
                <div className="space-y-0.5 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Min</span>
                    <span className="font-medium text-gray-700">{fmt(min)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max</span>
                    <span className="font-medium text-gray-700">{fmt(max)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg</span>
                    <span className="font-medium text-gray-700">{fmt(avg)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
