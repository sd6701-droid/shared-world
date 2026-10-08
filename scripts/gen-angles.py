#!/usr/bin/env python3
"""
gen-angles.py — generate N consistent views of one room from different angles.

Uses the Gemini image API (Nano Banana) with a reference image to keep the
room, furniture, props and lighting consistent while only the camera angle
changes. This is a standalone helper for building seed-image reference sheets;
it does not touch the game server or its rules.

Env (read from process env, falling back to .env.local in the repo root):
  GEMINI_API_KEY      required
  GEMINI_IMAGE_MODEL  required, e.g. "gemini-2.5-flash-image"

Usage:
  python scripts/gen-angles.py --ref test-1.jpeg --out public/rooms/angles --count 10
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env_local() -> None:
    """Load KEY=VALUE lines from .env.local without extra deps."""
    env_path = REPO_ROOT / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        # Don't clobber a value already present in the real environment.
        os.environ.setdefault(key, value)


# Ten distinct camera framings. The reference image pins everything else;
# only the vantage point changes, so the room stays the same room.
ANGLES = [
    "wide establishing shot from the doorway, looking straight across the room at the table",
    "low angle near the floor looking up toward the table and the object on it",
    "high angle looking down over the table as if from the far upper corner",
    "from the left-hand wall looking across the room toward the opposite corner",
    "from the right-hand wall looking across the room toward the opposite corner",
    "close three-quarter view of the table and the object, room visible behind",
    "from the far back corner looking back toward the entrance wall",
    "tight view down one side wall showing the floor receding into shadow",
    "eye-level centered view facing the table head-on, symmetrical composition",
    "over-the-shoulder style vantage from just behind and above the table",
]

STYLE = (
    "Keep the exact same room, same walls, same wooden floor, same single table, "
    "same object on the table, and the same dim moody tungsten lighting as the "
    "reference image. Photorealistic, museum interior, night, 16:9, no people, "
    "no text, no labels, no borders. Only the camera angle changes."
)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ref", default="test-1.jpeg", help="reference image path")
    ap.add_argument("--out", default="public/rooms/angles", help="output directory")
    ap.add_argument("--count", type=int, default=10, help="number of images (max 10)")
    ap.add_argument("--prefix", default="angle", help="output filename prefix")
    args = ap.parse_args()

    load_env_local()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = os.environ.get("GEMINI_IMAGE_MODEL", "").strip()
    if not api_key:
        print("ERROR: GEMINI_API_KEY is not set (env or .env.local).", file=sys.stderr)
        return 2
    if not model:
        print("ERROR: GEMINI_IMAGE_MODEL is not set, e.g. gemini-2.5-flash-image.",
              file=sys.stderr)
        return 2

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("ERROR: google-genai not installed. Run:\n"
              "  demo-live/.venv/bin/python -m pip install google-genai pillow",
              file=sys.stderr)
        return 2

    ref_path = (REPO_ROOT / args.ref) if not os.path.isabs(args.ref) else Path(args.ref)
    if not ref_path.exists():
        print(f"ERROR: reference image not found: {ref_path}", file=sys.stderr)
        return 2
    ref_bytes = ref_path.read_bytes()
    ref_mime = "image/jpeg" if ref_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"

    out_dir = (REPO_ROOT / args.out) if not os.path.isabs(args.out) else Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    client = genai.Client(api_key=api_key)
    count = max(1, min(args.count, len(ANGLES)))
    print(f"Model: {model}\nReference: {ref_path}\nOutput: {out_dir}\nCount: {count}\n")

    ok = 0
    for i in range(count):
        angle = ANGLES[i]
        prompt = (
            f"This is a reference photo of a room. Re-render the SAME room from a "
            f"new camera angle: {angle}. {STYLE}"
        )
        contents = [
            types.Part.from_bytes(data=ref_bytes, mime_type=ref_mime),
            prompt,
        ]
        out_file = out_dir / f"{args.prefix}-{i + 1:02d}.png"
        try:
            resp = client.models.generate_content(model=model, contents=contents)
            saved = _save_first_image(resp, out_file)
            if saved:
                ok += 1
                print(f"[{i + 1:2d}/{count}] {out_file.name}  <- {angle[:50]}")
            else:
                txt = _first_text(resp)
                print(f"[{i + 1:2d}/{count}] NO IMAGE returned. "
                      f"Model said: {txt[:160]!r}", file=sys.stderr)
        except Exception as e:  # keep going; one bad call shouldn't stop the batch
            print(f"[{i + 1:2d}/{count}] ERROR: {e}", file=sys.stderr)
        time.sleep(1)  # be gentle on rate limits

    print(f"\nDone: {ok}/{count} images written to {out_dir}")
    return 0 if ok else 1


def _save_first_image(resp, out_file: Path) -> bool:
    for cand in getattr(resp, "candidates", None) or []:
        content = getattr(cand, "content", None)
        for part in getattr(content, "parts", None) or []:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                out_file.write_bytes(inline.data)
                return True
    return False


def _first_text(resp) -> str:
    for cand in getattr(resp, "candidates", None) or []:
        content = getattr(cand, "content", None)
        for part in getattr(content, "parts", None) or []:
            if getattr(part, "text", None):
                return part.text
    return "(no text)"


if __name__ == "__main__":
    raise SystemExit(main())
