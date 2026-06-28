#!/usr/bin/env python3
"""
Smart AgriSense — Raspberry Pi Edge Agent
=========================================
Runs ON the Raspberry Pi at the farm. It does two jobs:

  1. CAMERA  — subscribes to the MQTT topic the cloud publishes to when a farmer
     presses "Take Image Now". On a command it captures a photo and uploads it to
     the matching vision service (/plant, /insect or /disease /analyze).

  2. SENSORS — reads DHT22 (temp/humidity) + analogue probes via MCP3008 (soil
     moisture, pH) on a fixed interval and POSTs them to the crop-recommendation
     service (/recommendation/predict).

If the hardware libraries / sensors are not present (e.g. when you test on a
laptop), the agent automatically falls back to realistic SIMULATED data, so the
exact same script works for the demo and for the real deployment.

Configure everything with environment variables — see agrisense-pi.service.
"""
import io
import json
import os
import random
import threading
import time
from datetime import datetime

import requests

# ── Configuration (override via environment) ──────────────────────────────────
CLOUD_API   = os.getenv("CLOUD_API", "http://localhost")   # https://api.your-domain.com on real deploy
PORTS       = {"plant": 30003, "insect": 30004, "disease": 30005, "crop": 30006}
USE_INGRESS = os.getenv("USE_INGRESS", "false").lower() == "true"  # true => path-based, no ports

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")        # <VPS_PUBLIC_IP> on real deploy
MQTT_PORT   = int(os.getenv("MQTT_PORT", "1883"))
CAPTURE_TOPIC = os.getenv("CAPTURE_TOPIC", "agrisense/camera/capture")

SENSOR_INTERVAL = int(os.getenv("SENSOR_INTERVAL", "60"))  # seconds between sensor pushes

# ── ESP32 link (USB serial) + cloud actuator commands ─────────────────────────
ESP_PORT = os.getenv("ESP_PORT", "/dev/ttyUSB0")   # ESP32 serial (Pi: /dev/ttyUSB0 or /dev/ttyACM0)
ESP_BAUD = int(os.getenv("ESP_BAUD", "115200"))
ACTUATOR_TOPIC = os.getenv("ACTUATOR_TOPIC", "agrisense/actuator/cmd")
# N, P, K and rainfall have no sensor — forwarded from these (lab soil test + weather).
SOIL_N   = float(os.getenv("SOIL_N", "90"))
SOIL_P   = float(os.getenv("SOIL_P", "42"))
SOIL_K   = float(os.getenv("SOIL_K", "43"))
RAINFALL = float(os.getenv("RAINFALL_MM", "120"))

# ── Decision-engine thresholds (the Pi is the brain) ──────────────────────────
SOIL_MOIST_THRESHOLD = int(os.getenv("SOIL_MOIST_THRESHOLD", "40"))  # irrigate below this %
ALERTS_TOPIC = os.getenv("ALERTS_TOPIC", "agrisense/alerts")

# Path-based (ingress) vs port-based (docker-compose) URL builders
def upload_url(service: str) -> str:
    # Upload the captured image for the farmer to REVIEW (not auto-analyse).
    # The web app shows it, then calls /confirm (analyse) or /discard (retake).
    name = {"plant": "plant", "insect": "insect", "disease": "disease"}[service]
    if USE_INGRESS:
        return f"{CLOUD_API}/{name}/{name}/upload"
    return f"{CLOUD_API}:{PORTS[service]}/{name}/upload"

def recommend_url() -> str:
    if USE_INGRESS:
        return f"{CLOUD_API}/recommendation/recommendation/predict"
    return f"{CLOUD_API}:{PORTS['crop']}/recommendation/predict"


