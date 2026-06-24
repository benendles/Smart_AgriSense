"use client";

import { useEffect, useState } from "react";
import { Bell, RefreshCw } from "lucide-react";
import AlertItem from "@/components/AlertItem";
import type { Alert, AlertSeverity } from "@/lib/types";

const SEVERITY_FILTERS: { label: string; value: AlertSeverity | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Critical", value: "critical" },
  { label: "Warning", value: "warning" },
  { label: "Info", value: "info" },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AlertSeverity | "all">("all");
  const [refreshing, setRefreshing] = useState(false);

  async function fetchAlerts() {
    try {
      const res = await fetch("/api/alerts");
      const data: Alert[] = await res.json();
      setAlerts(data);
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetchAlerts();
  }

  const filtered =
    filter === "all" ? alerts : alerts.filter((a) => a.severity === filter);

  const counts = {
    all: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };

  return (
    <main className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary-600 md:hidden" />
            Alerts History
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">All system alerts, newest first</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Severity filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {SEVERITY_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === value
                ? "bg-primary-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}{" "}
            <span
              className={`ml-1 ${filter === value ? "text-primary-100" : "text-gray-400"}`}
            >
              ({counts[value]})
            </span>
          </button>
        ))}
      </div>

      {/* Alerts list */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No {filter === "all" ? "" : filter} alerts found</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      {/* Summary footer */}
      {!loading && (
        <p className="text-xs text-gray-400 text-center mt-6">
          Showing {filtered.length} of {alerts.length} alerts
        </p>
      )}
    </main>
  );
}
