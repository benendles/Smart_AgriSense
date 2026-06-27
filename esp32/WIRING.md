# ESP32 Wiring — Smart AgriSense node

Connect everything exactly as below; the pins match `src/main.cpp`. **All grounds
must be common** (tie every GND together — ESP32, sensors, relay control side).

## Pin map (quick reference)

| Component | Wire | ESP32 pin |
|---|---|---|
| Capacitive soil moisture | AOUT | **GPIO34** (analog in) |
| Analog pH probe board | Po (analog out) | **GPIO35** (analog in) |
| DS18B20 soil temperature | DATA (yellow) | **GPIO4** |
| DHT22 air temp + humidity | DATA | **GPIO15** |
| Relay IN1 → water pump | IN1 | **GPIO26** |
| Relay IN2 → fertilizer pump | IN2 | **GPIO27** |
| Relay IN3 → pesticide pump | IN3 | **GPIO25** |

---

## Power rails
- **During setup:** the ESP32 is powered by the **laptop USB** (5V).
- **3V3 pin** → powers the sensors (run the analog sensors at **3.3V** so their
  output never exceeds the ESP32 ADC's 3.3V limit).
- **5V / VIN pin** → powers the **relay module's control side** (VCC).
- **GND** → the common ground for everything on the control side.

---

## Sensors → ESP32

### 1. DHT22 — air temperature + humidity → GPIO15
```
DHT22 VCC  → 3V3
DHT22 DATA → GPIO15
DHT22 GND  → GND
```
Add a **10 kΩ** resistor between DATA and VCC (most 3-pin DHT22 modules already have it).

### 2. DS18B20 — soil temperature (waterproof probe) → GPIO4
```
DS18B20 red    → 3V3
DS18B20 yellow → GPIO4   (DATA)
DS18B20 black  → GND
```
**Required:** a **4.7 kΩ** resistor between DATA (yellow) and 3V3.

### 3. Capacitive soil-moisture → GPIO34
```
sensor VCC  → 3V3        (power at 3.3 V, NOT 5 V)
sensor AOUT → GPIO34
sensor GND  → GND
```

### 4. Analog pH board → GPIO35
```
pH board V+ → 3V3        (see warning)
pH board Po → GPIO35     (analog out)
pH board G  → GND
```
⚠️ The ESP32 ADC tolerates **max 3.3 V**. If your pH board needs 5 V and its
output can swing above 3.3 V, either power it at 3.3 V (if supported) or put a
resistor divider on Po — otherwise you can damage GPIO35.

> GPIO34 & GPIO35 are **input-only** pins — perfect for sensors, they can't be outputs.

---

## Relays → pumps

Use a **3-channel relay module**. Two sides:

**Control side (to the ESP32):**
```
relay VCC → 5V (ESP32 VIN/5V)
relay GND → GND (common)
relay IN1 → GPIO26   (water)
relay IN2 → GPIO27   (fertilizer)
relay IN3 → GPIO25   (pesticide)
```
⚠️ Many relay boards are **ACTIVE-LOW** (IN low = relay ON). If yours is, set
`RELAY_ACTIVE_HIGH = false;` at the top of `src/main.cpp`.

**Switched side (each pump, per channel):** the relay is just a switch in the
pump's power line. **Power the pumps from a SEPARATE supply** (5 V/12 V adapter or
battery sized for the pump current) — *never* from the ESP32.
```
pump-supply (+) ──► pump (+)
pump (−)        ──► relay COM
relay NO        ──► pump-supply (−)
```
When the relay turns ON, COM–NO close and the pump circuit completes. The relay
isolates the pump supply from the ESP32 (that's why pumps don't fry the board).

---

## Connect to the laptop + flash (PlatformIO)
1. USB cable: ESP32 → laptop.
2. VS Code → Open Folder → `esp32/` → PlatformIO installs the libraries.
3. Click **Upload (→)** in the blue bottom bar (or `pio run -t upload`).
4. **Serial Monitor** at 115200 → you should see JSON lines like
   `{"soilMoisture":38,"soilTemp":24.5,"temperature":28.1,"humidity":74,"ph":6.4,...}`.
5. Set `RELAY_ACTIVE_HIGH` to match your relay board, and calibrate soil moisture
   + pH (see `README.md` §3). Re-upload after changes.
