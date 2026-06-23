# Smart AgriSense — Raspberry Pi Connection Guide

How to wire the Raspberry Pi, install the edge agent, and connect it to the
microservices already running on your VPS. **Do the cloud deployment first**
(see `DEPLOYMENT_GUIDE.md`) so the API + MQTT broker exist before the Pi tries
to reach them.

The agent (`pi-relay/pi_agent.py`) is written so the **same script runs with or
without hardware** — if a sensor or the camera is missing it falls back to
realistic simulated data. That is how it was tested, and how you can demo it.

---

## 1. Hardware (recommended bill of materials)

| Component | Purpose | Connects to |
|-----------|---------|-------------|
| Raspberry Pi 4 (2 GB+) | edge compute | — |
| Pi Camera Module v2/v3 | crop/leaf/pest images | CSI ribbon port |
| DHT22 | air temperature + humidity | GPIO4 (data) |
| Capacitive soil-moisture sensor (analogue) | soil moisture | MCP3008 CH0 |
| Analogue pH probe | soil pH | MCP3008 CH1 |
| MCP3008 ADC | reads the analogue sensors (Pi has no ADC) | SPI0 |
| 4-channel relay board | pump / fertiliser / pesticide dispensers | GPIO17/27/22/23 |

### Wiring summary
```
DHT22      DATA ── GPIO4 (pin 7)      VCC ── 3V3      GND ── GND
MCP3008    VDD/VREF ── 3V3   AGND/DGND ── GND
           CLK ── GPIO11(SCLK)  DOUT ── GPIO9(MISO)
           DIN ── GPIO10(MOSI)  CS  ── GPIO8(CE0)
           CH0 ── soil moisture signal   CH1 ── pH signal
Relays     IN1..IN4 ── GPIO17/27/22/23   VCC ── 5V   GND ── GND
Camera     CSI ribbon cable → camera port
```
> This matches **Figure 2 (Hardware wiring schematic)** in the dissertation.

Enable the interfaces once:
```bash
sudo raspi-config        # Interface Options → enable Camera, SPI, I2C
```

---

## 2. Install the edge agent

```bash
# on the Pi
mkdir -p ~/agrisense && cd ~/agrisense
# copy pi_agent.py + requirements-pi.txt + agrisense-pi.service from pi-relay/
sudo apt update && sudo apt install -y python3-pip libgpiod2
pip3 install -r requirements-pi.txt

# hardware drivers (only on the real Pi with sensors attached):
pip3 install picamera2 adafruit-circuitpython-dht adafruit-circuitpython-mcp3xxx
```

---

## 3. Point the Pi at your cloud

The agent is configured entirely by environment variables. Edit
`agrisense-pi.service` (already templated) and set:

| Variable | Value | Notes |
|----------|-------|-------|
| `CLOUD_API` | `https://api.your-domain.com` | your deployed API host |
| `USE_INGRESS` | `true` | path-based routing (Kubernetes ingress) |
| `MQTT_BROKER` | `YOUR_VPS_PUBLIC_IP` | broker reachable on port 1883 / 31883 |
| `MQTT_PORT` | `1883` (compose) or `31883` (k8s NodePort) | |
| `SENSOR_INTERVAL` | `60` | seconds between sensor pushes |

> **Docker-Compose deployment instead?** Set `USE_INGRESS=false` and
> `CLOUD_API=http://YOUR_VPS_PUBLIC_IP` — the agent will use the per-service
> ports 4003–4006 automatically.

---

## 4. Run it as a service (starts on boot, auto-restarts)

```bash
sudo cp agrisense-pi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agrisense-pi
journalctl -u agrisense-pi -f      # watch live logs
```

Healthy logs look like:
```
[hw] camera=REAL sensors=REAL
[mqtt] connected YOUR_VPS_PUBLIC_IP:1883, subscribed agrisense/camera/capture
[sensors] 14:03:01 pushed {...} -> recommend: maize
```

---

## 5. Test the full loop

1. **Sensors → cloud:** within ~1 minute the web dashboard's *Crop
   Recommendation* card updates from the Pi's live readings.
2. **Camera trigger:** open the web app, go to *Plant / Pest / Disease
   Detection*, press **Take Image Now**. The cloud publishes an MQTT command;
   the Pi log prints `[mqtt] capture command for 'plant'`, captures a photo,
   uploads it, and the result appears on the dashboard.

### Test WITHOUT hardware first (recommended)
On any laptop, run the same agent in simulation mode against your VPS:
```bash
CLOUD_API=https://api.your-domain.com USE_INGRESS=true \
MQTT_BROKER=YOUR_VPS_PUBLIC_IP python3 pi_agent.py
```
or run the one-shot end-to-end check:
```bash
python3 pi_relay_simulator.py https://api.your-domain.com
```

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `[mqtt] connection lost ... refused` | broker not reachable | open port 1883 on VPS firewall; check `MQTT_BROKER` IP |
| Capture command never arrives at Pi | service `MQTT_BROKER` env not set in cloud | set it in compose/k8s so `/capture` actually publishes |
| `camera=SIMULATED` on real Pi | `picamera2` not installed / camera not enabled | `raspi-config` enable camera, reinstall `picamera2` |
| Image upload 413 error | upload larger than proxy limit | raise `proxy-body-size` (ingress) / Nginx `client_max_body_size` |
| Sensors push but no dashboard change | web app `*_SERVICE_URL` wrong | point them at the VPS (see DEPLOYMENT_GUIDE §A5) |
| Relays don't fire | actuation logic is on the Pi/decision engine | wire GPIO17/27/22/23 and extend `pi_agent.py` actuation hook |
```
