"use client";

import { useEffect, useState, useCallback } from "react";
import { Thermometer, Droplets, CloudRain, FlaskConical, Leaf, Wifi, WifiOff } from "lucide-react";
import SensorCard from "@/components/SensorCard";
import DiseasePanel from "@/components/DiseasePanel";
import RecommendationPanel from "@/components/RecommendationPanel";
import AutomationPanel from "@/components/AutomationPanel";
import AlertItem from "@/components/AlertItem";
import type {
  SensorData,
  DiseaseData,
  RecommendationData,
  AutomationData,
  Alert,
} from "@/lib/types";

// Determine sensor status based on thresholds
function tempStatus(v: number) {
  if (v > 35 || v < 15) return "critical" as const;
  if (v > 32 || v < 18) return "warning" as const;
  return "ok" as const;
}
function humidStatus(v: number) {
  if (v < 40 || v > 95) return "critical" as const;
  if (v < 55 || v > 90) return "warning" as const;
  return "ok" as const;
}
function moistureStatus(v: number) {
  if (v < 20 || v > 85) return "critical" as const;
  if (v < 30 || v > 75) return "warning" as const;
  return "ok" as const;
}
function phStatus(v: number) {
  if (v < 5.0 || v > 8.0) return "critical" as const;
  if (v < 5.5 || v > 7.5) return "warning" as const;
  return "ok" as const;
}
function soilTempStatus(v: number) {
  if (v > 35 || v < 10) return "critical" as const;
  if (v > 32 || v < 15) return "warning" as const;
  return "ok" as const;
}

export default function DashboardPage() {
  const [sensors, setSensors] = useState<SensorData | null>(null);
  const [disease, setDisease] = useState<DiseaseData | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationData | null>(null);
  const [automation, setAutomation] = useState<AutomationData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const [sensorsLoading, setSensorsLoading] = useState(true);
  const [diseaseLoading, setDiseaseLoading] = useState(true);
  const [recLoading, setRecLoading] = useState(true);
  const [autoLoading, setAutoLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const [online, setOnline] = useState(true);

  // Fetch sensors (polled every 5s)
  const fetchSensors = useCallback(async () => {
    try {
      const res = await fetch("/api/sensors");
      const data: SensorData = await res.json();
      setSensors(data);
      setOnline(data.online);
    } catch {
      setOnline(false);
    } finally {
      setSensorsLoading(false);
    }
  }, []);

  // Fetch disease (polled every 10s)
  const fetchDisease = useCallback(async () => {
    try {
      const res = await fetch("/api/disease");
      const data: DiseaseData = await res.json();
      setDisease(data);
    } catch {
      // keep previous data on error
    } finally {
      setDiseaseLoading(false);
    }
  }, []);

  // Fetch recommendation (polled every 10s)
  const fetchRecommendation = useCallback(async () => {
    try {
      const res = await fetch("/api/recommendation");
      const data: RecommendationData = await res.json();
      setRecommendation(data);
    } catch {
      // keep previous
    } finally {
      setRecLoading(false);
    }
  }, []);

  // Fetch automation (polled every 10s)
  const fetchAutomation = useCallback(async () => {
    try {
      const res = await fetch("/api/automation");
      const data: AutomationData = await res.json();
      setAutomation(data);
    } catch {
      // keep previous
    } finally {
      setAutoLoading(false);
    }
  }, []);

  // Fetch alerts (polled every 10s)
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data: Alert[] = await res.json();
      setAlerts(data);
    } catch {
      // keep previous
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchSensors();
    fetchDisease();
    fetchRecommendation();
    fetchAutomation();
    fetchAlerts();

    // Polling intervals
    const sensorInterval = setInterval(fetchSensors, 5000);
    const slowInterval = setInterval(() => {
      fetchDisease();
      fetchRecommendation();
      fetchAutomation();
      fetchAlerts();
    }, 10000);

    return () => {
      clearInterval(sensorInterval);
      clearInterval(slowInterval);
    };
  }, [fetchSensors, fetchDisease, fetchRecommendation, fetchAutomation, fetchAlerts]);

  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Leaf className="w-6 h-6 text-primary-600 md:hidden" />
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Live farm sensor data &amp; AI insights</p>
        </div>
        {/* Online indicator */}
        <div
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
            online ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {online ? (
            <Wifi className="w-3.5 h-3.5" />
          ) : (
            <WifiOff className="w-3.5 h-3.5" />
          )}
          {online ? "Online" : "Offline"}
        </div>
      </div>

      {/* 1. Sensor gauges */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Live Sensor Readings
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <SensorCard
            label="Air Temp"
            value={sensors?.temperature ?? null}
            unit="°C"
            precision={1}
            icon={Thermometer}
            status={sensors ? tempStatus(sensors.temperature) : "ok"}
            lastSync={sensors?.timestamp ?? null}
            loading={sensorsLoading}
          />
          <SensorCard
            label="Humidity"
            value={sensors?.humidity ?? null}
            unit="%"
            precision={1}
            icon={Droplets}
            status={sensors ? humidStatus(sensors.humidity) : "ok"}
            lastSync={sensors?.timestamp ?? null}
            loading={sensorsLoading}
          />
          <SensorCard
            label="Soil Moisture"
            value={sensors?.soilMoisture ?? null}
            unit="%"
            precision={0}
            icon={CloudRain}
            status={sensors ? moistureStatus(sensors.soilMoisture) : "ok"}
            lastSync={sensors?.timestamp ?? null}
            loading={sensorsLoading}
          />
          <SensorCard
            label="Soil Temp"
            value={sensors?.soilTemp ?? null}
            unit="°C"
            precision={1}
            icon={Thermometer}
            status={sensors ? soilTempStatus(sensors.soilTemp) : "ok"}
            lastSync={sensors?.timestamp ?? null}
            loading={sensorsLoading}
          />
          <SensorCard
            label="Soil pH"
            value={sensors?.ph ?? null}
            unit="pH"
            precision={2}
            icon={FlaskConical}
            status={sensors ? phStatus(sensors.ph) : "ok"}
            lastSync={sensors?.timestamp ?? null}
            loading={sensorsLoading}
          />
        </div>
      </section>

      {/* 2. Disease + Recommendation panels */}
      <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <DiseasePanel data={disease} loading={diseaseLoading} />
        <RecommendationPanel data={recommendation} loading={recLoading} />
      </section>

      {/* 3. Automation Controls */}
      <section className="mb-6">
        <AutomationPanel
          data={automation}
          loading={autoLoading}
          onUpdate={(updated) => setAutomation(updated)}
        />
      </section>

      {/* 4. Recent Alerts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Recent Alerts
          </h2>
          <a href="/alerts" className="text-xs text-primary-600 hover:underline font-medium">
            View all →
          </a>
        </div>

        {alertsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No recent alerts</p>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert) => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
