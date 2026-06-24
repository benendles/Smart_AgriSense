import io
import json
import os
from datetime import datetime
from pathlib import Path

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from torchvision import transforms

from inference import CLASSES, NUM_CLASSES, load_model
from store import Store

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH  = Path(os.getenv("MODEL_PATH", "best_disease_model.pth"))
PORT        = int(os.getenv("PORT", 4005))
MQTT_BROKER = os.getenv("MQTT_BROKER", "")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))

device = torch.device("cuda" if torch.cuda.is_available() else
                      "mps"  if torch.backends.mps.is_available() else "cpu")

# ── Treatment advice per disease class ───────────────────────────────────────
TREATMENT = {
    "Apple___Apple_scab":
        "Apply fungicide (captan or myclobutanil). Remove and destroy fallen leaves. Prune for airflow.",
    "Apple___Black_rot":
        "Prune infected branches 8 inches below damage. Apply fungicide. Remove mummified fruit.",
    "Apple___Cedar_apple_rust":
        "Apply fungicide at bud break. Remove nearby juniper/cedar trees if possible.",
    "Apple___healthy":
        "No action needed. Continue regular monitoring.",
    "Blueberry___healthy":
        "No action needed. Continue regular monitoring.",
    "Cherry_(including_sour)___Powdery_mildew":
        "Apply sulfur or potassium bicarbonate spray. Improve air circulation by pruning.",
    "Cherry_(including_sour)___healthy":
        "No action needed. Continue regular monitoring.",
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot":
        "Apply strobilurin fungicide. Rotate crops. Use resistant varieties next season.",
    "Corn_(maize)___Common_rust_":
        "Apply fungicide if severe. Use rust-resistant hybrids. Monitor spread.",
    "Corn_(maize)___Northern_Leaf_Blight":
        "Apply fungicide at early tassel stage. Rotate crops. Till crop residue after harvest.",
    "Corn_(maize)___healthy":
        "No action needed. Continue regular monitoring.",
    "Grape___Black_rot":
        "Apply fungicide (myclobutanil). Remove mummified berries. Prune for airflow.",
    "Grape___Esca_(Black_Measles)":
        "No cure available. Remove and destroy infected wood. Protect pruning wounds with fungicide paste.",
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)":
        "Apply copper-based fungicide. Remove infected leaves. Improve canopy airflow.",
    "Grape___healthy":
        "No action needed. Continue regular monitoring.",
    "Orange___Haunglongbing_(Citrus_greening)":
        "No cure. Remove and destroy infected trees immediately to prevent spread. Control Asian citrus psyllid vector.",
    "Peach___Bacterial_spot":
        "Apply copper-based bactericide in spring. Avoid overhead irrigation. Use resistant varieties.",
    "Peach___healthy":
        "No action needed. Continue regular monitoring.",
    "Pepper,_bell___Bacterial_spot":
        "Apply copper bactericide. Remove infected plant parts. Avoid working with wet plants.",
    "Pepper,_bell___healthy":
        "No action needed. Continue regular monitoring.",
    "Potato___Early_blight":
        "Apply fungicide (chlorothalonil or mancozeb). Remove infected leaves. Ensure adequate nutrition.",
    "Potato___Late_blight":
        "Apply fungicide immediately (metalaxyl or chlorothalonil). Remove infected plants. Avoid overhead watering.",
    "Potato___healthy":
        "No action needed. Continue regular monitoring.",
    "Raspberry___healthy":
        "No action needed. Continue regular monitoring.",
    "Soybean___healthy":
        "No action needed. Continue regular monitoring.",
    "Squash___Powdery_mildew":
        "Apply sulfur or neem oil spray. Remove heavily infected leaves. Improve air circulation.",
    "Strawberry___Leaf_scorch":
        "Apply fungicide. Remove and destroy infected leaves. Avoid overhead irrigation.",
    "Strawberry___healthy":
        "No action needed. Continue regular monitoring.",
    "Tomato___Bacterial_spot":
        "Apply copper bactericide. Remove infected plant parts. Avoid overhead irrigation.",
    "Tomato___Early_blight":
        "Apply fungicide (chlorothalonil). Remove lower infected leaves. Mulch to prevent soil splash.",
    "Tomato___Late_blight":
        "Apply fungicide immediately. Remove infected plants. Avoid wetting foliage.",
    "Tomato___Leaf_Mold":
        "Improve greenhouse ventilation. Apply fungicide. Remove infected leaves.",
    "Tomato___Septoria_leaf_spot":
        "Apply fungicide. Remove infected lower leaves. Avoid overhead irrigation.",
    "Tomato___Spider_mites Two-spotted_spider_mite":
        "Apply miticide or neem oil. Increase humidity. Remove heavily infested leaves.",
    "Tomato___Target_Spot":
        "Apply fungicide (azoxystrobin). Remove infected tissue. Improve airflow.",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus":
        "No cure. Remove infected plants immediately. Control whitefly vector with insecticide.",
    "Tomato___Tomato_mosaic_virus":
        "No cure. Remove and destroy infected plants. Disinfect tools. Control aphid vectors.",
    "Tomato___healthy":
        "No action needed. Continue regular monitoring.",
}

