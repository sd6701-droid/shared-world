"""sdxl_runner.py — wraps SDXL-Turbo image-to-image as the Option A renderer.

The job: take a CRUDE three.js frame (from the shared STBoard) + a prompt and
"re-skin" it into a nicer frame WITHOUT inventing new layout. Structure — and
therefore multi-agent consistency — is pinned by the input image; the model is
only a skin. Low `strength` keeps the layout; SDXL-Turbo at 1-2 steps makes it
near-real-time on one A100.

Runs fully offline (set HF_HUB_OFFLINE=1 on the air-gapped GPU node). If torch /
CUDA / diffusers aren't available (e.g. local Mac dev), it falls back to a STUB
that returns the input image unchanged, so the web <-> service integration can
be built and tested without a GPU.
"""
import base64
import io
import os
import threading

from PIL import Image

MODEL_ID = os.environ.get("SDXL_TURBO_ID", "stabilityai/sdxl-turbo")
_pipe = None
_backend = None  # "cuda" | "mps" | "cpu" | "stub"
# One GPU + one pipeline: serialize so the two agents' requests queue instead
# of racing the (non-thread-safe) diffusers pipeline.
_lock = threading.Lock()


def _device():
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
        return "cpu"
    except Exception:
        return None


def _load():
    """Lazy-load the pipeline. On any failure, mark backend 'stub' and return None."""
    global _pipe, _backend
    if _pipe is not None or _backend == "stub":
        return _pipe
    with _lock:
        if _pipe is not None or _backend == "stub":  # double-checked under lock
            return _pipe
        return _load_locked()


def _load_locked():
    global _pipe, _backend
    dev = _device()
    if dev is None:
        _backend = "stub"
        return None
    try:
        import torch
        from diffusers import AutoPipelineForImage2Image

        dtype = torch.float16 if dev == "cuda" else torch.float32
        pipe = AutoPipelineForImage2Image.from_pretrained(MODEL_ID, torch_dtype=dtype)
        pipe = pipe.to(dev)
        pipe.set_progress_bar_config(disable=True)
        try:
            pipe.enable_attention_slicing()
        except Exception:
            pass
        _pipe = pipe
        _backend = dev
        return _pipe
    except Exception as e:  # missing weights / OOM / no diffusers -> stub
        print(f"[sdxl_runner] falling back to STUB (no neural render): {e}")
        _backend = "stub"
        return None


def backend():
    if _backend is None:
        _load()
    return _backend


def warmup():
    """Optionally load the model at startup so the first request isn't slow."""
    _load()
    return backend()


def reskin(image_b64: str, prompt: str, strength: float = 0.5, steps: int = 2, seed: int = 0) -> str:
    """Re-skin one crude frame. Returns base64 (no data: prefix) of a JPEG.

    In stub mode, returns the input bytes unchanged (re-encoded JPEG) so the
    client still sees the crude frame and the whole loop is exercised.
    """
    raw = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    # SDXL-Turbo works best near 512; keep square to avoid layout drift.
    img = img.resize((512, 512))

    pipe = _load()
    if pipe is None:
        return _encode(img)

    import torch

    gen = torch.manual_seed(seed)  # fixed per-agent seed reduces flicker
    # SDXL-Turbo: guidance_scale must be 0.0, and steps*strength must be >= 1.
    eff_steps = max(2, int(steps))
    with _lock:  # one GPU -> serialize the two agents' inferences
        out = pipe(
            prompt=prompt or "photorealistic, detailed, natural lighting",
            image=img,
            num_inference_steps=eff_steps,
            strength=float(strength),
            guidance_scale=0.0,
            generator=gen,
        ).images[0]
    return _encode(out)


def _encode(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()
