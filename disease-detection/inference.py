import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from torchvision import transforms

from models import PlantInsectCNN

CLASS_PATH = Path(__file__).parent / "disease_classes.json"
with open(CLASS_PATH) as f:
    CLASSES = json.load(f)

NUM_CLASSES = len(CLASSES)  # 38

TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def load_model(model_path: str | Path, device: torch.device) -> PlantInsectCNN:
    model = PlantInsectCNN(input_shape=3, hidden_units=64, output_shape=NUM_CLASSES)
    state = torch.load(model_path, map_location=device, weights_only=True)
    if isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model


def predict(image_path: str | Path,
            model: PlantInsectCNN,
            device: torch.device,
            top_k: int = 3) -> list[dict]:
    img = Image.open(image_path).convert("RGB")
    tensor = TRANSFORM(img).unsqueeze(0).to(device)
    with torch.inference_mode():
        probs = torch.softmax(model(tensor), dim=1).squeeze()
    top_probs, top_idxs = probs.topk(top_k)
    return [
        {"disease": CLASSES[i.item()], "confidence": round(p.item(), 4)}
        for p, i in zip(top_probs, top_idxs)
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="Path to leaf image")
    parser.add_argument("--model", default="best_disease_model.pth")
    parser.add_argument("--top", type=int, default=3)
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else
                          "mps"  if torch.backends.mps.is_available() else "cpu")
    print(f"Device: {device}")

    model = load_model(args.model, device)
    results = predict(args.image, model, device, top_k=args.top)

    print(f"\nImage: {args.image}")
    print(f"{'Rank':<5} {'Disease':<50} {'Confidence':>12}")
    print("-" * 70)
    for i, r in enumerate(results, 1):
        bar = "█" * int(r["confidence"] * 30)
        print(f"  {i}.  {r['disease']:<48} {r['confidence']*100:>8.2f}%  {bar}")
