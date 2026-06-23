#!/usr/bin/env python3
"""
Raspberry Pi Relay Simulator — Smart AgriSense
Mimics the edge device: uploads camera images to the vision services and pushes
sensor readings to the crop-recommendation service, then reads the /latest
endpoints the web dashboard polls. Use this to demo/test the cloud stack with
NO physical Pi attached.
"""
import io, sys, json, time
import requests
from PIL import Image, ImageDraw

CLOUD = sys.argv[1] if len(sys.argv) > 1 else "http://localhost"
SVC = {
    "plant":   (f"{CLOUD}:4003", "/plant/analyze",   "/plant/latest"),
    "insect":  (f"{CLOUD}:4004", "/insect/analyze",  "/insect/latest"),
    "disease": (f"{CLOUD}:4005", "/disease/analyze", "/disease/latest"),
}
CROP = (f"{CLOUD}:4006", "/recommendation/predict", "/recommendation/latest")

def demo_leaf_jpeg(tone=(70,140,60)) -> bytes:
    """Synthesise a leaf-like image — stand-in for a Pi camera frame."""
    img = Image.new("RGB", (256, 256), (235, 240, 230))
    d = ImageDraw.Draw(img)
    d.ellipse([40, 30, 216, 226], fill=tone)
    d.line([128, 40, 128, 215], fill=(40, 90, 40), width=4)
    for y in range(60, 210, 22):
        d.line([128, y, 70, y+18], fill=(40, 90, 40), width=2)
        d.line([128, y, 186, y+18], fill=(40, 90, 40), width=2)
    buf = io.BytesIO(); img.save(buf, format="JPEG"); return buf.getvalue()

def hr(t): print(f"\n{'='*64}\n{t}\n{'='*64}")

ok = True
hr("STEP 1 — Pi camera capture -> upload to vision services")
for name, (base, analyze, latest) in SVC.items():
    try:
        files = {"image": (f"{name}.jpg", demo_leaf_jpeg(), "image/jpeg")}
        r = requests.post(base + analyze, files=files, timeout=60); r.raise_for_status()
        d = r.json()
        key = {"plant":"plant","insect":"pest","disease":"disease"}[name]
        conf = d.get("confidence")
        print(f"[{name:7}] POST {analyze:18} -> {d.get(key)!r:32} conf={conf}")
    except Exception as e:
        ok = False; print(f"[{name:7}] FAILED: {e}")

hr("STEP 2 — Pi sensor relay -> crop recommendation")
base, predict, latest = CROP
demo_sensors = {"N":90,"P":42,"K":43,"temperature":27.2,"humidity":73.5,"ph":6.3,"rainfall":120.0}
try:
    r = requests.post(base + predict, json=demo_sensors, timeout=30); r.raise_for_status()
    d = r.json()
    print(f"sensors={demo_sensors}")
    print(f"-> recommendedCrop={d['recommendedCrop']!r} conf={d['confidence']}  top={[(c['crop'],c['confidence']) for c in d['topCrops']]}")
except Exception as e:
    ok = False; print(f"FAILED: {e}")

hr("STEP 3 — Web dashboard read-back (/latest endpoints)")
for name, (base, analyze, latest) in {**SVC, "crop": CROP}.items():
    try:
        r = requests.get(base + latest, timeout=10); r.raise_for_status()
        print(f"[{name:7}] GET {latest:24} -> 200 OK ({len(r.text)} bytes)")
    except Exception as e:
        ok = False; print(f"[{name:7}] FAILED: {e}")

hr("RESULT")
print("ALL SYSTEMS OPERATIONAL ✅" if ok else "SOME CHECKS FAILED ❌")
sys.exit(0 if ok else 1)