# ── Hardware abstraction (real sensors if available, else simulated) ───────────
class Hardware:
    def __init__(self):
        self.real_camera = self.real_sensors = False
        try:
            from picamera2 import Picamera2  # noqa
            self._Picamera2 = Picamera2
            self.real_camera = True
        except Exception:
            pass
        try:
            import board, adafruit_dht, busio, digitalio
            import adafruit_mcp3xxx.mcp3008 as MCP
            from adafruit_mcp3xxx.analog_in import AnalogIn

            # DHT22 data pin on GPIO4 (BCM) — see RASPBERRY_PI_GUIDE wiring table.
            self._dht = adafruit_dht.DHT22(board.D4)
            # MCP3008 ADC over hardware SPI0 (CE0). The Pi has no analogue input,
            # so the soil-moisture and pH probes are read through this chip.
            spi = busio.SPI(clock=board.SCK, MOSI=board.MOSI, MISO=board.MISO)
            cs = digitalio.DigitalInOut(board.CE0)
            mcp = MCP.MCP3008(spi, cs)
            self._chan_moist = AnalogIn(mcp, MCP.P0)   # CH0 — soil moisture
            self._chan_ph    = AnalogIn(mcp, MCP.P1)   # CH1 — pH probe
            self.real_sensors = True
        except Exception as e:
            self._sensor_init_error = e
            pass
        print(f"[hw] camera={'REAL' if self.real_camera else 'SIMULATED'} "
              f"sensors={'REAL' if self.real_sensors else 'SIMULATED'}")

    def capture_jpeg(self) -> bytes:
        if self.real_camera:
            cam = self._Picamera2()
            cam.configure(cam.create_still_configuration())
            cam.start(); time.sleep(1.5)
            buf = io.BytesIO(); cam.capture_file(buf, format="jpeg"); cam.stop()
            return buf.getvalue()
        # simulated leaf frame
        from PIL import Image, ImageDraw
        img = Image.new("RGB", (256, 256), (235, 240, 230))
        d = ImageDraw.Draw(img); d.ellipse([40, 30, 216, 226], fill=(70, 140, 60))
        d.line([128, 40, 128, 215], fill=(40, 90, 40), width=4)
        buf = io.BytesIO(); img.save(buf, format="JPEG"); return buf.getvalue()

    def read_sensors(self) -> dict:
        if self.real_sensors:
            return self._read_real()
        return self._read_simulated()

    @staticmethod
    def _read_simulated() -> dict:
        # simulated but realistic readings (Cameroon humid-tropical ranges)
        return {
            "N": random.randint(60, 110), "P": random.randint(30, 60), "K": random.randint(30, 55),
            "temperature": round(random.uniform(24, 32), 1),
            "humidity":    round(random.uniform(60, 85), 1),
            "ph":          round(random.uniform(5.8, 7.0), 1),
            "rainfall":    round(random.uniform(80, 200), 1),
        }

    def _read_real(self) -> dict:
        """Read the physical sensors. Each probe is read independently so a single
        flaky sensor degrades to a simulated value for that field instead of
        dropping the whole push. The return contract is identical to the
        simulated path, so the cloud never sees a difference."""
        sim = self._read_simulated()
        out = dict(sim)

        # DHT22 — temperature (°C) + humidity (%). It legitimately raises a
        # RuntimeError on ~1 in 5 reads, so retry a few times before giving up.
        for _ in range(3):
            try:
                t = self._dht.temperature
                h = self._dht.humidity
                if t is not None and h is not None:
                    out["temperature"] = round(t, 1)
                    out["humidity"] = round(h, 1)
                    break
            except RuntimeError:
                time.sleep(2)
            except Exception as e:
                print(f"[sensors] DHT22 read error: {e}"); break

        # pH probe via MCP3008 CH1. Analogue boards output a voltage that maps
        # linearly to pH; calibrate with two buffer solutions (pH 4 & 7) and set
        # PH_SLOPE / PH_OFFSET from the fit. Defaults assume the common
        # pH = -5.7 * V + 21.34 calibration — REPLACE with your own.
        try:
            v = self._chan_ph.voltage
            slope  = float(os.getenv("PH_SLOPE", "-5.70"))
            offset = float(os.getenv("PH_OFFSET", "21.34"))
            out["ph"] = round(max(0.0, min(14.0, slope * v + offset)), 2)
        except Exception as e:
            print(f"[sensors] pH read error: {e}")

        # Soil moisture via MCP3008 CH0 (0–100%). Not a field the crop model
        # consumes, but useful for logging and for driving the irrigation relay.
        try:
            raw = self._chan_moist.value           # 0..65535
            dry = float(os.getenv("MOIST_RAW_DRY", "55000"))   # probe in air
            wet = float(os.getenv("MOIST_RAW_WET", "23000"))   # probe in water
            pct = (dry - raw) / (dry - wet) * 100.0
            out["soil_moisture"] = round(max(0.0, min(100.0, pct)), 1)
        except Exception as e:
            print(f"[sensors] soil-moisture read error: {e}")

        # N, P, K and rainfall have NO sensor in the bill of materials. Source
        # them from env (e.g. latest lab soil test + local weather feed); they
        # fall back to the simulated values above when unset.
        for key, env in (("N", "SOIL_N"), ("P", "SOIL_P"), ("K", "SOIL_K"), ("rainfall", "RAINFALL_MM")):
            val = os.getenv(env)
            if val is not None:
                try:
                    out[key] = float(val)
                except ValueError:
                    pass
        return out


