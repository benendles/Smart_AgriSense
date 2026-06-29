"""
Smart AgriSense — Advisory Service ("the brain")
================================================
The synthesis layer that ties the other four models together. It does NOT train
or run any ML model of its own. Instead it:

  1. AGGREGATES the latest output of the four AI services (crop recommendation,
     plant, pest and disease detection) plus the raw sensor readings.
  2. REASONS over that bundle with Claude (claude-opus-4-8) — a pretrained model,
     so there is no dataset to label or train — to produce prioritised, locally
     appropriate farm instructions for the farmer.

The vision/sensor models answer "what is it?"; this service answers "so what
should the farmer do about it?".

It emits the EXACT shape the web dashboard already renders (AgricultureData in
smart-agrisense/lib/types.ts), at GET /agriculture/advice — the path the web app
polls — so no frontend change is needed: just point AGRICULTURE_SERVICE_URL at
this service.

Configure with environment variables (see docker-compose.yml):
  ANTHROPIC_API_KEY   required — your Claude API key (without it: HTTP 503,
                      the web app falls back to its own mock advice)
  ADVISORY_MODEL      model id (default claude-opus-4-8)
  ADVISORY_TTL        seconds before regenerating even if data is unchanged (300)
  CROP_URL / PLANT_URL / INSECT_URL / DISEASE_URL  where to read each /latest
"""
import hashlib
import json
import os
import time
from datetime import datetime
from typing import Literal

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from store import Store

# ── Config ────────────────────────────────────────────────────────────────────
PORT     = int(os.getenv("PORT", 4007))
MODEL    = os.getenv("ADVISORY_MODEL", "claude-opus-4-8")
API_KEY  = os.getenv("ANTHROPIC_API_KEY", "")
TTL      = int(os.getenv("ADVISORY_TTL", 300))  # regenerate at most this often

# Where to read each service's latest result. Defaults are the docker-compose
# service names; override per-deployment. None must be reachable for the service
# to boot — a missing source is simply reported to Claude as "no reading yet".
SOURCES = {
    "crop":    os.getenv("CROP_URL",    "http://crop-recommendation:8000/recommendation/latest"),
    "plant":   os.getenv("PLANT_URL",   "http://plant-detection:8000/plant/latest"),
    "insect":  os.getenv("INSECT_URL",  "http://insect-detection:8000/insect/latest"),
    "disease": os.getenv("DISEASE_URL", "http://disease-detection:8000/disease/latest"),
}

# ── Output contract — matches AgricultureData / FarmingInstruction in the web app
class Instruction(BaseModel):
    action:   Literal["irrigate", "fertilize", "spray_pesticide",
                    "spray_fungicide", "harvest", "monitor", "no_action"]
    urgency:  Literal["immediate", "today", "this_week", "scheduled", "none"]
    title:    str
    description: str
    reason:   str
    estimatedDuration: str

class Advisory(BaseModel):
    overallStatus: Literal["healthy", "attention_needed", "critical"]
    summary: str
    instructions: list[Instruction]
    irrigationSchedule: str
    fertilizerSchedule: str
    nextInspection: str

SYSTEM_PROMPT = (
    "You are an agronomy advisor for smallholder farmers in the humid tropics of "
    "Cameroon. You receive sensor readings and the outputs of four detection models "
    "(crop suitability, plant identification, pest detection, disease detection) and "
    "produce concise, practical farm instructions.\n\n"
    "Rules:\n"
    "- Ground every instruction in the data you were given. Do not invent readings.\n"
    "- If a model has no result yet (null), do not speculate about it.\n"
    "- Treat a detection as confident only when its confidence is high (>0.7); "
    "otherwise issue a 'monitor' instruction to confirm before acting.\n"
    "- Prefer low-cost, accessible interventions. Be specific (e.g. 'apply lime to "
    "raise pH toward 6.0'), never vague.\n"
    "- Map each instruction to the closest action and urgency. Set overallStatus to "
    "'critical' if any instruction is 'immediate', 'attention_needed' if any is "
    "'today'/'this_week', otherwise 'healthy'.\n"
    "- irrigationSchedule, fertilizerSchedule and nextInspection are short one-line "
    "strings the farmer reads directly."
)

# ── Anthropic client (lazy so the service boots without a key) ────────────────
_client = None
def client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic(api_key=API_KEY)
    return _client

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(title="AgriSense Advisory Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# cache: avoid a Claude call on every 30s dashboard poll — only regenerate when
# the underlying data changes (hash differs) or the TTL has elapsed.
_cache: dict = {"hash": None, "data": None, "at": 0.0}
store = Store("advisory")   # persists every generated advisory to /data/advisory.db


def gather() -> dict:
    """Pull each service's /latest. A 404 (no reading yet) or unreachable service
    degrades to None for that source — never fails the whole request."""
    out = {}
    for name, url in SOURCES.items():
        try:
            r = requests.get(url, timeout=5)
            out[name] = r.json() if r.status_code == 200 else None
        except Exception:
            out[name] = None
    return out


def advise(sources: dict) -> dict:
    """Ask Claude to synthesise farm instructions from the aggregated outputs,
    returning a dict in the web app's AgricultureData shape."""
    response = client().messages.parse(
        model=MODEL,
        max_tokens=2000,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": ("Here is the latest data from the farm. Generate the advisory.\n\n"
                        + json.dumps(sources, indent=2)),
        }],
        output_format=Advisory,
    )
    a = response.parsed_output
    return {
        "overallStatus": a.overallStatus,
        "summary":       a.summary,
        "instructions":  [{"id": i + 1, **inst.model_dump()}
                        for i, inst in enumerate(a.instructions)],
        "irrigationSchedule": a.irrigationSchedule,
        "fertilizerSchedule": a.fertilizerSchedule,
        "nextInspection":     a.nextInspection,
        "timestamp":     datetime.utcnow().isoformat() + "Z",
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "api_key_configured": bool(API_KEY)}


@app.get("/agriculture/advice")
def agriculture_advice(generate: bool = False):
    """Return Claude-generated farm instructions in the dashboard's AgricultureData
    shape. ON-DEMAND to protect API credits:
      - generate=false (default): return the LAST advisory, NO Claude call.
      - generate=true (the dashboard's Generate button): spend one Claude call.
    """
    if not API_KEY:
        # No key → 503 so the web app falls back to its built-in mock advice.
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    # Default path: serve the last advisory without ever calling Claude.
    if not generate:
        if _cache["data"] is not None:
            return _cache["data"]
        last = store.latest()
        if last is not None:
            return last
        raise HTTPException(status_code=404, detail="No advisory generated yet — press Generate")

    # generate=true → the user explicitly requested a fresh advisory.
    sources = gather()
    if all(v is None for v in sources.values()):
        raise HTTPException(status_code=503, detail="No model results yet")

    digest = hashlib.sha256(json.dumps(sources, sort_keys=True).encode()).hexdigest()
    try:
        data = advise(sources)
    except Exception as e:
        # On generation failure, serve the last good advisory if we have one.
        if _cache["data"] is not None:
            return _cache["data"]
        raise HTTPException(status_code=502, detail=f"Advisory generation failed: {e}")

    _cache.update(hash=digest, data=data, at=time.time())
    store.save(data)   # keep a history of generated advisories
    return data


@app.get("/agriculture/history")
def agriculture_history(limit: int = 20):
    return store.history(limit)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("service:app", host="0.0.0.0", port=PORT, reload=False)
