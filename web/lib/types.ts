// Sensor data types
export interface SensorData {
  temperature: number;
  humidity: number;
  soilMoisture: number;
  soilTemp: number;
  ph: number;
  timestamp: string;
  online: boolean;
}

// Disease detection types
export interface DiseaseData {
  disease: string;
  confidence: number;
  plantType: string;
  weedDetected: boolean;
  timestamp: string;
  imageUrl: string | null;
}

// Crop recommendation types
export interface RecommendationData {
  crop: string;
  confidence: number;
  reason: string;
  alternatives: string[];
  timestamp: string;
}

// Actuator state types
export interface ActuatorState {
  active: boolean;
  mode: "auto" | "manual";
  lastTriggered: string;
}

export interface AutomationData {
  irrigation: ActuatorState;
  fertiliser: ActuatorState;
  pesticide: ActuatorState;
}

// Alert types
export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: number;
  severity: AlertSeverity;
  type: string;
  message: string;
  timestamp: string;
}

// History types
export interface HistoryData {
  labels: string[];
  temperature: number[];
  humidity: number[];
  soilMoisture: number[];
  soilTemp: number[];
  ph: number[];
}

// Plant detection types (identifies what crop/plant is in the field)
export interface PlantDetectionData {
  plant: string;
  variety: string | null;
  confidence: number;
  healthStatus: "healthy" | "stressed" | "diseased";
  growthStage: string;
  daysToHarvest: number | null;
  timestamp: string;
  imageUrl: string | null;
}

// Agricultural Practice Service types (the "brain" — tells farmer what to do)
export type ActionType =
  | "irrigate"
  | "fertilize"
  | "spray_pesticide"
  | "spray_fungicide"
  | "harvest"
  | "monitor"
  | "no_action";

export type UrgencyLevel = "immediate" | "today" | "this_week" | "scheduled" | "none";

export interface FarmingInstruction {
  id: number;
  action: ActionType;
  urgency: UrgencyLevel;
  title: string;
  description: string;
  reason: string;
  estimatedDuration: string;
}

export interface AgricultureData {
  overallStatus: "healthy" | "attention_needed" | "critical";
  summary: string;
  instructions: FarmingInstruction[];
  irrigationSchedule: string;
  fertilizerSchedule: string;
  nextInspection: string;
  timestamp: string;
}

// Insect / pest detection types (powered by PlantInsectCNN)
export interface PestPrediction {
  pest: string;
  confidence: number;
}

export interface InsectDetectionData {
  pest: string;
  confidence: number;
  plantAffected: string;
  severity: "none" | "low" | "medium" | "high";
  treatment: string;
  timestamp: string;
  imageUrl: string | null;
  topPredictions: PestPrediction[];
}

// Actuator names
export type ActuatorName = "irrigation" | "fertiliser" | "pesticide";

// Automation PATCH body
export interface AutomationUpdateBody {
  active: boolean;
  mode: "auto" | "manual";
}
