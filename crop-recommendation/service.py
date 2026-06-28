
import os
from datetime import datetime
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from inference import CLASSES, FEATURES, SCALER, load_model, predict
from store import Store

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = Path(os.getenv("MODEL_PATH", "best_recommendation_model.pth"))
PORT       = int(os.getenv("PORT", 4006))

device = torch.device("mps"  if torch.backends.mps.is_available() else
                    "cuda" if torch.cuda.is_available() else "cpu")

print(f"Loading model from {MODEL_PATH} on {device}...")
model = load_model(MODEL_PATH, device)
print("Model ready.")

store        = Store("crop")     # SQLite-backed history at /data/crop.db
sensor_store = Store("sensors")  # raw ESP32 readings for the dashboard

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(title="AgriSense Crop Recommendation Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SensorInput(BaseModel):
    N:           float
    P:           float
    K:           float
    temperature: float
    humidity:    float
    ph:          float
    rainfall:    float


class RawSensorInput(BaseModel):
    temperature:  float
    humidity:     float
    ph:           float
    soilMoisture: float | None = None
    soilTemp:     float | None = None
    online:       bool = True


@app.get("/health")
def health():
    return {"status": "ok", "device": str(device), "model": str(MODEL_PATH)}


# ── Raw sensor endpoints (consumed by the web dashboard) ─────────────────────

@app.post("/sensors/ingest")
def ingest_sensors(data: RawSensorInput):
    return sensor_store.save({
        "temperature":  data.temperature,
        "humidity":     data.humidity,
        "ph":           data.ph,
        "soilMoisture": data.soilMoisture,
        "soilTemp":     data.soilTemp,
        "online":       data.online,
        "timestamp":    datetime.utcnow().isoformat() + "Z",
    })


@app.get("/sensors/latest")
def latest_sensors():
    data = sensor_store.latest()
    if data is None:
        raise HTTPException(status_code=404, detail="No sensor data yet")
    return data


@app.get("/sensors/history")
def sensor_history(hours: int = 24):
    rows = sensor_store.history(hours * 4)  # up to 4 readings/hour
    rows = [r for r in rows if r.get("timestamp", "") >= (
        datetime.utcnow().isoformat()[:13]  # rough hour filter via prefix
    )[:0] or True]  # include all; let caller filter if needed
    # Return chart-friendly format matching the web app's HistoryData type
    rows_asc = list(reversed(rows))
    return {
        "labels":       [r["timestamp"][11:16] for r in rows_asc],  # "HH:MM"
        "temperature":  [r.get("temperature",  0) for r in rows_asc],
        "humidity":     [r.get("humidity",     0) for r in rows_asc],
        "soilMoisture": [r.get("soilMoisture", 0) for r in rows_asc],
        "ph":           [r.get("ph",           0) for r in rows_asc],
    }


@app.get("/recommendation/latest")
def get_latest():
    data = store.latest()
    if data is None:
        raise HTTPException(status_code=404, detail="No recommendation yet")
    return data


@app.get("/recommendation/history")
def get_history(limit: int = 50):
    return store.history(limit)


@app.post("/recommendation/predict")
def recommend(sensors: SensorInput):
    sensor_dict = sensors.model_dump()
    results = predict(sensor_dict, model, device, top_k=3)

    top = results[0]
    return store.save({                       # persist + return in one step
        "recommendedCrop":  top["crop"],
        "confidence":       top["confidence"],
        "topCrops":         results,
        "sensorReadings":   sensor_dict,
        "timestamp":        datetime.utcnow().isoformat() + "Z",
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("service:app", host="0.0.0.0", port=PORT, reload=False)
