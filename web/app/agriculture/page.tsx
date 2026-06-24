"use client";

import { useEffect, useState, useCallback } from "react";
import type { AgricultureData, FarmingInstruction, ActionType, UrgencyLevel } from "@/lib/types";
import { Tractor, RefreshCw, Droplets, Leaf, Bug, AlertTriangle, CheckCircle, Eye, Calendar } from "lucide-react";

const ACTION_CONFIG: Record<ActionType, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  irrigate:         { icon: Droplets,     color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  fertilize:        { icon: Leaf,         color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  spray_pesticide:  { icon: Bug,          color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200" },
  spray_fungicide:  { icon: AlertTriangle,color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  harvest:          { icon: CheckCircle,  color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  monitor:          { icon: Eye,          color: "text-gray-700",   bg: "bg-gray-50",   border: "border-gray-200" },
  no_action:        { icon: CheckCircle,  color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
};

const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; badge: string }> = {
  immediate:  { label: "Immediate",  badge: "bg-red-100 text-red-800"     },
  today:      { label: "Today",      badge: "bg-orange-100 text-orange-800" },
  this_week:  { label: "This Week",  badge: "bg-yellow-100 text-yellow-800" },
  scheduled:  { label: "Scheduled",  badge: "bg-blue-100 text-blue-800"    },
  none:       { label: "No Action",  badge: "bg-gray-100 text-gray-600"    },
};

const STATUS_CONFIG = {
  healthy:          { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", label: "Farm Healthy" },
  attention_needed: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", label: "Attention Needed" },
  critical:         { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Critical" },
};

function InstructionCard({ inst }: { inst: FarmingInstruction }) {
  const action = ACTION_CONFIG[inst.action];
  const urgency = URGENCY_CONFIG[inst.urgency];
  const Icon = action.icon;

  return (
    <div className={`rounded-xl border p-4 ${action.border} ${action.bg}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-white border ${action.border} flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${action.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className={`text-sm font-bold ${action.color}`}>{inst.title}</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urgency.badge}`}>
              {urgency.label}
            </span>
          </div>
          <p className="text-sm text-gray-700 mb-2">{inst.description}</p>
          <div className="bg-white/70 rounded-lg px-3 py-2 border border-white">
            <p className="text-xs text-gray-500 font-semibold mb-0.5">Why:</p>
            <p className="text-xs text-gray-600">{inst.reason}</p>
          </div>
          <p className="text-xs text-gray-500 mt-2">⏱ {inst.estimatedDuration}</p>
        </div>
      </div>
    </div>
  );
}

export default function AgriculturePage() {
  const [data, setData] = useState<AgricultureData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAdvice = useCallback(async () => {
    try {
      const res = await fetch("/api/agriculture");
      if (!res.ok) return;
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdvice();
    const id = setInterval(fetchAdvice, 30_000);
    return () => clearInterval(id);
  }, [fetchAdvice]);

  const statusCfg = data ? STATUS_CONFIG[data.overallStatus] : null;
  const StatusIcon = statusCfg?.icon ?? CheckCircle;

  const urgent = data?.instructions.filter((i) => i.urgency === "immediate" || i.urgency === "today") ?? [];
  const scheduled = data?.instructions.filter((i) => i.urgency !== "immediate" && i.urgency !== "today") ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Tractor className="w-6 h-6 text-primary-600" />
            Agricultural Practice
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI-generated farm instructions based on sensors, disease, pest &amp; plant detection
          </p>
        </div>
        <button onClick={fetchAdvice} className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4 text-gray-500" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* Overall status */}
          {statusCfg && (
            <div className={`rounded-xl border p-4 flex items-start gap-3 ${statusCfg.border} ${statusCfg.bg}`}>
              <StatusIcon className={`w-6 h-6 flex-shrink-0 mt-0.5 ${statusCfg.color}`} />
              <div>
                <p className={`font-bold ${statusCfg.color}`}>{statusCfg.label}</p>
                <p className="text-sm text-gray-700 mt-0.5">{data.summary}</p>
              </div>
            </div>
          )}

          {/* Schedules summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-blue-500" /> Irrigation Schedule
              </p>
              <p className="text-sm text-gray-800">{data.irrigationSchedule}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5 text-green-500" /> Fertilizer Schedule
              </p>
              <p className="text-sm text-gray-800">{data.fertilizerSchedule}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-purple-500" /> Next Inspection
              </p>
              <p className="text-sm text-gray-800">{data.nextInspection}</p>
            </div>
          </div>

          {/* Urgent instructions */}
          {urgent.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Urgent Actions ({urgent.length})
              </h2>
              <div className="space-y-3">
                {urgent.map((inst) => <InstructionCard key={inst.id} inst={inst} />)}
              </div>
            </div>
          )}

          {/* Scheduled instructions */}
          {scheduled.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                Scheduled &amp; Monitoring ({scheduled.length})
              </h2>
              <div className="space-y-3">
                {scheduled.map((inst) => <InstructionCard key={inst.id} inst={inst} />)}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 text-right">
            Last updated: {new Date(data.timestamp).toLocaleTimeString()} · Auto-refreshes every 30s
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-400 text-center py-12">No data available</p>
      )}
    </div>
  );
}
