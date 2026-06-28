"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { HistoryData } from "@/lib/types";

interface SensorChartProps {
  data: HistoryData | null;
  loading?: boolean;
  visibleLines?: {
    temperature: boolean;
    humidity: boolean;
    soilMoisture: boolean;
    soilTemp: boolean;
    ph: boolean;
  };
}

const LINE_CONFIG = [
  { key: "temperature", label: "Air Temp (°C)", color: "#ef4444" },
  { key: "humidity", label: "Humidity (%)", color: "#3b82f6" },
  { key: "soilMoisture", label: "Soil Moisture (%)", color: "#8b5cf6" },
  { key: "soilTemp", label: "Soil Temp (°C)", color: "#f97316" },
  { key: "ph", label: "pH", color: "#f59e0b" },
] as const;

type LineKey = typeof LINE_CONFIG[number]["key"];

const DEFAULT_VISIBLE: Record<LineKey, boolean> = {
  temperature: true,
  humidity: true,
  soilMoisture: true,
  soilTemp: true,
  ph: true,
};

export default function SensorChart({
  data,
  loading = false,
  visibleLines = DEFAULT_VISIBLE,
}: SensorChartProps) {
  if (loading || !data) {
    return (
      <div className="h-72 bg-gray-100 rounded-xl animate-pulse flex items-center justify-center">
        <span className="text-gray-400 text-sm">Loading chart…</span>
      </div>
    );
  }

  // Merge into recharts-friendly format
  const chartData = data.labels.map((label, i) => ({
    time: label,
    temperature: data.temperature[i],
    humidity: data.humidity[i],
    soilMoisture: data.soilMoisture[i],
    soilTemp: data.soilTemp?.[i],
    ph: data.ph[i],
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            interval={3}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
          {LINE_CONFIG.map(({ key, label, color }) =>
            visibleLines[key] ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : null
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
