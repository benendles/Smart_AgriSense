import io
import os
import json
from datetime import datetime
from pathlib import Path

import torch
from torchvision import transforms
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from models import PlantInsectCNN
from inference import load_model, predict, CLASSES
from store import Store

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH  = Path(os.getenv("MODEL_PATH", "best_model.pth"))
PORT        = int(os.getenv("PORT", 4004))
MQTT_BROKER = os.getenv("MQTT_BROKER", "")   # e.g. "192.168.1.x" — leave empty if no Pi yet
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))
PEST_CONF_THRESHOLD = float(os.getenv("PEST_CONF_THRESHOLD", "0.65"))  # spray when pest conf ≥ this
PESTICIDE_SECONDS   = int(os.getenv("PESTICIDE_SECONDS", "5"))         # fixed spray time (no sensor to close on)
NO_PEST = {"No Pest Detected", "no pest", "Healthy", "healthy"}

device = torch.device("cuda" if torch.cuda.is_available() else
                    "mps"  if torch.backends.mps.is_available() else "cpu")

# ── Treatment advice per class ────────────────────────────────────────────────
TREATMENT = {
    "Adristyrannus":           "Apply systemic insecticide. Monitor nearby crops for spread.",
    "Aphids":                  "Spray neem oil solution (5ml/L). Remove heavily infested leaves.",
    "Beetle":                  "Hand-pick at dawn. Apply kaolin clay as a deterrent.",
    "Bugs":                    "Apply pyrethrin spray. Use sticky traps near affected plants.",
    "Cabbage Looper":          "Apply Bacillus thuringiensis (Bt) spray on undersides of leaves.",
    "Cicadellidae":            "Use yellow sticky traps. Apply systemic insecticide if severe.",
    "Cutworm":                 "Apply collar barriers around stems. Use diatomaceous earth.",
    "Earwig":                  "Set rolled newspaper traps at night. Apply diatomaceous earth.",
    "FieldCricket":            "Remove crop debris. Apply bait insecticide around field edges.",
    "Grasshopper":             "Apply Metarhizium biopesticide. Use barrier crops.",
    "Mediterranean fruit fly": "Use protein bait traps. Bag fruits early. Destroy fallen fruit.",
    "Mites":                   "Spray water forcefully on leaves. Apply neem oil every 3 days.",
    "RedSpider":               "Increase humidity. Apply miticide if severe. Remove infested leaves.",
    "Riptortus":               "Hand-pick adults. Apply pyrethroid insecticide at base of stems.",
    "Slug":                    "Apply iron phosphate bait. Use copper tape barriers around beds.",
    "Snail":                   "Hand-pick at night. Apply iron phosphate pellets around plants.",
    "Thrips":                  "Use blue sticky traps. Apply spinosad or abamectin spray.",
    "Weevil":                  "Apply beneficial nematodes to soil. Use sticky band traps.",
    "Whitefly":                "Use yellow sticky traps. Apply insecticidal soap or neem oil.",
}

SEVERITY = {
    "Adristyrannus": "medium", "Aphids": "medium", "Beetle": "low",
    "Bugs": "medium", "Cabbage Looper": "high", "Cicadellidae": "low",
    "Cutworm": "medium", "Earwig": "low", "FieldCricket": "low",
    "Grasshopper": "medium", "Mediterranean fruit fly": "high", "Mites": "low",
    "RedSpider": "medium", "Riptortus": "medium", "Slug": "low",
    "Snail": "low", "Thrips": "medium", "Weevil": "high", "Whitefly": "medium",
}

# ── Load model at startup ─────────────────────────────────────────────────────
print(f"Loading model from {MODEL_PATH} on {device}...")
model = load_model(MODEL_PATH, device)
print("Model ready.")

