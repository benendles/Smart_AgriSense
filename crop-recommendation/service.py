
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

store = Store("crop")   # SQLite-backed history at /data/crop.db

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


@app.get("/health")
def health():
    return {"status": "ok", "device": str(device), "model": str(MODEL_PATH)}


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