SEVERITY = {
    "Apple___Apple_scab": "medium",
    "Apple___Black_rot": "high",
    "Apple___Cedar_apple_rust": "medium",
    "Apple___healthy": "none",
    "Blueberry___healthy": "none",
    "Cherry_(including_sour)___Powdery_mildew": "medium",
    "Cherry_(including_sour)___healthy": "none",
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": "medium",
    "Corn_(maize)___Common_rust_": "medium",
    "Corn_(maize)___Northern_Leaf_Blight": "high",
    "Corn_(maize)___healthy": "none",
    "Grape___Black_rot": "high",
    "Grape___Esca_(Black_Measles)": "high",
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)": "medium",
    "Grape___healthy": "none",
    "Orange___Haunglongbing_(Citrus_greening)": "critical",
    "Peach___Bacterial_spot": "medium",
    "Peach___healthy": "none",
    "Pepper,_bell___Bacterial_spot": "medium",
    "Pepper,_bell___healthy": "none",
    "Potato___Early_blight": "medium",
    "Potato___Late_blight": "critical",
    "Potato___healthy": "none",
    "Raspberry___healthy": "none",
    "Soybean___healthy": "none",
    "Squash___Powdery_mildew": "low",
    "Strawberry___Leaf_scorch": "medium",
    "Strawberry___healthy": "none",
    "Tomato___Bacterial_spot": "medium",
    "Tomato___Early_blight": "medium",
    "Tomato___Late_blight": "critical",
    "Tomato___Leaf_Mold": "medium",
    "Tomato___Septoria_leaf_spot": "medium",
    "Tomato___Spider_mites Two-spotted_spider_mite": "medium",
    "Tomato___Target_Spot": "medium",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": "critical",
    "Tomato___Tomato_mosaic_virus": "critical",
    "Tomato___healthy": "none",
}

TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                        std=[0.229, 0.224, 0.225]),
])

# ── Load model ────────────────────────────────────────────────────────────────
print(f"Loading model from {MODEL_PATH} on {device}...")
model = load_model(MODEL_PATH, device)
print("Model ready.")

store = Store("disease")   # SQLite-backed history at /data/disease.db

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(title="AgriSense Disease Detection Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_class(raw: str) -> tuple[str, str]:
    """Split 'Tomato___Late_blight' into ('Tomato', 'Late blight')."""
    parts = raw.split("___")
    plant   = parts[0].replace("_", " ").replace(",", "")
    disease = parts[1].replace("_", " ") if len(parts) > 1 else "Unknown"
    return plant, disease


def run_inference(image_bytes: bytes) -> dict:
    img    = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = TRANSFORM(img).unsqueeze(0).to(device)

    with torch.inference_mode():
        probs = torch.softmax(model(tensor), dim=1).squeeze()

    top_probs, top_idxs = probs.topk(3)
    predictions = [
        {"disease": CLASSES[i.item()], "confidence": round(p.item(), 4)}
        for p, i in zip(top_probs, top_idxs)
    ]

    top_class = predictions[0]["disease"]
    confidence = predictions[0]["confidence"]
    plant, disease = parse_class(top_class)
    is_healthy = "healthy" in top_class.lower()

    return {
        "disease":         disease,
        "plantType":       plant,
        "confidence":      confidence,
        "severity":        SEVERITY.get(top_class, "medium"),
        "treatment":       TREATMENT.get(top_class, "Consult an agricultural extension officer."),
        "isHealthy":       is_healthy,
        "weedDetected":    False,
        "timestamp":       datetime.utcnow().isoformat() + "Z",
        "imageUrl":        None,
        "topPredictions":  predictions,
    }


@app.get("/health")
def health():
    return {"status": "ok", "device": str(device), "model": str(MODEL_PATH)}


@app.get("/disease/latest")
def get_latest():
    data = store.latest()
    if data is None:
        raise HTTPException(status_code=404, detail="No detection yet")
    return data


@app.get("/disease/history")
def get_history(limit: int = 50):
    return store.history(limit)


@app.post("/disease/analyze")
async def analyze(image: UploadFile = File(...)):
    return store.save(run_inference(await image.read()))


# ── Capture review flow ───────────────────────────────────────────────────────
# Pi uploads to /upload (held, NOT analysed). Farmer reviews via /pending, then
# /confirm runs inference, or /discard drops it so a new photo can be taken.
_pending: bytes | None = None


@app.post("/disease/upload")
async def upload(image: UploadFile = File(...)):
    global _pending
    _pending = await image.read()
    return {"pending": True}


@app.get("/disease/pending")
def pending():
    if _pending is None:
        raise HTTPException(status_code=404, detail="No pending image")
    return Response(content=_pending, media_type="image/jpeg")


@app.post("/disease/confirm")
def confirm():
    global _pending
    if _pending is None:
        raise HTTPException(status_code=404, detail="No pending image")
    result = store.save(run_inference(_pending))
    _pending = None
    return result


@app.post("/disease/discard")
def discard():
    global _pending
    _pending = None
    return {"discarded": True}


@app.post("/disease/capture")
def trigger_capture():
    if not MQTT_BROKER:
        return {"queued": False, "reason": "MQTT_BROKER not configured"}
    try:
        import paho.mqtt.publish as publish
        publish.single(
            topic="agrisense/camera/capture",
            payload=json.dumps({"service": "disease"}),
            hostname=MQTT_BROKER,
            port=MQTT_PORT,
        )
        return {"queued": True}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MQTT publish failed: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("service:app", host="0.0.0.0", port=PORT, reload=False)
