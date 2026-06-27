/*
 * Smart AgriSense — ESP32 sensor/actuator node (PlatformIO)
 * =========================================================
 * The ESP32 is a DUMB I/O node. It does NOT make decisions — the Raspberry Pi
 * (the decision engine) does. The ESP only:
 *   1. reads all sensors every cycle and sends them to the Pi as one JSON line, and
 *   2. executes relay commands the Pi sends it.
 *
 * Wired to the Pi over the USB cable; they exchange one-line JSON over serial:
 *   ESP32 → Pi : {"soilMoisture":..,"soilTemp":..,"temperature":..,"humidity":..,"ph":..}
 *   Pi → ESP32 : {"actuator":"water|fertilizer|pesticide","seconds":N}
 *
 * PINS: soil moisture(analog) GPIO34 · pH(analog) GPIO35 · DS18B20 soil temp GPIO4
 *       DHT22 air temp/humidity GPIO15 · relays: water 26 · fertilizer 27 · pesticide 25
 * See WIRING.md for the full connection guide.
 */
#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ── Pins ──────────────────────────────────────────────────────────────────────
const int PIN_SOIL_MOIST = 34, PIN_PH = 35, PIN_DS18B20 = 4, PIN_DHT = 15;
const int PIN_WATER = 26, PIN_FERTILIZER = 27, PIN_PESTICIDE = 25;
const bool RELAY_ACTIVE_HIGH = true;   // flip to false if your relay board is active-LOW

// ── Calibration (measure for YOUR probes — see README §3) ─────────────────────
const int   SOIL_RAW_DRY = 3200, SOIL_RAW_WET = 1400;
const float PH_SLOPE = -5.70, PH_OFFSET = 21.34;

const unsigned long CYCLE_MS = 30000;   // read + report every 30 s
const int DEFAULT_DOSE_S = 10;          // used only if a command omits "seconds"

DHT dht(PIN_DHT, DHT22);
OneWire oneWire(PIN_DS18B20);
DallasTemperature soilTemp(&oneWire);
unsigned long lastCycle = 0;

void relayWrite(int pin, bool on) { digitalWrite(pin, (on == RELAY_ACTIVE_HIGH) ? HIGH : LOW); }

// Run one relay for N seconds (a command from the Pi).
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

// Execute a command line coming DOWN from the Pi. No decisions here — just act.
void handlePiCommand(const String& line) {
  StaticJsonDocument<160> cmd;
  if (deserializeJson(cmd, line)) return;            // ignore non-JSON lines
  const char* act = cmd["actuator"] | "";
  int secs = cmd["seconds"] | DEFAULT_DOSE_S;
  if      (!strcmp(act, "water"))      doseRelay(PIN_WATER,      secs);
  else if (!strcmp(act, "fertilizer")) doseRelay(PIN_FERTILIZER, secs);
  else if (!strcmp(act, "pesticide"))  doseRelay(PIN_PESTICIDE,  secs);
}

void setup() {
  Serial.begin(115200);                              // the link to the Pi
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

  // 2. Every cycle: read all sensors and send them up to the Pi. No decisions.
  if (millis() - lastCycle < CYCLE_MS) return;
  lastCycle = millis();

  int   soilPct = readSoilMoisturePct();
  soilTemp.requestTemperatures();
  float soilT   = soilTemp.getTempCByIndex(0);
  float airT    = dht.readTemperature();
  float airHum  = dht.readHumidity();
  if (isnan(airHum)) airHum = 0;
  if (isnan(airT))   airT   = 0;
  float ph      = readPh();

  StaticJsonDocument<192> doc;
  doc["soilMoisture"] = soilPct;
  doc["soilTemp"]     = soilT;
  doc["temperature"]  = airT;
  doc["humidity"]     = airHum;
  doc["ph"]           = round(ph * 100) / 100.0;
  serializeJson(doc, Serial);   // one JSON line UP to the Pi
  Serial.println();
}
