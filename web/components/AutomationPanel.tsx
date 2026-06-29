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
  const [busy, setBusy] = useState<ActuatorName | null>(null);

  async function setActuator(
    actuator: ActuatorName,
    active: boolean,
    mode: "auto" | "manual"
  ) {
    if (!data) return;
    setBusy(actuator);
    try {
      const res = await fetch(`/api/automation/${actuator}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, mode }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      onUpdate({ ...data, [actuator]: updated });
    } catch (err) {
      console.error("Automation error:", err);
    } finally {
      setBusy(null);
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
            const isBusy = busy === key;
            const isManual = state.mode === "manual";
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
                {/* Icon + Label + busy spinner */}
                <div className="flex items-center gap-2">
                  <Icon className={`w-5 h-5 ${state.active ? "text-primary-600" : "text-gray-400"}`} />
                  <span className="text-sm font-semibold text-gray-700">{cfg.label}</span>
                  {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 ml-auto" />}
                </div>

                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      state.active ? "bg-primary-100 text-primary-700" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {state.active ? "ON" : "OFF"}
                  </span>
                  <span className="text-xs text-gray-400">Last: {formatTime(state.lastTriggered)}</span>
                </div>

                {/* Mode switch: Auto vs Manual */}
                <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActuator(key, state.active, "auto")}
                    disabled={isBusy}
                    className={`flex-1 py-1.5 rounded-md transition-colors ${
                      !isManual ? "bg-white shadow-sm text-primary-700" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setActuator(key, state.active, "manual")}
                    disabled={isBusy}
                    className={`flex-1 py-1.5 rounded-md transition-colors ${
                      isManual ? "bg-white shadow-sm text-primary-700" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Manual
                  </button>
                </div>

                {/* Manual ON/OFF, or an "automatic" note in auto mode */}
                {isManual ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActuator(key, true, "manual")}
                      disabled={isBusy}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                        state.active
                          ? "bg-primary-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Turn ON
                    </button>
                    <button
                      type="button"
                      onClick={() => setActuator(key, false, "manual")}
                      disabled={isBusy}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                        !state.active
                          ? "bg-red-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Turn OFF
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 text-center py-2 bg-gray-100 rounded-lg">
                    Controlled automatically by the decision engine
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
