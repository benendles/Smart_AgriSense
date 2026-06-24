# Smart AgriSense — AI-Powered IoT Farm Management System

Final Year Project — ICT University, Cameroon  
Student: Bernard Kihdze | Supervisor: —

---

## Overview

Smart AgriSense is an IoT web platform that connects a Raspberry Pi farm device to an AI-powered dashboard. The Raspberry Pi continuously monitors the farm (sensors + camera) and sends data to a set of independent microservices. The web app displays real-time insights and AI-generated farming instructions to the farmer.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     RASPBERRY PI (Edge Device)                  │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐ │
│  │   Sensors    │  │           Camera Module                 │ │
│  │  - Temp/Hum  │  │  - Plant images                         │ │
│  │  - Soil pH   │  │  - Disease scan images                  │ │
│  │  - Moisture  │  │  - Pest detection images                │ │
│  └──────┬───────┘  └──────────────────┬────────────────────┘ │
│         └────────────────┬────────────┘                        │
│                     MQTT Publish                                │
└──────────────────────────┼──────────────────────────────────────┘
                           │ (Mosquitto MQTT Broker)
            ┌──────────────┴─────────────────────┐
            │                                     │
  agrisense/sensors                    agrisense/camera/*
            │                                     │
┌───────────▼──────────────────────────────────────────────────┐
│                    MICROSERVICES (Node.js + Docker)           │
│                                                              │
│  ┌─────────────────┐  ┌──────────────────┐                 │
│  │ Sensor Service  │  │ Plant Detection  │  :4001 / :4002  │
│  │  (PostgreSQL)   │  │    Service       │                 │
│  └────────┬────────┘  └────────┬─────────┘                 │
│           │                    │                            │
│  ┌────────▼────────┐  ┌────────▼─────────┐                 │
│  │Disease Detection│  │Insect Detection  │  :4003 / :4004  │
│  │   Service       │  │ (PlantInsectCNN) │                 │
│  └────────┬────────┘  └────────┬─────────┘                 │
│           └──────────┬─────────┘                           │
│                      │ (all results feed in)               │
│           ┌──────────▼──────────────┐                      │
│           │ Agricultural Practice   │  :4005               │
│           │  Service  (the "brain") │◄──── Actuator cmds  │
│           │   → irrigation/spray/   │──── agrisense/       │
│           │     fertilize/harvest   │     actuator/cmd     │
│           └──────────┬─────────────┘          │            │
│                      │               ┌─────────▼──────┐   │
│           ┌──────────▼─────────┐     │  Notification  │   │
│           │   Alerts Service   │     │    Service     │   │
│           └──────────┬─────────┘     └───────────────┘   │
└──────────────────────┼───────────────────────────────────┘
                       │ REST APIs (HTTP/JSON)
┌──────────────────────▼───────────────────────────────────────┐
│                 NEXT.JS WEB APP  (this repo)                  │
│                                                              │
│  Dashboard │ Plant │ Disease │ Pests │ Farm Practice │ ...   │
│                                                              │
│  Polls each service every 5–30s                              │
│  Mock data used automatically when service URL is not set    │
└──────────────────────────────────────────────────────────────┘
```

---

## Services

| Service | Port | Description |
|---|---|---|
| Sensor Service | 4001 | Receives MQTT sensor readings, stores time-series |
| Plant Detection | 4002 | Identifies crop type, variety, growth stage |
| Disease Detection | 4003 | Detects plant diseases from leaf images |
| Insect Detection | 4004 | Runs PlantInsectCNN (19 pest classes) on camera images |
| Agricultural Practice | 4005 | Brain — aggregates all data, generates farm instructions |
| Notification | 4006 | Stores and serves alerts |

---

## AI Models

| Model | Purpose | Classes |
|---|---|---|
| PlantInsectCNN (PyTorch) | Pest/insect detection | 19 insect classes |
| Disease Detection CNN | Plant disease detection | Multiple disease classes |
| Plant Detection CNN | Crop identification | 8+ crop types |

The `PlantInsectCNN` model is in `../AI MODELS DATASETS/PLANT_INSECT_MODEL/`.

---

## Getting Started

### 1. Install dependencies

```bash
cd smart-agrisense
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
# Leave all URLs empty to run with mock data (no backend needed)
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Build for production

```bash
npm run build
npm start
```

---

## Raspberry Pi Integration

The Raspberry Pi connects to the system via MQTT. Configure your Pi's Python script to publish to these topics:

| Topic | Payload |
|---|---|
| `agrisense/sensors` | `{ "temperature": 28.4, "humidity": 74, "soilMoisture": 52, "ph": 6.3 }` |
| `agrisense/camera/plant` | `{ "imageBase64": "...", "timestamp": "..." }` |
| `agrisense/camera/disease` | `{ "imageBase64": "...", "timestamp": "..." }` |
| `agrisense/camera/insect` | `{ "imageBase64": "...", "timestamp": "..." }` |
| `agrisense/actuator/cmd` | (subscribed — receives `{ "actuator": "irrigation", "active": true }`) |

---

## Connecting Real Microservices

Edit `.env.local` and set the service URLs. The web app automatically switches from mock to real — no code changes needed.

```bash
SENSOR_SERVICE_URL=http://192.168.1.50:4001
PLANT_DETECTION_SERVICE_URL=http://192.168.1.50:4002
DISEASE_SERVICE_URL=http://192.168.1.50:4003
INSECT_DETECTION_SERVICE_URL=http://192.168.1.50:4004
AGRICULTURE_SERVICE_URL=http://192.168.1.50:4005
NOTIFICATION_SERVICE_URL=http://192.168.1.50:4006
```

Restart the server after changing `.env.local`.

---

## Project Structure

```
smart-agrisense/
├── app/
│   ├── page.tsx                  # Dashboard (live sensor overview)
│   ├── plant/page.tsx            # Plant Detection page
│   ├── disease/page.tsx          # Disease Detection page
│   ├── insect/page.tsx           # Pest Detection page
│   ├── agriculture/page.tsx      # Agricultural Practice (farm instructions)
│   ├── alerts/page.tsx           # Alerts log
│   ├── history/page.tsx          # Sensor history charts
│   └── api/
│       ├── sensors/route.ts
│       ├── plant/route.ts
│       ├── disease/route.ts
│       ├── insect/route.ts
│       ├── agriculture/route.ts
│       ├── automation/route.ts
│       ├── alerts/route.ts
│       └── history/route.ts
├── components/                   # Reusable UI components
├── lib/
│   ├── services.ts               # ← Edit here to connect real services
│   ├── types.ts                  # TypeScript interfaces for all data
│   └── automationStore.ts        # In-memory actuator state (mock only)
└── .env.local.example            # Environment variable template
```

---

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Recharts
- **IoT Protocol**: MQTT (Mosquitto)
- **Edge Device**: Raspberry Pi (Python)
- **AI Models**: PyTorch CNN (PlantInsectCNN + disease + plant detection)
- **Backend** (to be connected): Node.js microservices, PostgreSQL, Docker

---

*Smart AgriSense — Empowering Cameroonian smallholder farmers with AI.*