HW = Hardware()


# ── Job 1: respond to cloud capture commands over MQTT ────────────────────────
def on_capture(service: str):
    try:
        img = HW.capture_jpeg()
        url = upload_url(service)
        files = {"image": (f"{service}.jpg", img, "image/jpeg")}
        r = requests.post(url, files=files, timeout=60); r.raise_for_status()
        print(f"[camera] {service} -> uploaded, awaiting farmer review/confirm")
    except Exception as e:
        print(f"[camera] {service} capture/upload failed: {e}")


def mqtt_loop():
    try:
        import paho.mqtt.client as mqtt
    except Exception:
        print("[mqtt] paho-mqtt not installed — camera trigger disabled."); return

    def _on_connect(c, *_):
        c.subscribe(CAPTURE_TOPIC)
        c.subscribe(ACTUATOR_TOPIC)
        print(f"[mqtt] connected {MQTT_BROKER}:{MQTT_PORT}, subscribed {CAPTURE_TOPIC} + {ACTUATOR_TOPIC}")

    def _on_message(c, u, msg):
        # Actuator command from the cloud (e.g. pesticide from the insect AI) →
        # relay it down to the ESP32 over serial.
        if msg.topic == ACTUATOR_TOPIC:
            try:
                cmd = json.loads(msg.payload.decode())
            except Exception:
                return
            print(f"[mqtt] actuator command -> ESP: {cmd}")
            relay_to_esp(cmd)
            return
        # Otherwise it's a camera capture command (handled here on the Pi).
        try:
            service = json.loads(msg.payload.decode()).get("service", "plant")
        except Exception:
            service = "plant"
        print(f"[mqtt] capture command for '{service}'")
        on_capture(service)

    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)  # paho-mqtt >= 2.0
    except AttributeError:
        client = mqtt.Client()                                  # paho-mqtt 1.x
    client.on_connect = _on_connect
    client.on_message = _on_message
    client._connect_timeout = 10  # fail fast so ESP serial loop isn't starved
    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            client.loop_forever()
        except Exception as e:
            print(f"[mqtt] connection lost ({e}); retrying in 10s")
            time.sleep(10)


# ── Job 2: ESP32 bridge — read its sensors over serial, forward to the cloud, ──
#          and relay cloud actuator commands back down to it. ──────────────────
_esp = None
_esp_lock = threading.Lock()


def esp_open():
    """Open (once) the USB serial link to the ESP32. Returns None if unavailable
    (e.g. ESP not plugged in / pyserial missing) so the gateway keeps running."""
    global _esp
    if _esp is not None:
        return _esp
    try:
        import serial  # pyserial
        _esp = serial.Serial(ESP_PORT, ESP_BAUD, timeout=2)
        print(f"[esp] opened {ESP_PORT} @ {ESP_BAUD}")
    except Exception as e:
        print(f"[esp] cannot open {ESP_PORT}: {e}")
        _esp = None
    return _esp


def relay_to_esp(cmd: dict):
    """Send an actuator command JSON line down to the ESP32."""
    s = esp_open()
    if s is None:
        return
    try:
        with _esp_lock:
            s.write((json.dumps(cmd) + "\n").encode())
        print(f"[esp] relayed: {cmd}")
    except Exception as e:
        print(f"[esp] write failed: {e}")


# ── The decision engine (all the intelligence lives HERE, not on the ESP) ─────
def _water_seconds(soil_temp, humidity) -> int:
    """Irrigation dose: base time from soil temperature, trimmed by air humidity."""
    t = soil_temp if soil_temp is not None else 25
    if   t < 20: base = 15
    elif t < 30: base = 25
    elif t < 35: base = 40
    else:        base = 60
    h = humidity if humidity is not None else 50
    if   h > 90:  return 0                 # too humid → delay
    elif h > 70:  base = int(base * 0.6)   # reduce 40%
    elif h >= 40: base = int(base * 0.8)   # reduce 20%
    return base                            # h < 40 → full dose


def _ph_alert(ph):
    """Recommendation/alert string for the pH band, or None if pH is fine."""
    if ph is None: return None
    if ph < 5.5:   return f"pH {ph:.1f} HIGHLY ACIDIC — apply agricultural lime (no auto-fertilizer)"
    if ph < 6.5:   return None   # slightly acidic — ideal
    if ph < 7.5:   return None   # neutral — perfect
    if ph <= 8.5:  return f"pH {ph:.1f} alkaline — recommend sulfur / acidifying fertilizer"
    return f"pH {ph:.1f} HIGHLY ALKALINE — corrective treatment needed"


