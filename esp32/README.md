# Smart AgriSense — ESP32 Irrigation Node

The ESP32 reads the soil/air sensors, decides whether to irrigate **locally**
(works even with no WiFi/cloud), drives the water pump, and reports readings to
the cloud MQTT broker. Sketch: [`agrisense_node/agrisense_node.ino`](agrisense_node/agrisense_node.ino).

## 1. Wiring (default pins — change at the top of the sketch if needed)

| Sensor / device | Type | ESP32 pin |
|---|---|---|
| Capacitive soil-moisture | analog out | **GPIO34** |
| Analog pH probe | analog out | **GPIO35** |
| DS18B20 soil temperature | 1-wire data (+ 4.7kΩ pull-up to 3V3) | **GPIO4** |
| DHT22 air temp + humidity | data | **GPIO15** |
| Relay → water pump / solenoid | IN | **GPIO26** |

Power sensors from **3V3**; the pump/relay usually needs **5V** + a separate
supply for the pump itself (don't drive a pump straight from the ESP32).

## 2. Flash it (execution)

1. Install the **Arduino IDE**.
2. **Add ESP32 boards:** File → Preferences → Additional Boards Manager URLs →
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   then Tools → Board → Boards Manager → install **esp32**.
3. **Install libraries** (Tools → Manage Libraries): `DHT sensor library`,
   `Adafruit Unified Sensor`, `OneWire`, `DallasTemperature`, `PubSubClient`,
   `ArduinoJson`.
4. Open the sketch, edit **WIFI_SSID / WIFI_PASS** (and `MQTT_HOST` is already
   your VPS `72.62.93.99`).
5. Tools → Board → **ESP32 Dev Module**; Tools → Port → the port that appeared
   when you plugged in the ESP32.
6. Click **Upload** (→). Open **Serial Monitor** at **115200 baud** to watch it.

## 3. Calibrate (do this once, it matters)

- **Soil moisture:** read the raw value (Serial Monitor) with the probe in **dry
  air** → set `SOIL_RAW_DRY`; in **a glass of water** → set `SOIL_RAW_WET`.
- **pH:** dip in **pH 4.0** and **pH 7.0** buffer solutions, note the voltages,
  fit the line, set `PH_SLOPE` / `PH_OFFSET`.

## 4. Decision thresholds (tune to your crop)

```
SOIL_WET_PCT  = 45   // soil ≥ 45% wet  → don't water
AIR_HUMID_PCT = 80   // air ≥ 80% humid → hold (soil absorbs from air)
SOIL_HOT_C    = 30   // soil ≥ 30°C     → water a bit longer
PH_ALK_ALERT  = 8.0  // pH > 8          → alert "needs treatment"
```

## 5. How it reaches the dashboard

The node publishes JSON to MQTT topic **`agrisense/sensors`** on the VPS broker
(open port 1883 on the VPS — already done). To show these readings on the web
dashboard / feed the advisory, a small bridge subscribes to `agrisense/sensors`
and forwards to the crop-recommendation service — ask and that bridge can be
added next.
