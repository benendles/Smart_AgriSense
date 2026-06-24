import io
import json
import os
from datetime import datetime
from pathlib import Path

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from torchvision import transforms

from inference import CLASSES, NUM_CLASSES, load_model
from store import Store

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH  = Path(os.getenv("MODEL_PATH", "best_plant_model.pth"))
PORT        = int(os.getenv("PORT", 4003))
MQTT_BROKER = os.getenv("MQTT_BROKER", "")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))

device = torch.device("mps"  if torch.backends.mps.is_available() else
                    "cuda" if torch.cuda.is_available() else "cpu")

# ── Growth stage info per plant ───────────────────────────────────────────────
GROWTH_INFO = {
    "Apple":      {"stages": ["Dormant","Bud Break","Flowering","Fruit Set","Maturity"], "days": 180},
    "Blueberry":  {"stages": ["Dormant","Bud Swell","Flowering","Green Fruit","Ripe"],   "days": 90},
    "Cherry":     {"stages": ["Dormant","Bud Break","Flowering","Fruit Set","Harvest"],  "days": 70},
    "Corn":       {"stages": ["Seedling","V-Stage","Tasseling","Silking","Maturity"],    "days": 100},
    "Grape":      {"stages": ["Dormant","Budbreak","Flowering","Veraison","Harvest"],    "days": 150},
    "Orange":     {"stages": ["Dormant","Flush","Flowering","Fruit Set","Maturity"],     "days": 240},
    "Peach":      {"stages": ["Dormant","Bud Break","Flowering","Fruit Set","Harvest"],  "days": 120},
    "Pepper":     {"stages": ["Seedling","Vegetative","Flowering","Fruiting","Maturity"],"days": 90},
    "Potato":     {"stages": ["Sprout","Vegetative","Tuber Init","Bulking","Maturity"],  "days": 110},
    "Raspberry":  {"stages": ["Dormant","Primocane","Floricane","Flowering","Harvest"],  "days": 60},
    "Soybean":    {"stages": ["Seedling","Vegetative","Flowering","Pod Fill","Maturity"],"days": 120},
    "Squash":     {"stages": ["Seedling","Vegetative","Flowering","Fruiting","Harvest"], "days": 60},
    "Strawberry": {"stages": ["Dormant","Leaf Growth","Flowering","Green Fruit","Ripe"], "days": 40},
    "Tomato":     {"stages": ["Seedling","Vegetative","Flowering","Fruiting","Maturity"],"days": 85},
}

TRANSFORM = transforms.Compose([
    transforms.Resize((128, 128)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

print(f"Loading model from {MODEL_PATH} on {device}...")
model = load_model(MODEL_PATH, device)
print("Model ready.")

store = Store("plant")   # SQLite-backed history at /data/plant.db

app = FastAPI(title="AgriSense Plant Detection Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


def run_inference(image_bytes: bytes) -> dict:
    img    = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = TRANSFORM(img).unsqueeze(0).to(device)

    with torch.inference_mode():
        probs = torch.softmax(model(tensor), dim=1).squeeze()

    top_probs, top_idxs = probs.topk(3)
    predictions = [
        {"plant": CLASSES[i.item()], "confidence": round(p.item(), 4)}
        for p, i in zip(top_probs, top_idxs)
    ]

    top_plant = predictions[0]["plant"]
    info      = GROWTH_INFO.get(top_plant, {"stages": ["Seedling","Vegetative","Flowering","Fruiting","Maturity"], "days": 90})

    return {
        "plant":          top_plant,
        "variety":        f"{top_plant} (detected)",
        "confidence":     predictions[0]["confidence"],
        "growthStage":    info["stages"][2],
        "growthStages":   info["stages"],
        "daysToHarvest":  info["days"] // 2,
        "timestamp":      datetime.utcnow().isoformat() + "Z",
        "imageUrl":       None,
        "topPredictions": predictions,
    }


@app.get("/health")
def health():
    return {"status": "ok", "device": str(device), "model": str(MODEL_PATH)}


@app.get("/plant/latest")
def get_latest():
    data = store.latest()
    if data is None:
        raise HTTPException(status_code=404, detail="No detection yet")
    return data


@app.get("/plant/history")
def get_history(limit: int = 50):
    return store.history(limit)


@app.post("/plant/analyze")
async def analyze(image: UploadFile = File(...)):
    return store.save(run_inference(await image.read()))


@app.post("/plant/capture")
def trigger_capture():
    if not MQTT_BROKER:
        return {"queued": False, "reason": "MQTT_BROKER not configured"}
    try:
        import paho.mqtt.publish as publish
        publish.single(
            topic="agrisense/camera/capture",
            payload=json.dumps({"service": "plant"}),
            hostname=MQTT_BROKER,
            port=MQTT_PORT,
        )
        return {"queued": True}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MQTT publish failed: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("service:app", host="0.0.0.0", port=PORT, reload=False)
