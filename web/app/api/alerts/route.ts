import { NextResponse } from "next/server";
import { getAlerts } from "@/lib/services";
import type { Alert } from "@/lib/types";

const now = Date.now();

const MOCK_ALERTS: Alert[] = [
  {
    id: 1,
    severity: "critical",
    type: "Disease",
    message: "Tomato Late Blight detected (87.3% confidence) — immediate action recommended",
    timestamp: new Date(now - 2 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    severity: "warning",
    type: "Soil Moisture",
    message: "Soil moisture below threshold (28%) — consider irrigation",
    timestamp: new Date(now - 18 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    severity: "info",
    type: "Irrigation",
    message: "Irrigation pump activated automatically",
    timestamp: new Date(now - 35 * 60 * 1000).toISOString(),
  },
  {
    id: 4,
    severity: "warning",
    type: "Temperature",
    message: "Temperature rising above 32°C — monitor crop stress",
    timestamp: new Date(now - 1.2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 5,
    severity: "info",
    type: "Recommendation",
    message: "New crop recommendation available: Maize (91% confidence)",
    timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 6,
    severity: "critical",
    type: "Sensor",
    message: "pH sensor reading unstable — check sensor calibration",
    timestamp: new Date(now - 3.5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 7,
    severity: "info",
    type: "Fertiliser",
    message: "Fertiliser dispenser completed scheduled cycle",
    timestamp: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 8,
    severity: "warning",
    type: "Humidity",
    message: "Humidity dropped below 60% — fungal risk reduced but plant stress possible",
    timestamp: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 9,
    severity: "info",
    type: "Disease",
    message: "Plant health check passed — no disease detected",
    timestamp: new Date(now - 10 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 10,
    severity: "critical",
    type: "Soil Moisture",
    message: "Soil moisture critically low (18%) — irrigation required immediately",
    timestamp: new Date(now - 14 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 11,
    severity: "warning",
    type: "Disease",
    message: "Cassava Mosaic Disease detected (72.1% confidence) — monitor closely",
    timestamp: new Date(now - 18 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 12,
    severity: "info",
    type: "System",
    message: "Sensors synced successfully — all systems nominal",
    timestamp: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
  },
];

export async function GET(): Promise<NextResponse<Alert[]>> {
  const data = await getAlerts();
  return NextResponse.json(data);
}
