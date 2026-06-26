/*
 * Smart AgriSense — ESP32 farm controller
 * =========================================
 * Three actuators, three decision sources:
 *
 *   WATER (irrigation)  -> decided LOCALLY from soil moisture + air humidity +
 *                          soil temp. Runs even with no WiFi/cloud.
 *   FERTILIZER          -> decided LOCALLY from pH (pH > 8 => dose acidifying
 *                          fertilizer to pull alkaline soil back toward neutral),
 *                          OR on a cloud command.
 *   PESTICIDE           -> decided by the CLOUD insect-detection AI. The cloud
 *                          publishes a command over MQTT and the ESP32 sprays.
 *
 * The node reads sensors every cycle, acts on the water/fertilizer rules, listens
 * for cloud actuator commands, and reports everything to the MQTT broker so the
 * dashboard + advisory see it.
 *
 * SENSORS / PINS — adjust to your hardware (see esp32/README.md for wiring):
 *   soil moisture (analog) GPIO34 · pH (analog) GPIO35 · DS18B20 soil temp GPIO4
 *   DHT22 air temp/humidity GPIO15
 * RELAYS:
 *   water pump GPIO26 · fertilizer GPIO27 · pesticide GPIO25
 *
 * LIBRARIES: DHT sensor library + Adafruit Unified Sensor, OneWire,
 *            DallasTemperature, PubSubClient, ArduinoJson.  BOARD: ESP32 Dev Module.
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ── 1. CONFIG — edit these ────────────────────────────────────────────────────
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

const char* MQTT_HOST = "72.62.93.99";          // cloud Mosquitto broker (VPS)
const int   MQTT_PORT = 1883;
const char* TOPIC_SENSORS = "agrisense/sensors";        // publish readings
const char* TOPIC_EVENTS  = "agrisense/actuator/event"; // publish what we did
const char* TOPIC_CMD     = "agrisense/actuator/cmd";   // subscribe: cloud commands

const unsigned long CYCLE_MS = 30000;           // read + decide every 30 s

// ── 2. PINS ───────────────────────────────────────────────────────────────────
const int PIN_SOIL_MOIST = 34;   // analog
const int PIN_PH         = 35;   // analog
const int PIN_DS18B20    = 4;    // soil temp (1-wire)
const int PIN_DHT        = 15;   // air temp/humidity
const int PIN_WATER      = 26;   // relay: water pump
const int PIN_FERTILIZER = 27;   // relay: fertilizer dispenser
const int PIN_PESTICIDE  = 25;   // relay: pesticide sprayer
const bool RELAY_ACTIVE_HIGH = true;   // flip if your relay board is active-LOW

// ── 3. CALIBRATION — measure for YOUR probes ──────────────────────────────────
const int SOIL_RAW_DRY = 3200;   // probe in dry air
const int SOIL_RAW_WET = 1400;   // probe in water
const float PH_SLOPE  = -5.70;   // pH = SLOPE*volts + OFFSET (fit with pH4 & pH7 buffers)
const float PH_OFFSET = 21.34;

// ── 4. THRESHOLDS + doses — tune to your crop ─────────────────────────────────
const int   SOIL_WET_PCT  = 45;   // soil ≥ this  => wet enough, don't water
const float AIR_HUMID_PCT = 80;   // air ≥ this   => humid, hold irrigation
const float SOIL_HOT_C    = 30;   // soil ≥ this  => water a bit longer
const float PH_ACID_MAX   = 7.0;  // pH < this    => acidic (log only)
const float PH_ALK_ALERT  = 8.0;  // pH > this    => alkaline => dose fertilizer
const int   FERT_DOSE_S   = 8;    // fertilizer dose length (seconds)
const int   PEST_DOSE_S   = 10;   // default pesticide spray length (seconds)
const unsigned long FERT_COOLDOWN_MS = 6UL  * 3600000UL;  // ≥6 h between fertilizer doses
const unsigned long PEST_COOLDOWN_MS = 1UL  * 3600000UL;  // ≥1 h between sprays

// ── Globals ───────────────────────────────────────────────────────────────────
DHT dht(PIN_DHT, DHT22);
OneWire oneWire(PIN_DS18B20);
DallasTemperature soilTemp(&oneWire);
WiFiClient net;
PubSubClient mqtt(net);
unsigned long lastFertMs = 0, lastPestMs = 0;

void relayWrite(int pin, bool on) { digitalWrite(pin, (on == RELAY_ACTIVE_HIGH) ? HIGH : LOW); }

// Run one relay for N seconds, then publish an event describing it.
void doseRelay(int pin, const char* name, int seconds, const char* reason) {
  Serial.printf("ACTUATE %s for %d s (%s)\n", name, seconds, reason);
  relayWrite(pin, true);
  delay((unsigned long)seconds * 1000UL);
  relayWrite(pin, false);
  StaticJsonDocument<160> ev;
  ev["actuator"] = name;
  ev["seconds"]  = seconds;
  ev["reason"]   = reason;
  if (mqtt.connected()) { char b[160]; size_t n = serializeJson(ev, b); mqtt.publish(TOPIC_EVENTS, b, n); }
}

// ── Sensor reads ──────────────────────────────────────────────────────────────
int readSoilMoisturePct() {
  long pct = map(analogRead(PIN_SOIL_MOIST), SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  return constrain((int)pct, 0, 100);
}
float readPh() {
  float volts = analogRead(PIN_PH) * (3.3 / 4095.0);
  return constrain(PH_SLOPE * volts + PH_OFFSET, 0.0, 14.0);
}
const char* phStatus(float ph) {
  if (ph > PH_ALK_ALERT) return "alkaline_dosing_fertilizer";
  if (ph < PH_ACID_MAX)  return "acidic";
  return "ok";
}

// ── Local decision: irrigation ────────────────────────────────────────────────
// Returns watering seconds (0 = don't irrigate).
int decideIrrigationSeconds(int soilPct, float soilT, float airHum) {
  if (soilPct >= SOIL_WET_PCT) return 0;          // 1. soil already wet
  if (airHum  >= AIR_HUMID_PCT) return 0;         // 2. air humid → soil absorbs from air
  int secs = 20 + (SOIL_WET_PCT - soilPct) / 2;   // 3. drier soil → longer
  if (soilT >= SOIL_HOT_C) secs += 15;            //    hot soil → a bit more
  return constrain(secs, 10, 90);
}

// ── Cloud commands: {"actuator":"pesticide|fertilizer|water","seconds":N} ──────
void onCommand(char* topic, byte* payload, unsigned int len) {
  StaticJsonDocument<160> cmd;
  if (deserializeJson(cmd, payload, len)) return;
  const char* act = cmd["actuator"] | "";
  int secs = cmd["seconds"] | 0;
  if (!strcmp(act, "pesticide")) {
    if (millis() - lastPestMs < PEST_COOLDOWN_MS) { Serial.println("pesticide on cooldown"); return; }
    doseRelay(PIN_PESTICIDE, "pesticide", secs > 0 ? secs : PEST_DOSE_S, "cloud: insect detected");
    lastPestMs = millis();
  } else if (!strcmp(act, "fertilizer")) {
    doseRelay(PIN_FERTILIZER, "fertilizer", secs > 0 ? secs : FERT_DOSE_S, "cloud command");
    lastFertMs = millis();
  } else if (!strcmp(act, "water")) {
    doseRelay(PIN_WATER, "water", secs > 0 ? secs : 20, "cloud command");
  }
}

// ── Connectivity ──────────────────────────────────────────────────────────────
void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " WiFi ok" : " WiFi FAILED (running offline)");
}
void ensureMqtt() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  String id = "agrisense-esp32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (mqtt.connect(id.c_str())) { mqtt.subscribe(TOPIC_CMD); Serial.println("MQTT connected + subscribed"); }
}

// ── Setup / loop ──────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(PIN_WATER, OUTPUT); pinMode(PIN_FERTILIZER, OUTPUT); pinMode(PIN_PESTICIDE, OUTPUT);
  relayWrite(PIN_WATER, false); relayWrite(PIN_FERTILIZER, false); relayWrite(PIN_PESTICIDE, false);
  dht.begin();
  soilTemp.begin();
  analogReadResolution(12);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onCommand);
  ensureWifi();
  ensureMqtt();
  Serial.println("AgriSense ESP32 controller ready.");
}

void loop() {
  ensureWifi();
  ensureMqtt();
  mqtt.loop();   // process incoming cloud commands

  // ── read all sensors ──
  int   soilPct = readSoilMoisturePct();
  soilTemp.requestTemperatures();
  float soilT   = soilTemp.getTempCByIndex(0);
  float airT    = dht.readTemperature();
  float airHum  = dht.readHumidity();
  float ph      = readPh();
  if (isnan(airHum)) airHum = 0;

  // ── WATER: local decision ──
  int waterSecs = decideIrrigationSeconds(soilPct, soilT, airHum);
  if (waterSecs > 0) doseRelay(PIN_WATER, "water", waterSecs, "soil dry, air not humid");

  // ── FERTILIZER: local rule — high pH gets an acidifying dose (with cooldown) ──
  bool fertDosed = false;
  if (ph > PH_ALK_ALERT && (millis() - lastFertMs > FERT_COOLDOWN_MS || lastFertMs == 0)) {
    doseRelay(PIN_FERTILIZER, "fertilizer", FERT_DOSE_S, "pH high — acidify toward neutral");
    lastFertMs = millis();
    fertDosed = true;
  }

  // ── report readings ──
  StaticJsonDocument<256> doc;
  doc["soilMoisture"] = soilPct;
  doc["soilTemp"]     = soilT;
  doc["temperature"]  = airT;
  doc["humidity"]     = airHum;
  doc["ph"]           = round(ph * 100) / 100.0;
  doc["phStatus"]     = phStatus(ph);
  doc["wateredSec"]   = waterSecs;
  doc["fertilized"]   = fertDosed;
  if (mqtt.connected()) { char b[256]; size_t n = serializeJson(doc, b); mqtt.publish(TOPIC_SENSORS, b, n); }

  Serial.printf("soil=%d%% soilT=%.1fC airT=%.1fC hum=%.0f%% pH=%.2f(%s) water=%ds fert=%d\n",
                soilPct, soilT, airT, airHum, ph, phStatus(ph), waterSecs, fertDosed);

  delay(CYCLE_MS);
}
