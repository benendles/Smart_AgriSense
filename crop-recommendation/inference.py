import argparse
import json
import pickle
from pathlib import Path

import numpy as np
import torch
from torch import nn

BASE = Path(__file__).parent

with open(BASE / "crop_classes.json") as f:
    CLASSES = json.load(f)

with open(BASE / "scaler.pkl", "rb") as f:
    SCALER = pickle.load(f)

FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
NUM_CLASSES = len(CLASSES)


class CropRecommender(nn.Module):
    def __init__(self, in_features, num_classes):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_features, 256), nn.BatchNorm1d(256), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(256, 128),         nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(128, 64),          nn.BatchNorm1d(64),  nn.ReLU(),
            nn.Linear(64, num_classes),
        )
    def forward(self, x): return self.net(x)


def load_model(model_path: str | Path, device: torch.device) -> CropRecommender:
    model = CropRecommender(len(FEATURES), NUM_CLASSES)
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    return model


def predict(sensor_values: dict, model: CropRecommender, device: torch.device, top_k=3) -> list[dict]:
    """
    sensor_values: dict with keys N, P, K, temperature, humidity, ph, rainfall
    Returns top-k crop recommendations with confidence scores.
    """
    row = np.array([[sensor_values[f] for f in FEATURES]], dtype=np.float32)
    row = SCALER.transform(row)
    tensor = torch.tensor(row).to(device)
    with torch.inference_mode():
        model.eval()
        probs = torch.softmax(model(tensor), dim=1).squeeze()
    top_probs, top_idxs = probs.topk(top_k)
    return [
        {"crop": CLASSES[i.item()], "confidence": round(p.item(), 4)}
        for p, i in zip(top_probs, top_idxs)
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--N",        type=float, required=True)
    parser.add_argument("--P",        type=float, required=True)
    parser.add_argument("--K",        type=float, required=True)
    parser.add_argument("--temp",     type=float, required=True)
    parser.add_argument("--humidity", type=float, required=True)
    parser.add_argument("--ph",       type=float, required=True)
    parser.add_argument("--rainfall", type=float, required=True)
    parser.add_argument("--model",    default="best_recommendation_model.pth")
    args = parser.parse_args()

    device = torch.device("mps" if torch.backends.mps.is_available() else
                          "cuda" if torch.cuda.is_available() else "cpu")

    model = load_model(args.model, device)
    sensors = {"N": args.N, "P": args.P, "K": args.K,
               "temperature": args.temp, "humidity": args.humidity,
               "ph": args.ph, "rainfall": args.rainfall}
    results = predict(sensors, model, device)

    print(f"\nSensor readings: {sensors}")
    print(f"\n{'Rank':<5} {'Crop':<20} {'Confidence':>12}")
    print("-" * 40)
    for i, r in enumerate(results, 1):
        bar = "█" * int(r["confidence"] * 30)
        print(f"  {i}.  {r['crop']:<18} {r['confidence']*100:>8.2f}%  {bar}")
