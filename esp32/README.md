# Smart AgriSense — ESP32 Sensor/Actuator Node

The ESP32 reads the soil/air sensors, decides **water + fertilizer locally**
(works even if the Pi/cloud is offline), drives the 3 relays, and is wired to the
**Raspberry Pi over the USB cable**. It exchanges one-line JSON over the serial
link — the **Pi is the gateway** to the cloud (no WiFi on the ESP). Pesticide is
commanded by the cloud insect AI → Pi → ESP. Sketch:
[`agrisense_node/agrisense_node.ino`](agrisense_node/agrisense_node.ino).

```
ESP32 ──USB serial──► Raspberry Pi (pi_agent.py gateway) ──HTTP/MQTT──► cloud
      ◄──commands────                ◄── pesticide/fertilizer/water commands ──
```

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
   `Adafruit Unified Sensor`, `OneWire`, `DallasTemperature`, `ArduinoJson`.
   (No WiFi/MQTT library — the ESP talks to the Pi over serial.)
4. No WiFi to configure. Just check the pins/calibration at the top of the sketch.
5. Tools → Board → **ESP32 Dev Module**; Tools → Port → the port that appeared
   when you plugged in the ESP32.
6. Click **Upload** (→). Open **Serial Monitor** at **115200 baud** — you'll see
   the JSON reading lines. (In production the **Pi** reads that serial port via
   `pi_agent.py`; close the Serial Monitor so it doesn't hold the port.)

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

## 5. How it reaches the cloud (via the Pi)

The ESP sends its JSON readings over **serial to the Raspberry Pi**. `pi_agent.py`
reads them and forwards to the **crop-recommendation** service in the cloud
(filling N/P/K/rainfall from config, since those have no sensor). Commands flow
the other way: the cloud insect AI publishes `agrisense/actuator/cmd`, the Pi
subscribes and writes the command down the serial link to the ESP.

Wire-up on the Pi:
```bash
pip install -r requirements-pi.txt          # includes pyserial
export ESP_PORT=/dev/ttyUSB0                 # or /dev/ttyACM0 — check `ls /dev/tty*`
export CLOUD_API=http://72.62.93.99  MQTT_BROKER=72.62.93.99
python3 pi_agent.py
```
