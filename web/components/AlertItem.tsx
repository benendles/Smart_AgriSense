"use client";

import { AlertTriangle, Info, XCircle } from "lucide-react";
import type { Alert, AlertSeverity } from "@/lib/types";

interface AlertItemProps {
  alert: Alert;
}

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { icon: typeof Info; bg: string; badge: string; text: string }
> = {
  info: {
    icon: Info,
    bg: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    text: "text-blue-600",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-yellow-50 border-yellow-200",
    badge: "bg-yellow-100 text-yellow-700",
    text: "text-yellow-600",
  },
  critical: {
    icon: XCircle,
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
    text: "text-red-600",
  },
};

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function AlertItem({ alert }: AlertItemProps) {
  const cfg = SEVERITY_CONFIG[alert.severity];
  const Icon = cfg.icon;

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${cfg.bg}`}>
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.text}`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${cfg.badge}`}
          >
            {alert.severity}
          </span>
          <span className="text-xs font-medium text-gray-500">{alert.type}</span>
        </div>
        <p className="text-sm text-gray-800 leading-snug">{alert.message}</p>
        <p className="text-xs text-gray-400 mt-1">{formatTime(alert.timestamp)}</p>
      </div>
    </div>
  );
}
