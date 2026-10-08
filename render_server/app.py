"""app.py — FastAPI service for Option A (SDXL-Turbo live re-skin).

POST /render  {scene_id, agent_id, pose, prompt, image_b64, strength, steps}
           -> {agent_id, frame_png_b64}

The browser (Option C) renders each agent's crude frame from the shared STBoard,
posts it here, and overlays the returned re-skinned frame. Same STBoard feeds
both agents, so both re-skins are structurally matched -> consistency holds.

Run (GPU node, offline):
    export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
    uvicorn app:app --host 0.0.0.0 --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import sdxl_runner

app = FastAPI(title="Shared World — Option A render service")

# The browser calls this from a different origin (the static web server), so
# allow cross-origin. Fine for a local/tunnelled demo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RenderReq(BaseModel):
    scene_id: str = "street"
    agent_id: int = 0
    pose: dict | None = None
    prompt: str = ""
    image_b64: str
    strength: float = 0.5
    steps: int = 2


@app.get("/health")
def health():
    return {"ok": True, "backend": sdxl_runner.backend()}


@app.on_event("startup")
def _startup():
    # Load the model once so the first /render isn't cold. Safe in stub mode.
    print(f"[app] backend = {sdxl_runner.warmup()}")


@app.post("/render")
def render(req: RenderReq):
    out = sdxl_runner.reskin(
        req.image_b64,
        req.prompt,
        strength=req.strength,
        steps=req.steps,
        seed=req.agent_id,  # stable per-agent seed -> less flicker
    )
    return {"agent_id": req.agent_id, "frame_png_b64": out}
