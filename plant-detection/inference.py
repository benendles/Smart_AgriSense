import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from torch import nn
from torchvision import transforms

BASE = Path(__file__).parent

with open(BASE / "plant_classes.json") as f:
    CLASSES = json.load(f)

NUM_CLASSES = len(CLASSES)

TRANSFORM = transforms.Compose([
    transforms.Resize((128, 128)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


class PlantInsectCNN(nn.Module):
    def __init__(self, input_shape, hidden_units, output_shape):
        super().__init__()
        self.conv_block_1 = nn.Sequential(
            nn.Conv2d(input_shape, hidden_units, 3, padding=1),
            nn.BatchNorm2d(hidden_units), nn.ReLU(inplace=True),
            nn.Conv2d(hidden_units, hidden_units, 3, padding=1),
            nn.BatchNorm2d(hidden_units), nn.ReLU(inplace=True),
            nn.MaxPool2d(2))
        self.conv_block_2 = nn.Sequential(
            nn.Conv2d(hidden_units, hidden_units*2, 3, padding=1),
            nn.BatchNorm2d(hidden_units*2), nn.ReLU(inplace=True),
            nn.Conv2d(hidden_units*2, hidden_units*2, 3, padding=1),
            nn.BatchNorm2d(hidden_units*2), nn.ReLU(inplace=True),
            nn.MaxPool2d(2))
        self.conv_block_3 = nn.Sequential(
            nn.Conv2d(hidden_units*2, hidden_units*4, 3, padding=1),
            nn.BatchNorm2d(hidden_units*4), nn.ReLU(inplace=True),
            nn.Conv2d(hidden_units*4, hidden_units*4, 3, padding=1),
            nn.BatchNorm2d(hidden_units*4), nn.ReLU(inplace=True),
            nn.MaxPool2d(2))
        self.classifier = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)), nn.Flatten(),
            nn.Dropout(0.5), nn.Linear(hidden_units*4, output_shape))

    def forward(self, x):
        return self.classifier(self.conv_block_3(self.conv_block_2(self.conv_block_1(x))))


def load_model(model_path: str | Path, device: torch.device) -> PlantInsectCNN:
    model = PlantInsectCNN(3, 64, NUM_CLASSES)
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    return model


def predict(image_path: str | Path, model: PlantInsectCNN,
            device: torch.device, top_k: int = 3) -> list[dict]:
    img = Image.open(image_path).convert("RGB")
    tensor = TRANSFORM(img).unsqueeze(0).to(device)
    with torch.inference_mode():
        probs = torch.softmax(model(tensor), dim=1).squeeze()
    top_probs, top_idxs = probs.topk(top_k)
    return [
        {"plant": CLASSES[i.item()], "confidence": round(p.item(), 4)}
        for p, i in zip(top_probs, top_idxs)
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("--model", default="best_plant_model.pth")
    parser.add_argument("--top", type=int, default=3)
    args = parser.parse_args()

    device = torch.device("mps"  if torch.backends.mps.is_available() else
                          "cuda" if torch.cuda.is_available() else "cpu")
    model   = load_model(args.model, device)
    results = predict(args.image, model, device, top_k=args.top)

    print(f"\nImage: {args.image}")
    print(f"{'Rank':<5} {'Plant':<20} {'Confidence':>12}")
    print("-" * 40)
    for i, r in enumerate(results, 1):
        bar = "█" * int(r["confidence"] * 30)
        print(f"  {i}.  {r['plant']:<18} {r['confidence']*100:>8.2f}%  {bar}")
