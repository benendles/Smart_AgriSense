/*
 * Smart AgriSense — ESP32 sensor/actuator node (serial-linked to the Raspberry Pi)
 * ================================================================================
 * PlatformIO project. The ESP32 is wired to the Raspberry Pi over the USB cable
 * and they exchange one-line JSON over serial:
 *
 *   ESP32 → Pi  (every cycle):  {"soilMoisture":..,"soilTemp":..,"temperature":..,
 *                                "humidity":..,"ph":..,"phStatus":"..",
 *                                "wateredSec":..,"fertilized":bool}
 *   Pi → ESP32  (any time):     {"actuator":"pesticide|fertilizer|water","seconds":N}
 *
 * The Pi forwards readings to the cloud and relays cloud AI commands (e.g. spray
 * pesticide from the insect model) back down to this node.
 *
 * WATER + FERTILIZER are decided LOCALLY (work even if the Pi/cloud is offline).
 *   - water:      dry soil + dry air → irrigate
 *   - fertilizer: pH > 8 → dose to acidify toward neutral (no NPK sensor used)
 *   - low pH < 5.5 → ALERT only (no lime dispenser)
 * PESTICIDE is command-only (the cloud insect AI decides, via the Pi).
 *
 * PINS: soil moisture(analog) GPIO34 · pH(analog) GPIO35 · DS18B20 soil temp GPIO4
 *       DHT22 air temp/humidity GPIO15 · relays: water 26 · fertilizer 27 · pesticide 25
 */
#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ── Pins ──────────────────────────────────────────────────────────────────────
const int PIN_SOIL_MOIST = 34, PIN_PH = 35, PIN_DS18B20 = 4, PIN_DHT = 15;
const int PIN_WATER = 26, PIN_FERTILIZER = 27, PIN_PESTICIDE = 25;
const bool RELAY_ACTIVE_HIGH = true;   // flip if your relay board is active-LOW

// ── Calibration (measure for YOUR probes) ─────────────────────────────────────
const int   SOIL_RAW_DRY = 3200, SOIL_RAW_WET = 1400;
const float PH_SLOPE = -5.70, PH_OFFSET = 21.34;

// ── Thresholds + doses (tune to your crop) ────────────────────────────────────
const int   SOIL_WET_PCT = 45;    // soil ≥ this  => wet enough, don't water
const float AIR_HUMID_PCT = 80;   // air ≥ this   => humid, hold irrigation
const float SOIL_HOT_C = 30;      // soil ≥ this  => water a bit longer
const float PH_ACID_ALERT = 5.5;  // pH < this    => too acidic => ALERT (add lime)
const float PH_ACID_MAX = 7.0;    // pH < this    => acidic (monitor)
const float PH_ALK_ALERT = 8.0;   // pH > this    => alkaline => dose fertilizer
const int   FERT_DOSE_S = 8, PEST_DOSE_S = 10;
const unsigned long FERT_COOLDOWN_MS = 6UL * 3600000UL;  // ≥6 h between fertilizer doses
const unsigned long CYCLE_MS = 30000;                     // read + report every 30 s

DHT dht(PIN_DHT, DHT22);
OneWire oneWire(PIN_DS18B20);
DallasTemperature soilTemp(&oneWire);
unsigned long lastFertMs = 0, lastCycle = 0;

void relayWrite(int pin, bool on) { digitalWrite(pin, (on == RELAY_ACTIVE_HIGH) ? HIGH : LOW); }

void doseRelay(int pin, int seconds) {
  relayWrite(pin, true);
  delay((unsigned long)seconds * 1000UL);
  relayWrite(pin, false);
}

