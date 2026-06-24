"use client";

import { useState } from "react";
import { Droplets, FlaskConical, Bug, Loader2 } from "lucide-react";
import type { AutomationData, ActuatorName } from "@/lib/types";

interface AutomationPanelProps {
  data: AutomationData | null;
  loading?: boolean;
  onUpdate: (updated: AutomationData) => void;
}

const ACTUATOR_CONFIG: Record<
  ActuatorName,
  { label: string; icon: typeof Droplets; description: string }
> = {
  irrigation: {
    label: "Irrigation Pumps",
    icon: Droplets,
    description: "Water supply to crops",
  },
  fertiliser: {
    label: "Fertiliser Dispenser",
    icon: FlaskConical,
    description: "Nutrient delivery system",
  },
  pesticide: {
    label: "Pesticide Dispenser",
    icon: Bug,
    description: "Pest control system",
  },
};

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AutomationPanel({ data, loading = false, onUpdate }: AutomationPanelProps) {
  const [toggling, setToggling] = useState<ActuatorName | null>(null);

  async function handleToggle(actuator: ActuatorName) {
    if (!data) return;
    const current = data[actuator];
    setToggling(actuator);
    try {
      const res = await fetch(`/api/automation/${actuator}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: !current.active,
          mode: "manual",
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      onUpdate({ ...data, [actuator]: updated });
    } catch (err) {
      console.error("Automation toggle error:", err);
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Automation Controls</h2>

      {loading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(Object.keys(ACTUATOR_CONFIG) as ActuatorName[]).map((key) => {
            const cfg = ACTUATOR_CONFIG[key];
            const state = data[key];
            const isToggling = toggling === key;
            const Icon = cfg.icon;

            return (
              <div
                key={key}
                className={`rounded-lg border-2 p-4 flex flex-col gap-3 transition-colors ${
                  state.active
                    ? "border-primary-300 bg-primary-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                {/* Icon + Label */}
                <div className="flex items-center gap-2">
                  <Icon
                    className={`w-5 h-5 ${
                      state.active ? "text-primary-600" : "text-gray-400"
                    }`}
                  />
                  <span className="text-sm font-semibold text-gray-700">{cfg.label}</span>
                </div>

                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      state.active
                        ? "bg-primary-100 text-primary-700"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {state.active ? "ON" : "OFF"}
                  </span>
                  <span className="text-xs text-gray-500 capitalize">{state.mode} mode</span>
                </div>

                {/* Last triggered */}
                <p className="text-xs text-gray-400">
                  Last: {formatTime(state.lastTriggered)}
                </p>

                {/* Toggle button */}
                <button
                  onClick={() => handleToggle(key)}
                  disabled={isToggling}
                  className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    state.active
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-primary-600 text-white hover:bg-primary-700"
                  } disabled:opacity-60`}
                >
                  {isToggling ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Updating…
                    </>
                  ) : state.active ? (
                    "Turn OFF (Manual)"
                  ) : (
                    "Turn ON (Manual)"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
