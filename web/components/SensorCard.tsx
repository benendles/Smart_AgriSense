"use client";

import { LucideIcon } from "lucide-react";

type StatusLevel = "ok" | "warning" | "critical";

interface SensorCardProps {
  label: string;
  value: number | null;
  unit: string;
  icon: LucideIcon;
  status: StatusLevel;
  lastSync: string | null;
  loading?: boolean;
}

const STATUS_CONFIG: Record<StatusLevel, { label: string; classes: string; dot: string }> = {
  ok: {
    label: "OK",
    classes: "bg-green-100 text-green-700",
    dot: "bg-green-500",
  },
  warning: {
    label: "Warning",
    classes: "bg-yellow-100 text-yellow-700",
    dot: "bg-yellow-500",
  },
  critical: {
    label: "Critical",
    classes: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
};

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

export default function SensorCard({
  label,
  value,
  unit,
  icon: Icon,
  status,
  lastSync,
  loading = false,
}: SensorCardProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-600">{label}</span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.classes}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Value */}
      <div className="flex items-end gap-1">
        {loading || value === null ? (
          <div className="h-9 w-20 bg-gray-100 rounded animate-pulse" />
        ) : (
          <>
            <span className="text-3xl font-bold text-gray-900 leading-none">{value}</span>
            <span className="text-sm text-gray-500 mb-0.5">{unit}</span>
          </>
        )}
      </div>

      {/* Last synced */}
      <p className="text-xs text-gray-400">
        Last synced: <span className="font-medium text-gray-500">{formatTime(lastSync)}</span>
      </p>
    </div>
  );
}