def publish_alert(message: str):
    print(f"[alert] {message}")
    if not MQTT_BROKER:
        return
    try:
        import paho.mqtt.publish as publish
        publish.single(ALERTS_TOPIC, hostname=MQTT_BROKER, port=MQTT_PORT,
                       payload=json.dumps({"message": message,
                                           "ts": datetime.utcnow().isoformat() + "Z"}))
    except Exception as e:
        print(f"[alert] publish failed: {e}")


def decide_actions(data: dict):
    """Runs on every ESP reading: decides irrigation + fertilizer, sends commands
    back to the ESP, and raises pH alerts. (Pesticide comes from the insect AI.)"""
    soil  = data.get("soilMoisture")
    soilT = data.get("soilTemp")
    hum   = data.get("humidity")
    ph    = data.get("ph")

    # 1. Irrigation — only when the soil is dry.
    # Guard: soilMoisture==0 means probe disconnected (real soil is never bone-dry at 0).
    if soil is not None and soil > 0 and soil < SOIL_MOIST_THRESHOLD:
        secs = _water_seconds(soilT, hum)
        if secs > 0:
            relay_to_esp({"actuator": "water", "seconds": secs})
        else:
            print("[decide] soil dry but air too humid — irrigation delayed")
    elif soil == 0:
        print("[decide] soilMoisture=0 — probe disconnected, skipping irrigation")

    # 2. pH analysis → alert.
    # Guard: pH==14 means probe disconnected (pegged at ADC max).
    if ph is not None and ph < 14:
        alert = _ph_alert(ph)
        if alert:
            publish_alert(alert)
    elif ph == 14:
        print("[decide] pH=14 — probe disconnected, skipping pH alert")

    # 3. Fertilizer — multi-condition: moist enough, not too hot, and pH says it helps.
    if (soil is not None and soil > 40 and soilT is not None and soilT < 35
            and ph is not None and 7.5 < ph <= 8.5):
        relay_to_esp({"actuator": "fertilizer", "seconds": 8})


def esp_serial_loop():
    """Read each ESP32 sensor line, forward it to the cloud, and run the engine."""
    while True:
        s = esp_open()
        if s is None:
            time.sleep(5); continue
        try:
            line = s.readline().decode(errors="ignore").strip()
            data = json.loads(line) if line else None
        except Exception:
            continue
        if not data:
            continue
        # N/P/K/rainfall have no sensor → fill from config; temp/humidity/pH from the ESP.
        payload = {
            "N": SOIL_N, "P": SOIL_P, "K": SOIL_K,
            "temperature": float(data.get("temperature", 0) or 0),
            "humidity":    float(data.get("humidity", 0) or 0),
            "ph":          float(data.get("ph", 7) or 7),
            "rainfall":    RAINFALL,
        }
        try:
            r = requests.post(recommend_url(), json=payload, timeout=30); r.raise_for_status()
            print(f"[esp→cloud] {data} -> crop: {r.json().get('recommendedCrop')}")
        except Exception as e:
            print(f"[esp→cloud] push failed: {e}")

        # Push raw readings so the web dashboard can display live sensor data.
        try:
            sensor_payload = {
                "temperature":  float(data.get("temperature", 0) or 0),
                "humidity":     float(data.get("humidity", 0) or 0),
                "ph":           float(data.get("ph", 0) or 0),
                "soilMoisture": float(data.get("soilMoisture", 0) or 0),
                "soilTemp":     float(data.get("soilTemp", 0) or 0),
                "online":       True,
            }
            requests.post(f"{CLOUD_API}:30006/sensors/ingest",
                          json=sensor_payload, timeout=10)
            print("[sensors] pushed to dashboard")
        except Exception as e:
            print(f"[sensors] dashboard push failed: {e}")

        decide_actions(data)   # the brain: irrigation + fertilizer + pH alerts


if __name__ == "__main__":
    print(f"Smart AgriSense Pi gateway starting | CLOUD_API={CLOUD_API} "
          f"MQTT={MQTT_BROKER}:{MQTT_PORT} ESP={ESP_PORT}")
    threading.Thread(target=esp_serial_loop, daemon=True).start()  # ESP sensors → cloud
    mqtt_loop()   # blocks; handles camera captures + relays actuator commands → ESP