store = Store("insect")   # SQLite-backed history at /data/insect.db

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="AgriSense Insect Detection Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def run_inference(image_bytes: bytes) -> dict:
    """Run PlantInsectCNN on raw image bytes and return structured result."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    transform = transforms.Compose([
        transforms.Resize((128, 128)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                            std=[0.229, 0.224, 0.225]),
    ])
    tensor = transform(img).unsqueeze(0).to(device)

    with torch.inference_mode():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1).squeeze()

    top_probs, top_idxs = probs.topk(3)
    predictions = [
        {"pest": CLASSES[idx.item()], "confidence": round(prob.item(), 4)}
        for prob, idx in zip(top_probs, top_idxs)
    ]

    top = predictions[0]
    pest, conf = top["pest"], top["confidence"]

    return {
        "pest":           pest,
        "confidence":     conf,
        "plantAffected":  "General",
        "severity":       SEVERITY.get(pest, "medium"),
        "treatment":      TREATMENT.get(pest, "Consult an agricultural extension officer."),
        "timestamp":      datetime.utcnow().isoformat() + "Z",
        "imageUrl":       None,
        "topPredictions": predictions,
    }


@app.get("/health")
def health():
    return {"status": "ok", "device": str(device), "model": str(MODEL_PATH)}


@app.get("/insect/latest")
def get_latest():
    """Web app polls this every 10 seconds."""
    data = store.latest()
    if data is None:
        raise HTTPException(status_code=404, detail="No detection yet")
    return data


@app.get("/insect/history")
def get_history(limit: int = 50):
    return store.history(limit)


def maybe_trigger_pesticide(result: dict) -> None:
    """If a real pest is detected with high confidence, command the ESP32 over
    MQTT to spray pesticide (the ESP32 subscribes to agrisense/actuator/cmd)."""
    pest = result.get("pest", "")
    conf = float(result.get("confidence", 0) or 0)
    if not MQTT_BROKER or pest in NO_PEST or conf < PEST_CONF_THRESHOLD:
        return
    try:
        import paho.mqtt.publish as publish
        publish.single(
            topic="agrisense/actuator/cmd",
            payload=json.dumps({"actuator": "pesticide", "seconds": PESTICIDE_SECONDS,
                                "reason": f"{pest} detected ({conf:.0%})"}),
            hostname=MQTT_BROKER, port=MQTT_PORT,
            qos=1,   # wait for broker ACK — QoS 0 here silently drops the message
        )
        print(f"[pesticide] spray commanded — {pest} ({conf:.2f})")
    except Exception as e:
        print(f"[pesticide] command failed: {e}")


@app.post("/insect/analyze")
async def analyze(image: UploadFile = File(...)):
    """
    Raspberry Pi calls this after capturing a photo.
    Accepts: multipart/form-data with field name 'image'
    """
    result = store.save(run_inference(await image.read()))
    maybe_trigger_pesticide(result)
    return result


# ── Capture review flow ───────────────────────────────────────────────────────
# Pi uploads to /upload (held, NOT analysed). Farmer reviews via /pending, then
# /confirm runs inference, or /discard drops it so a new photo can be taken.
_pending: bytes | None = None


@app.post("/insect/upload")
async def upload(image: UploadFile = File(...)):
    global _pending
    _pending = await image.read()
    return {"pending": True}


@app.get("/insect/pending")
def pending():
    if _pending is None:
        raise HTTPException(status_code=404, detail="No pending image")
    return Response(content=_pending, media_type="image/jpeg")


@app.post("/insect/confirm")
def confirm():
    global _pending
    if _pending is None:
        raise HTTPException(status_code=404, detail="No pending image")
    result = store.save(run_inference(_pending))
    _pending = None
    maybe_trigger_pesticide(result)
    return result


@app.post("/insect/discard")
def discard():
    global _pending
    _pending = None
    return {"discarded": True}


@app.post("/insect/capture")
def trigger_capture():
    """
    Web app calls this when the farmer presses 'Take Image Now'.
    Publishes MQTT command to the Raspberry Pi to capture a photo.
    """
    if not MQTT_BROKER:
        return {"queued": False, "reason": "MQTT_BROKER not configured — set env var to connect Pi"}

    try:
        import paho.mqtt.publish as publish
        publish.single(
            topic="agrisense/camera/capture",
            payload=json.dumps({"service": "insect"}),
            hostname=MQTT_BROKER,
            port=MQTT_PORT,
            qos=1,   # wait for broker ACK — QoS 0 here silently drops the message
        )
        return {"queued": True}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MQTT publish failed: {e}")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("service:app", host="0.0.0.0", port=PORT, reload=False)