int readSoilMoisturePct() {
  long pct = map(analogRead(PIN_SOIL_MOIST), SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  return constrain((int)pct, 0, 100);
}
float readPh() {
  float volts = analogRead(PIN_PH) * (3.3 / 4095.0);
  return constrain(PH_SLOPE * volts + PH_OFFSET, 0.0, 14.0);
}
const char* phStatus(float ph) {
  if (ph > PH_ALK_ALERT)  return "alkaline_dosing_fertilizer";  // > 8 → fertilizer acidifies
  if (ph < PH_ACID_ALERT) return "acidic_low_ALERT_add_lime";   // < 5.5 → alert (no doser)
  if (ph < PH_ACID_MAX)   return "acidic";                       // 5.5–7 → monitor
  return "ok";
}
int decideIrrigationSeconds(int soilPct, float soilT, float airHum) {
  if (soilPct >= SOIL_WET_PCT) return 0;          // soil already wet
  if (airHum  >= AIR_HUMID_PCT) return 0;         // air humid → soil absorbs from air
  int secs = 20 + (SOIL_WET_PCT - soilPct) / 2;   // drier → longer
  if (soilT >= SOIL_HOT_C) secs += 15;            // hot soil → a bit more
  return constrain(secs, 10, 90);
}

// Handle a command line coming DOWN from the Pi.
void handlePiCommand(const String& line) {
  StaticJsonDocument<160> cmd;
  if (deserializeJson(cmd, line)) return;        // ignore non-JSON lines
  const char* act = cmd["actuator"] | "";
  int secs = cmd["seconds"] | 0;
  if (!strcmp(act, "pesticide"))       doseRelay(PIN_PESTICIDE,  secs > 0 ? secs : PEST_DOSE_S);
  else if (!strcmp(act, "fertilizer")) doseRelay(PIN_FERTILIZER, secs > 0 ? secs : FERT_DOSE_S);
  else if (!strcmp(act, "water"))      doseRelay(PIN_WATER,      secs > 0 ? secs : 20);
}

void setup() {
  Serial.begin(115200);                          // the link to the Pi
  pinMode(PIN_WATER, OUTPUT); pinMode(PIN_FERTILIZER, OUTPUT); pinMode(PIN_PESTICIDE, OUTPUT);
  relayWrite(PIN_WATER, false); relayWrite(PIN_FERTILIZER, false); relayWrite(PIN_PESTICIDE, false);
  dht.begin();
  soilTemp.begin();
  analogReadResolution(12);
}

void loop() {
  // 1. Always listen for commands from the Pi (non-blocking, line-based).
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length()) handlePiCommand(line);
  }

  // 2. Every cycle: read sensors, run local water/fertilizer rules, report up.
  if (millis() - lastCycle < CYCLE_MS) return;
  lastCycle = millis();

  int   soilPct = readSoilMoisturePct();
  soilTemp.requestTemperatures();
  float soilT   = soilTemp.getTempCByIndex(0);
  float airT    = dht.readTemperature();
  float airHum  = dht.readHumidity();
  if (isnan(airHum)) airHum = 0;
  float ph      = readPh();

  int waterSecs = decideIrrigationSeconds(soilPct, soilT, airHum);
  if (waterSecs > 0) doseRelay(PIN_WATER, waterSecs);

  bool fertDosed = false;
  if (ph > PH_ALK_ALERT && (lastFertMs == 0 || millis() - lastFertMs > FERT_COOLDOWN_MS)) {
    doseRelay(PIN_FERTILIZER, FERT_DOSE_S);
    lastFertMs = millis();
    fertDosed = true;
  }

  StaticJsonDocument<256> doc;
  doc["soilMoisture"] = soilPct;
  doc["soilTemp"]     = soilT;
  doc["temperature"]  = airT;
  doc["humidity"]     = airHum;
  doc["ph"]           = round(ph * 100) / 100.0;
  doc["phStatus"]     = phStatus(ph);
  doc["wateredSec"]   = waterSecs;
  doc["fertilized"]   = fertDosed;
  serializeJson(doc, Serial);   // one JSON line UP to the Pi
  Serial.println();
}
