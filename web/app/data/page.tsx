"use client";

import { useEffect, useState, useCallback } from "react";
import { Database, RefreshCw } from "lucide-react";
import type { SensorLogRow } from "@/lib/types";

function fmt(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(digits);
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

const COLUMNS = [
  { key: "timestamp", label: "Timestamp" },
  { key: "temperature", label: "Air °C" },
  { key: "humidity", label: "Humidity %" },
  { key: "soilMoisture", label: "Soil Moist %" },
  { key: "soilTemp", label: "Soil °C" },
  { key: "ph", label: "pH" },
] as const;

export default function DataLogPage() {
  const [rows, setRows] = useState<SensorLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch("/api/sensors/log");
      if (!res.ok) return;
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
    const id = setInterval(fetchRows, 15_000); // refresh every 15s
    return () => clearInterval(id);
  }, [fetchRows]);

  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-primary-600 md:hidden" />
            Data Log
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Raw sensor records stored in the database — newest first
            {rows.length > 0 && ` · ${rows.length} rows`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            fetchRows();
          }}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">
          No readings stored yet — the Pi pushes a record every ~30s once it&apos;s running.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="text-left font-semibold text-gray-600 px-4 py-2.5 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtTime(r.timestamp)}</td>
                  <td className="px-4 py-2 text-gray-800">{fmt(r.temperature, 1)}</td>
                  <td className="px-4 py-2 text-gray-800">{fmt(r.humidity, 1)}</td>
                  <td className="px-4 py-2 text-gray-800">{fmt(r.soilMoisture, 0)}</td>
                  <td className="px-4 py-2 text-gray-800">{fmt(r.soilTemp, 1)}</td>
                  <td className="px-4 py-2 text-gray-800">{fmt(r.ph, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
