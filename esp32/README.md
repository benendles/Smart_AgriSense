# Smart AgriSense — ESP32 Sensor/Actuator Node

The ESP32 is a **dumb I/O node** — it makes **no decisions**. It reads the
soil/air sensors, sends them to the **Raspberry Pi** as one JSON line every cycle,
and drives the 3 relays **only when the Pi commands it**. The **Pi is the decision
engine + gateway** (irrigation, fertilizer, pH alerts all live in `pi_agent.py`);
pesticide is commanded by the cloud insect AI → Pi → ESP. Wired to the Pi over the
**USB cable** (no WiFi on the ESP). Firmware (PlatformIO): [`src/main.cpp`](src/main.cpp).

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

## 2. Flash it (PlatformIO)

You have the **PlatformIO** VS Code extension — use that:

1. VS Code → **File → Open Folder** → this `esp32/` folder (it contains `platformio.ini`).
2. PlatformIO auto-installs the libraries from `platformio.ini` (DHT, Adafruit
   Unified Sensor, OneWire, DallasTemperature, ArduinoJson) — no manual setup.
3. Plug in the ESP32, then click the PlatformIO **Upload** (→) in the blue bottom
   bar (or run `pio run -t upload`).
4. Click **Serial Monitor** (🔌, or `pio device monitor`) at **115200 baud** to
   watch the JSON reading lines. In production the **Pi** owns that serial port
   (via `pi_agent.py`), so close the monitor afterwards — it would hold the port.

No WiFi to configure — the ESP talks only to the Pi over serial.

## 3. Calibrate (do this once, it matters)

- **Soil moisture:** read the raw value (Serial Monitor) with the probe in **dry
  air** → set `SOIL_RAW_DRY`; in **a glass of water** → set `SOIL_RAW_WET`.
- **pH:** dip in **pH 4.0** and **pH 7.0** buffer solutions, note the voltages,
  fit the line, set `PH_SLOPE` / `PH_OFFSET`.

## 4. Decision thresholds live on the Pi, not here

The ESP makes no decisions. Irrigation (soil-temp table + humidity adjustment),
fertilizer (multi-condition), and pH alerts are all in `pi-relay/pi_agent.py`
(`decide_actions()` / `SOIL_MOIST_THRESHOLD`). Tune your crop there, not in the
firmware.

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
