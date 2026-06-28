/**
 * Service layer — each function calls the real microservice if its URL is
 * configured via environment variables, otherwise returns mock data.
 *
 * To connect a real service, set its URL in .env.local and restart the server.
 * The frontend components never change — only this file and the env vars.
 */

import type {
  SensorData,
  DiseaseData,
  RecommendationData,
  AutomationData,
  Alert,
  HistoryData,
  InsectDetectionData,
  PlantDetectionData,
  AgricultureData,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function drift(base: number, variance: number): number {
  return Math.round((base + (Math.random() - 0.5) * 2 * variance) * 10) / 10;
}

async function fetchService<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// When ALLOW_MOCKS is false (the production default), AI services with no real
// data return null instead of fabricated values — the UI then shows "waiting"
// so you only ever see real Pi/model output flowing.
const ALLOW_MOCKS = process.env.ALLOW_MOCKS === "true";

// ── Sensors (maps to: Ingestion Service → sensor readings) ───────────────────

const SENSOR_BASE = { temperature: 28.4, humidity: 74.2, soilMoisture: 52.1, soilTemp: 24.5, ph: 6.3 };

function mockSensors(): SensorData {
  return {
    temperature: drift(SENSOR_BASE.temperature, 1.5),
    humidity: drift(SENSOR_BASE.humidity, 3),
    soilMoisture: drift(SENSOR_BASE.soilMoisture, 4),
    soilTemp: drift(SENSOR_BASE.soilTemp, 1),
    ph: drift(SENSOR_BASE.ph, 0.2),
    timestamp: new Date().toISOString(),
    online: true,
  };
}

export async function getSensors(): Promise<SensorData> {
  const url = process.env.SENSOR_SERVICE_URL;
  if (url) {
    const data = await fetchService<SensorData>(`${url}/sensors/latest`);
    if (data) return data;
  }
  return mockSensors();
}

// ── Disease Detection (maps to: Disease Detection Service) ───────────────────

const DISEASES = [
  { disease: "Tomato Late Blight", plantType: "Tomato", weedDetected: false },
  { disease: "Cassava Mosaic Disease", plantType: "Cassava", weedDetected: false },
  { disease: "Maize Leaf Spot", plantType: "Maize", weedDetected: false },
  { disease: "Healthy", plantType: "Tomato", weedDetected: false },
  { disease: "Healthy", plantType: "Maize", weedDetected: false },
];

function mockDisease(): DiseaseData {
  const pick = DISEASES[Math.floor(Math.random() * DISEASES.length)];
  const confidence =
    pick.disease === "Healthy"
      ? Math.round((0.92 + Math.random() * 0.07) * 1000) / 1000
      : Math.round((0.72 + Math.random() * 0.25) * 1000) / 1000;
  return {
    disease: pick.disease,
    confidence,
    plantType: pick.plantType,
    weedDetected: pick.weedDetected,
    timestamp: new Date().toISOString(),
    imageUrl: null,
  };
}

export async function getDisease(): Promise<DiseaseData | null> {
  const url = process.env.DISEASE_SERVICE_URL;
  if (url) {
    const data = await fetchService<DiseaseData>(`${url}/disease/latest`);
    if (data) return data;
  }
  return ALLOW_MOCKS ? mockDisease() : null;
}

// ── Crop Recommendation (maps to: Crop Recommendation Service) ───────────────

const RECOMMENDATIONS = [
  { crop: "Maize",    reason: "Optimal soil pH (6.3) and adequate moisture for maize cultivation",    alternatives: ["Cassava", "Beans"] },
  { crop: "Cassava",  reason: "Current soil moisture and temperature are ideal for cassava growth",   alternatives: ["Maize", "Plantain"] },
  { crop: "Tomatoes", reason: "Humidity levels and pH support healthy tomato production",              alternatives: ["Pepper", "Eggplant"] },
  { crop: "Beans",    reason: "Nitrogen-fixing crops suit the current soil conditions well",           alternatives: ["Groundnuts", "Soybeans"] },
];

function mockRecommendation(): RecommendationData {
  const pick = RECOMMENDATIONS[Math.floor(Math.random() * RECOMMENDATIONS.length)];
  return {
    crop: pick.crop,
    confidence: Math.round((0.82 + Math.random() * 0.15) * 100) / 100,
    reason: pick.reason,
    alternatives: pick.alternatives,
    timestamp: new Date().toISOString(),
  };
}

// The crop service returns { recommendedCrop, confidence, topCrops:[{crop,confidence}], ... },
// which is NOT the dashboard's RecommendationData shape — adapt it here.
interface RawRecommendation {
  recommendedCrop: string;
  confidence: number;
  topCrops?: { crop: string; confidence: number }[];
  timestamp?: string;
}

export async function getRecommendation(): Promise<RecommendationData | null> {
  const url = process.env.RECOMMENDATION_SERVICE_URL;
  if (url) {
    const raw = await fetchService<RawRecommendation>(`${url}/recommendation/latest`);
    if (raw && raw.recommendedCrop) {
      const alternatives = (raw.topCrops ?? [])
        .map((c) => c.crop)
        .filter((c) => c !== raw.recommendedCrop);
      return {
        crop: raw.recommendedCrop,
        confidence: raw.confidence ?? 0,
        reason:
          "Best match for the current soil and climate readings" +
          (alternatives.length ? `; alternatives: ${alternatives.join(", ")}` : "") +
          ".",
        alternatives,
        timestamp: raw.timestamp ?? new Date().toISOString(),
      };
    }
  }
  return ALLOW_MOCKS ? mockRecommendation() : null;
}

// ── Automation (maps to: Decision Engine Service) ────────────────────────────

function mockAutomation(): AutomationData {
  return {
    irrigation: { active: true,  mode: "auto",   lastTriggered: new Date(Date.now() - 75 * 60 * 1000).toISOString() },
    fertiliser: { active: false, mode: "auto",   lastTriggered: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString() },
    pesticide:  { active: false, mode: "manual", lastTriggered: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString() },
  };
}

export async function getAutomation(): Promise<AutomationData> {
  const url = process.env.DECISION_ENGINE_URL;
  if (url) {
    const data = await fetchService<AutomationData>(`${url}/automation`);
    if (data) return data;
  }
  return mockAutomation();
}

export async function setActuator(
  actuator: string,
  active: boolean,
  mode: "auto" | "manual"
): Promise<boolean> {
  const url = process.env.DECISION_ENGINE_URL;
  if (url) {
    try {
      const res = await fetch(`${url}/automation/${actuator}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, mode }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  return true; // mock always succeeds
}

// ── Alerts (maps to: Notification Service) ───────────────────────────────────

const MOCK_ALERTS: Alert[] = [
  { id: 1,  severity: "critical", type: "Disease",       message: "Tomato Late Blight detected (87.3% confidence)", timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
  { id: 2,  severity: "warning",  type: "Soil Moisture", message: "Soil moisture below threshold (28%)",            timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString() },
  { id: 3,  severity: "info",     type: "Irrigation",    message: "Irrigation pump activated automatically",        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
  { id: 4,  severity: "warning",  type: "Temperature",   message: "Temperature above 34°C — heat stress risk",     timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
  { id: 5,  severity: "info",     type: "Sync",          message: "Edge device reconnected after 12-min outage",   timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
  { id: 6,  severity: "critical", type: "Disease",       message: "Cassava Mosaic Disease detected (91.2%)",       timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
  { id: 7,  severity: "info",     type: "Fertiliser",    message: "Fertiliser dispenser deactivated (auto)",       timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
  { id: 8,  severity: "warning",  type: "pH",            message: "Soil pH dropped to 5.2 — apply lime",          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() },
  { id: 9,  severity: "info",     type: "System",        message: "Daily model inference cycle completed",         timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString() },
  { id: 10, severity: "warning",  type: "Humidity",      message: "Humidity at 91% — fungal disease risk elevated",timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString() },
  { id: 11, severity: "info",     type: "Irrigation",    message: "Irrigation completed — soil moisture 58%",      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() },
  { id: 12, severity: "critical", type: "Disease",       message: "Maize Leaf Spot detected (78.6%)",             timestamp: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString() },
];

export async function getAlerts(): Promise<Alert[]> {
  const url = process.env.NOTIFICATION_SERVICE_URL;
  if (url) {
    const data = await fetchService<Alert[]>(`${url}/alerts`);
    if (data) return data;
  }
  return MOCK_ALERTS;
}

// ── Plant Detection (maps to: Plant Detection Service → identifies crop) ──────

const PLANT_CLASSES = [
  { plant: "Tomato",     variety: "Roma",        growthStage: "Fruiting",    daysToHarvest: 14,   healthStatus: "healthy"  as const },
  { plant: "Maize",      variety: "Hybrid DK8031",growthStage: "Flowering",  daysToHarvest: 28,   healthStatus: "healthy"  as const },
  { plant: "Cassava",    variety: "TME 419",     growthStage: "Vegetative",  daysToHarvest: 180,  healthStatus: "stressed" as const },
  { plant: "Beans",      variety: "Climbing",    growthStage: "Seedling",    daysToHarvest: 65,   healthStatus: "healthy"  as const },
  { plant: "Pepper",     variety: "Hot Scotch",  growthStage: "Fruiting",    daysToHarvest: 10,   healthStatus: "diseased" as const },
  { plant: "Cabbage",    variety: "Copenhagen",  growthStage: "Vegetative",  daysToHarvest: 45,   healthStatus: "healthy"  as const },
  { plant: "Plantain",   variety: "French",      growthStage: "Maturity",    daysToHarvest: 21,   healthStatus: "healthy"  as const },
  { plant: "Groundnuts", variety: "Spanish",     growthStage: "Flowering",   daysToHarvest: 55,   healthStatus: "stressed" as const },
];

const HEALTH_STATUS_COLOR: Record<string, string> = {
  healthy: "bg-green-100 text-green-800",
  stressed: "bg-yellow-100 text-yellow-800",
  diseased: "bg-red-100 text-red-800",
};
export { HEALTH_STATUS_COLOR };

function mockPlantDetection(): PlantDetectionData {
  const pick = PLANT_CLASSES[Math.floor(Math.random() * PLANT_CLASSES.length)];
  return {
    plant: pick.plant,
    variety: pick.variety,
    confidence: Math.round((0.78 + Math.random() * 0.20) * 1000) / 1000,
    healthStatus: pick.healthStatus,
    growthStage: pick.growthStage,
    daysToHarvest: pick.daysToHarvest,
    timestamp: new Date().toISOString(),
    imageUrl: null,
  };
}

export async function getPlantDetection(): Promise<PlantDetectionData | null> {
  const url = process.env.PLANT_DETECTION_SERVICE_URL;
  if (url) {
    const data = await fetchService<PlantDetectionData>(`${url}/plant/latest`);
    if (data) return data;
  }
  return ALLOW_MOCKS ? mockPlantDetection() : null;
}

// Sends a "capture now" command to the Pi via the Plant Detection Service.
// The service publishes MQTT topic: agrisense/camera/plant
// Pi takes photo → sends back → service processes → result appears on next poll.
export async function triggerPlantCapture(): Promise<{ queued: boolean }> {
  const url = process.env.PLANT_DETECTION_SERVICE_URL;
  if (url) {
    try {
      const res = await fetch(`${url}/plant/capture`, { method: "POST" });
      if (res.ok) return { queued: true };
    } catch { /* fall through */ }
  }
  // Mock: simulate Pi round-trip delay of ~2s then return a new result on next poll
  await new Promise((r) => setTimeout(r, 2000));
  return { queued: true };
}

// ── Agricultural Practice Service (maps to: Agriculture Service — the brain) ──

const MOCK_INSTRUCTIONS = [
  {
    id: 1, action: "irrigate" as const, urgency: "today" as const,
    title: "Irrigate Tomato Field — Section A",
    description: "Soil moisture has dropped to 34% in section A. Apply 25mm of water for 45 minutes.",
    reason: "Soil moisture sensor reads 34%, below the 40% threshold for fruiting tomatoes. High temperature (31°C) is accelerating evapotranspiration.",
    estimatedDuration: "45 minutes",
  },
  {
    id: 2, action: "spray_pesticide" as const, urgency: "immediate" as const,
    title: "Spray Pesticide — Aphid Infestation",
    description: "Apply neem oil solution (5ml/L) to undersides of leaves. Cover all tomato and pepper rows.",
    reason: "Aphids detected at high confidence (87%) by PlantInsectCNN. Current humidity (74%) and temperature create ideal aphid breeding conditions.",
    estimatedDuration: "2 hours",
  },
  {
    id: 3, action: "fertilize" as const, urgency: "this_week" as const,
    title: "Apply NPK Fertilizer — Maize Field",
    description: "Apply NPK 20-10-10 at 60kg/hectare. Incorporate into soil at 5cm depth before next rain.",
    reason: "Maize is entering flowering stage. Nitrogen boost required for grain development. Soil pH 6.3 is optimal for nutrient uptake.",
    estimatedDuration: "3 hours",
  },
  {
    id: 4, action: "monitor" as const, urgency: "scheduled" as const,
    title: "Weekly Disease Inspection",
    description: "Walk all rows and inspect for early blight, mosaic virus, and leaf spot symptoms. Document findings.",
    reason: "Humidity has been above 70% for 3 consecutive days, increasing fungal disease risk. Early detection prevents crop loss.",
    estimatedDuration: "1 hour",
  },
];

function mockAgricultureAdvice(): AgricultureData {
  return {
    overallStatus: "attention_needed",
    summary: "Aphid infestation detected in tomato rows. Soil moisture needs attention in section A. Maize approaching fertilization window. Overall farm health is stable with 2 items requiring action.",
    instructions: MOCK_INSTRUCTIONS,
    irrigationSchedule: "Daily at 06:00 and 17:00 — 25mm per session while soil moisture < 45%",
    fertilizerSchedule: "NPK application due this week. Next top-dress in 3 weeks.",
    nextInspection: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
    timestamp: new Date().toISOString(),
  };
}

export async function getAgricultureAdvice(): Promise<AgricultureData | null> {
  const url = process.env.AGRICULTURE_SERVICE_URL;
  if (url) {
    const data = await fetchService<AgricultureData>(`${url}/agriculture/advice`);
    if (data) return data;
  }
  return ALLOW_MOCKS ? mockAgricultureAdvice() : null;
}

// ── Insect Detection (maps to: Insect Detection Service → PlantInsectCNN) ────

// Exact 19 classes from balanced_pest_dataset (alphabetical = ImageFolder order)
const PEST_CLASSES = [
  { pest: "Adristyrannus",           plantAffected: "General", severity: "medium" as const, treatment: "Apply systemic insecticide. Monitor nearby crops for spread." },
  { pest: "Aphids",                  plantAffected: "Tomato",  severity: "medium" as const, treatment: "Spray neem oil solution (5ml/L). Remove heavily infested leaves." },
  { pest: "Beetle",                  plantAffected: "Cassava", severity: "low"    as const, treatment: "Hand-pick at dawn. Apply kaolin clay as a deterrent." },
  { pest: "Bugs",                    plantAffected: "General", severity: "medium" as const, treatment: "Apply pyrethrin spray. Use sticky traps near affected plants." },
  { pest: "Cabbage Looper",          plantAffected: "Cabbage", severity: "high"   as const, treatment: "Apply Bacillus thuringiensis (Bt) spray on undersides of leaves." },
  { pest: "Cicadellidae",            plantAffected: "Maize",   severity: "low"    as const, treatment: "Use yellow sticky traps. Apply systemic insecticide if severe." },
  { pest: "Cutworm",                 plantAffected: "Maize",   severity: "medium" as const, treatment: "Apply collar barriers around stems. Use diatomaceous earth." },
  { pest: "Earwig",                  plantAffected: "General", severity: "low"    as const, treatment: "Set rolled newspaper traps at night. Apply diatomaceous earth." },
  { pest: "FieldCricket",            plantAffected: "Maize",   severity: "low"    as const, treatment: "Remove crop debris. Apply bait insecticide around field edges." },
  { pest: "Grasshopper",             plantAffected: "Maize",   severity: "medium" as const, treatment: "Apply Metarhizium anisopliae biopesticide. Use barrier crops." },
  { pest: "Mediterranean fruit fly", plantAffected: "Mango",   severity: "high"   as const, treatment: "Use protein bait traps. Bag fruits early. Destroy fallen fruit." },
  { pest: "Mites",                   plantAffected: "Beans",   severity: "low"    as const, treatment: "Spray water forcefully on leaves. Apply neem oil every 3 days." },
  { pest: "RedSpider",               plantAffected: "Tomato",  severity: "medium" as const, treatment: "Increase humidity. Apply miticide if severe. Remove infested leaves." },
  { pest: "Riptortus",               plantAffected: "Beans",   severity: "medium" as const, treatment: "Hand-pick adults. Apply pyrethroid insecticide at base of stems." },
  { pest: "Slug",                    plantAffected: "Cabbage", severity: "low"    as const, treatment: "Apply iron phosphate bait. Use copper tape barriers around beds." },
  { pest: "Snail",                   plantAffected: "General", severity: "low"    as const, treatment: "Hand-pick at night. Apply iron phosphate pellets around plants." },
  { pest: "Thrips",                  plantAffected: "Pepper",  severity: "medium" as const, treatment: "Use blue sticky traps. Apply spinosad or abamectin spray." },
  { pest: "Weevil",                  plantAffected: "Maize",   severity: "high"   as const, treatment: "Store grain in sealed containers. Apply diatomaceous earth in storage." },
  { pest: "Whitefly",                plantAffected: "Tomato",  severity: "medium" as const, treatment: "Use yellow sticky traps. Apply insecticidal soap or neem oil spray." },
];

function mockInsectDetection(): InsectDetectionData {
  const roll = Math.random();
  if (roll < 0.15) {
    return {
      pest: "No Pest Detected",
      confidence: Math.round((0.91 + Math.random() * 0.08) * 1000) / 1000,
      plantAffected: "None",
      severity: "none",
      treatment: "Plants are healthy. Continue regular monitoring.",
      timestamp: new Date().toISOString(),
      imageUrl: null,
      topPredictions: PEST_CLASSES.slice(0, 3).map((p) => ({
        pest: p.pest,
        confidence: Math.round(Math.random() * 0.08 * 1000) / 1000,
      })),
    };
  }
  const pick = PEST_CLASSES[Math.floor(Math.random() * PEST_CLASSES.length)];
  const mainConf = Math.round((0.65 + Math.random() * 0.32) * 1000) / 1000;
  const others = PEST_CLASSES.filter((p) => p.pest !== pick.pest)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2)
    .map((p) => ({ pest: p.pest, confidence: Math.round(Math.random() * (1 - mainConf) * 1000) / 1000 }));
  return {
    pest: pick.pest,
    confidence: mainConf,
    plantAffected: pick.plantAffected,
    severity: pick.severity,
    treatment: pick.treatment,
    timestamp: new Date().toISOString(),
    imageUrl: null,
    topPredictions: [{ pest: pick.pest, confidence: mainConf }, ...others],
  };
}

export async function getInsectDetection(): Promise<InsectDetectionData | null> {
  const url = process.env.INSECT_DETECTION_SERVICE_URL;
  if (url) {
    const data = await fetchService<InsectDetectionData>(`${url}/insect/latest`);
    if (data) return data;
  }
  return ALLOW_MOCKS ? mockInsectDetection() : null;
}

// Sends a "capture now" command → Pi takes photo → insect detection runs automatically.
// MQTT topic published: agrisense/camera/insect
export async function triggerInsectCapture(): Promise<{ queued: boolean }> {
  const url = process.env.INSECT_DETECTION_SERVICE_URL;
  if (url) {
    try {
      const res = await fetch(`${url}/insect/capture`, { method: "POST" });
      if (res.ok) return { queued: true };
    } catch { /* fall through */ }
  }
  await new Promise((r) => setTimeout(r, 2000));
  return { queued: true };
}

// ── History (maps to: Ingestion Service — historical readings) ────────────────

function mockHistory(): HistoryData {
  const labels: string[] = [];
  const temperature: number[] = [];
  const humidity: number[] = [];
  const soilMoisture: number[] = [];
  const soilTemp: number[] = [];
  const ph: number[] = [];

  let t = 27, h = 75, sm = 52, st = 24.5, p = 6.3;
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.now() - i * 60 * 60 * 1000);
    labels.push(d.getHours().toString().padStart(2, "0") + ":00");
    t  = Math.round((t  + (Math.random() - 0.5) * 1.5) * 10) / 10;
    h  = Math.round((h  + (Math.random() - 0.5) * 4)   * 10) / 10;
    sm = Math.round((sm + (Math.random() - 0.5) * 5)   * 10) / 10;
    st = Math.round((st + (Math.random() - 0.5) * 1)   * 10) / 10;
    p  = Math.round((p  + (Math.random() - 0.5) * 0.15) * 100) / 100;
    temperature.push(Math.min(40, Math.max(20, t)));
    humidity.push(Math.min(99, Math.max(40, h)));
    soilMoisture.push(Math.min(100, Math.max(10, sm)));
    soilTemp.push(Math.min(35, Math.max(15, st)));
    ph.push(Math.min(8, Math.max(5, p)));
  }
  return { labels, temperature, humidity, soilMoisture, soilTemp, ph };
}

export async function getHistory(): Promise<HistoryData> {
  const url = process.env.SENSOR_SERVICE_URL;
  if (url) {
    const data = await fetchService<HistoryData>(`${url}/sensors/history?hours=24`);
    if (data) return data;
  }
  return mockHistory();
}
