import sys
import argparse
from pathlib import Path

import torch
from torchvision import transforms
from PIL import Image

from models import PlantInsectCNN

# ── Class names (alphabetical order = ImageFolder order) ──────────────────────
CLASSES = [
    "Adristyrannus",
    "Aphids",
    "Beetle",
    "Bugs",
    "Cabbage Looper",
    "Cicadellidae",
    "Cutworm",
    "Earwig",
    "FieldCricket",
    "Grasshopper",
    "Mediterranean fruit fly",
    "Mites",
    "RedSpider",
    "Riptortus",
    "Slug",
    "Snail",
    "Thrips",
    "Weevil",
    "Whitefly",
]

# ── Transform (must match training transform) ─────────────────────────────────
TRANSFORM = transforms.Compose([
    transforms.Resize((128, 128)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def load_model(model_path: str | Path, device: torch.device) -> PlantInsectCNN:
    model = PlantInsectCNN(input_shape=3, hidden_units=64, output_shape=19)
    state = torch.load(model_path, map_location=device, weights_only=True)
    # checkpoint may be wrapped in {"model_state_dict": ...}
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
    """Return top-k predictions as list of {pest, confidence} dicts."""
    img = Image.open(image_path).convert("RGB")
    tensor = TRANSFORM(img).unsqueeze(0).to(device)

    with torch.inference_mode():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1).squeeze()

    top_probs, top_idxs = probs.topk(top_k)
    return [
        {"pest": CLASSES[idx.item()], "confidence": round(prob.item(), 4)}
        for prob, idx in zip(top_probs, top_idxs)
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="Path to the image file")
    parser.add_argument("--model", default="best_model.pth", help="Path to model weights")
    parser.add_argument("--top", type=int, default=3, help="Number of top predictions")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else
                          "mps"  if torch.backends.mps.is_available() else "cpu")
    print(f"Device: {device}")

    model = load_model(args.model, device)
    results = predict(args.image, model, device, top_k=args.top)

    print(f"\nImage: {args.image}")
    print(f"{'Rank':<5} {'Pest':<30} {'Confidence':>12}")
    print("-" * 50)
    for i, r in enumerate(results, 1):
        bar = "█" * int(r["confidence"] * 30)
        print(f"  {i}.  {r['pest']:<28} {r['confidence']*100:>8.2f}%  {bar}")
