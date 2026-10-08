#!/usr/bin/env python3
"""
gen-dock.py: generate several consistent views of the Loading Dock.

Step 1 (base): one dock image, drawn in the same rendered style as the
corridor images (corridor/corridor_1.jpg is the style reference), so the dock
reads as part of the same building and suits the world model.
Step 2 (angles): the base re-rendered from new camera angles, with the base as
the reference, so every view is the same dock and only the camera moves.

Writes dock/dock_1.jpg (the base) .. dock/dock_N.jpg, 1280x720 JPEG like corridor/.
Skips files that already exist unless --force.

Env (process env, falling back to .env.local in the repo root):
  GEMINI_API_KEY      required
  GEMINI_IMAGE_MODEL  required, e.g. "gemini-2.5-flash-image" (never hard-coded)

Usage:
  demo-live/.venv/bin/python scripts/gen-dock.py                 # 5 images
  demo-live/.venv/bin/python scripts/gen-dock.py --count 8
  demo-live/.venv/bin/python scripts/gen-dock.py --base public/rooms/dock.png   # use an existing image as the base
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCENE = (
    "the museum's loading dock at night: an indoor concrete loading bay with a "
    "raised dock platform along one side, a large closed metal roll-up door, a few "
    "wooden shipping crates and a pallet jack, yellow safety bollards, a red exit "
    "door with a small lit EXIT sign above it, pipes along the ceiling"
)
STYLE = (
    "Same rendered look as the reference corridor image: plain dark grey walls, a dark "
    "wooden or dark concrete floor with small tan floor markers, square white ceiling "
    "light panels, cool even light, simple clean 3D render. First-person eye-level view, "
    "16:9, no people, no text, no logos, no borders. Every door stays closed."
)
ANGLES = [
    "wide view from the corridor door, looking straight into the dock toward the roll-up door",
    "from beside the crates, looking across the dock toward the raised platform",
    "facing the red exit door head-on, crates at the edge of the frame",
    "from the raised platform looking back toward the corridor door",
    "low angle near the floor down the length of the dock, bollards in the foreground",
    "from the far corner looking diagonally across the whole dock",
    "close view of the stacked crates and pallet jack, the roll-up door behind",
    "high corner view looking down over the whole dock, like a security camera",
    "tight view along the side wall, the floor markers receding toward the exit door",
]


def load_env_local() -> None:
    env = ROOT / ".env.local"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def mime(path: Path) -> str:
    return "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"


def image_bytes(resp) -> bytes | None:
    for cand in getattr(resp, "candidates", None) or []:
        for part in getattr(getattr(cand, "content", None), "parts", None) or []:
            data = getattr(getattr(part, "inline_data", None), "data", None)
            if data:
                return data
    return None


def model_text(resp) -> str:
    for cand in getattr(resp, "candidates", None) or []:
        for part in getattr(getattr(cand, "content", None), "parts", None) or []:
            if getattr(part, "text", None):
                return part.text
    return ""


def save_jpeg(data: bytes, out: Path) -> None:
    """Center-crop to 16:9 and save 1280x720, matching corridor/."""
    from PIL import Image
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    if w / h > 16 / 9:
        nw = round(h * 16 / 9)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w * 9 / 16)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    img.resize((1280, 720), Image.LANCZOS).save(out, "JPEG", quality=92)


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate consistent Loading Dock views.")
    ap.add_argument("--count", type=int, default=5, help=f"total images incl. the base (max {len(ANGLES) + 1})")
    ap.add_argument("--out", default="dock", help="output folder (repo-relative)")
    ap.add_argument("--style-ref", default="corridor/corridor_1.jpg", help="style reference for the base")
    ap.add_argument("--base", default=None, help="use this image as the base instead of generating one")
    ap.add_argument("--force", action="store_true", help="overwrite existing images")
    args = ap.parse_args()

    load_env_local()
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = os.environ.get("GEMINI_IMAGE_MODEL", "").strip()
    if not key:
        print("ERROR: GEMINI_API_KEY is not set (add it to .env.local).", file=sys.stderr)
        return 2
    if not model:
        print("ERROR: GEMINI_IMAGE_MODEL is not set (add it to .env.local).", file=sys.stderr)
        return 2
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("ERROR: run: demo-live/.venv/bin/python -m pip install google-genai pillow", file=sys.stderr)
        return 2

    client = genai.Client(api_key=key)
    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    count = max(1, min(args.count, len(ANGLES) + 1))
    print(f"Model: {model}\nOutput: {out_dir}\nCount: {count}\n")

    def generate(ref: Path, prompt: str, out: Path) -> bool:
        part = types.Part.from_bytes(data=ref.read_bytes(), mime_type=mime(ref))
        for attempt in (1, 2):
            try:
                resp = client.models.generate_content(model=model, contents=[part, prompt])
                data = image_bytes(resp)
                if data:
                    save_jpeg(data, out)
                    return True
                print(f"  no image returned (try {attempt}): {model_text(resp)[:160]!r}", file=sys.stderr)
            except Exception as e:  # one bad call shouldn't stop the batch
                print(f"  error (try {attempt}): {e}", file=sys.stderr)
            time.sleep(2)
        return False

    # step 1: the base
    base = out_dir / "dock_1.jpg"
    if args.base:
        src = ROOT / args.base if not os.path.isabs(args.base) else Path(args.base)
        if not src.exists():
            print(f"ERROR: base image not found: {src}", file=sys.stderr)
            return 2
        if args.force or not base.exists():
            from PIL import Image
            buf = io.BytesIO(); Image.open(src).convert("RGB").save(buf, "PNG")
            save_jpeg(buf.getvalue(), base)
        print(f"[1/{count}] dock_1.jpg  <- base from {args.base}")
    elif base.exists() and not args.force:
        print(f"[1/{count}] dock_1.jpg  exists, kept (use --force to redo)")
    else:
        style_ref = ROOT / args.style_ref
        if not style_ref.exists():
            print(f"ERROR: style reference not found: {style_ref}", file=sys.stderr)
            return 2
        prompt = (f"The reference image shows a corridor of this museum. Draw a different "
                  f"room of the same building: {SCENE}. {STYLE}")
        if not generate(style_ref, prompt, base):
            print("ERROR: could not generate the base image; nothing else can be made.", file=sys.stderr)
            return 1
        print(f"[1/{count}] dock_1.jpg  <- base")

    # step 2: the same dock from other angles
    ok = 1
    for i in range(1, count):
        out = out_dir / f"dock_{i + 1}.jpg"
        angle = ANGLES[i - 1]
        if out.exists() and not args.force:
            print(f"[{i + 1}/{count}] {out.name}  exists, kept"); ok += 1; continue
        prompt = (f"This is a reference image of a loading dock. Re-render the SAME dock from a new "
                  f"camera angle: {angle}. Keep the exact same walls, floor, crates, platform, "
                  f"roll-up door, exit door, bollards and lighting. {STYLE} Only the camera changes.")
        if generate(base, prompt, out):
            ok += 1
            print(f"[{i + 1}/{count}] {out.name}  <- {angle[:60]}")
        else:
            print(f"[{i + 1}/{count}] {out.name}  FAILED", file=sys.stderr)
        time.sleep(1)  # gentle on rate limits

    print(f"\nDone: {ok}/{count} images in {out_dir}")
    return 0 if ok == count else 1


if __name__ == "__main__":
    sys.exit(main())
