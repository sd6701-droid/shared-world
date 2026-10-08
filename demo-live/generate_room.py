#!/usr/bin/env python3
"""
Generate highly-consistent clips of ONE closed room view with FastH3 and save
them to demo-live/out/ as MP4s + a contact sheet.

Seed: one tile auto-detected from the angle sheet (test-1.jpeg). By default the
largest tile (best resolution). The room is closed: no window, no door.

Consistency levers (all on):
  - starting_frame AND ending_frame pinned to the same seed image
  - fixed generation seed on the session and on every clip
  - shortest clips the model allows (~5.2 s min; we use 6 s), "nothing happens" / near-zero ambient prompts
  - prompt forbids people, openings, camera motion, new detail

Run:
  demo-live/.venv/bin/python demo-live/generate_room.py            # generate
  demo-live/.venv/bin/python demo-live/generate_room.py --inspect  # just show tiles + save seed
  demo-live/.venv/bin/python demo-live/generate_room.py --tile 1   # pick a specific tile (1-based)
"""
import argparse
import asyncio
import re
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = HERE / "out"

MODEL = "reactor/fast-h3"
FIXED_SEED = 42
CLIP_SECONDS = 6.0  # FastH3 minimum is ~5.17 s (enqueue rejects shorter: "seconds < ge(5.167)")
FPS = 24
SHEET = ROOT / "test-1.jpeg"

SCENE = ("a closed, windowless, doorless room at night with bare dark grey walls, a dark wooden floor, "
         "a single plain wooden table in the center with one small ceramic vase on it, "
         "lit only by a soft cool light from the ceiling")
CONSTRAINTS = (
    "No people, no animals, no characters appear at any point. "
    "The room is completely closed: there are no windows, no doors and no openings, and nothing enters or leaves. "
    "The camera is completely locked: it does not move, pan, tilt, zoom or cut, and shows this same single view of the room for the entire clip. "
    "The walls, floor, table and vase stay exactly as in the reference image; no new objects appear. "
    "The image is slightly soft and low-detail, matching the reference exactly; do not add new details or textures and do not sharpen. "
    "Only very subtle ambient motion. Steady, consistent, identical framing throughout."
)
INSTRUCTIONS = [
    "",                                                # still hold
    "the ceiling light flickers very slightly",
    "",                                                # still hold
    "fine dust drifts slowly in the light",
]


def load_key() -> str:
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            m = re.match(r"^\s*REACTOR_API_KEY\s*=\s*(.*?)\s*$", line)
            if m:
                return m.group(1).strip("\"'")
    sys.exit("REACTOR_API_KEY not found in .env.local")


def detect_tiles(sheet: np.ndarray):
    """Find image tiles on a flat-background contact sheet. Returns [(x, y, w, h)] in reading order."""
    H, W = sheet.shape[:2]
    bg = sheet[5, 5].astype(int)
    mask = (np.abs(sheet.astype(int) - bg).max(axis=2) > 18).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    tiles = [tuple(int(v) for v in stats[i][:4]) for i in range(1, n)
             if stats[i][2] * stats[i][3] > 0.04 * W * H and stats[i][2] > 200 and stats[i][3] > 120]
    tiles.sort(key=lambda t: (t[1] // 100, t[0]))
    return tiles


def make_seed(tile_index: int | None) -> Path:
    """Crop one tile from the sheet (default: largest) and upscale to the model canvas size."""
    OUT.mkdir(exist_ok=True)
    sheet = np.array(Image.open(SHEET).convert("RGB"))
    tiles = detect_tiles(sheet)
    if not tiles:
        sys.exit(f"no tiles detected in {SHEET}")
    for k, (x, y, w, h) in enumerate(tiles, 1):
        print(f"  tile {k}: x={x} y={y} {w}x{h}")
    if tile_index is None:
        idx = max(range(len(tiles)), key=lambda i: tiles[i][2] * tiles[i][3])
    else:
        idx = tile_index - 1
    x, y, w, h = tiles[idx]
    crop = Image.fromarray(sheet[y:y + h, x:x + w])
    # 16:9 canvas; crop is already ~16:9, LANCZOS keeps it soft rather than inventing detail
    seed = crop.resize((1344, 756), Image.LANCZOS)
    path = OUT / f"seed-tile{idx + 1}.jpg"
    seed.save(path, quality=95)
    print(f"seed: tile {idx + 1} ({w}x{h}) -> {path.name} (1344x756)")
    return path


def msg_type(msg):
    return msg.get("type") if isinstance(msg, dict) else None


def clip_id_of(msg):
    d = msg.get("data", msg) if isinstance(msg, dict) else {}
    if not isinstance(d, dict):
        return None
    return (d.get("clip") or {}).get("clip_id") or d.get("clip_id")


def write_mp4(frames, path: Path):
    h, w = frames[0].shape[:2]
    tmp = path.with_suffix(".raw.mp4")
    vw = cv2.VideoWriter(str(tmp), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (w, h))
    for f in frames:
        vw.write(cv2.cvtColor(f, cv2.COLOR_RGB2BGR))
    vw.release()
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)])
    if r.returncode == 0:
        tmp.unlink(missing_ok=True)
    else:
        tmp.rename(path)


def mad(a, b):
    """Mean absolute pixel difference (0-255) after resizing b to a."""
    b = cv2.resize(b, (a.shape[1], a.shape[0]))
    return float(np.mean(np.abs(a.astype(np.int16) - b.astype(np.int16))))


async def generate(seed_path: Path):
    from reactor_sdk import Reactor

    key = load_key()
    seed_rgb = np.array(Image.open(seed_path).convert("RGB"))

    r = Reactor(MODEL, api_key=key)
    loop = asyncio.get_running_loop()
    events: asyncio.Queue = asyncio.Queue()
    frames: list = []
    rec = {"on": False}

    @r.on_message
    def _on_msg(*args):
        msg = args[0] if len(args) == 1 else {"type": args[0], "data": args[1] if len(args) > 1 else None}
        loop.call_soon_threadsafe(events.put_nowait, msg)

    @r.track("main_video").on_frame
    def _on_frame(frame):  # RGB (H, W, 3) uint8
        if rec["on"]:
            frames.append(np.ascontiguousarray(frame))

    async def wait_for(types, pred=None, timeout=300):
        deadline = time.time() + timeout
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError(f"timed out waiting for {types}")
            msg = await asyncio.wait_for(events.get(), remaining)
            t = msg_type(msg)
            if t == "command_error":
                print("   !! command_error:", msg.get("data"))
            elif t not in ("state_update", "queue_update"):
                print("   event:", t)
            if t in types and (pred is None or pred(msg)):
                return msg

    print("connecting…")
    await r.connect()
    print("status:", r.status)

    results = []
    try:
        await r.send_command("set_canvas", {"aspect": "16:9"})
        await r.send_command("set_autoplay", {"enabled": False})
        await r.send_command("set_seed", {"seed": FIXED_SEED})
        ref = await r.upload_file(str(seed_path))
        print("seed uploaded; fixed seed", FIXED_SEED)

        for i, instr in enumerate(INSTRUCTIONS, 1):
            label = instr or "still hold"
            prompt = f"{SCENE}. {instr + '.' if instr else 'Nothing happens; the room is perfectly still.'} {CONSTRAINTS}"
            reply = await r.send_command("enqueue", {
                "prompt": prompt, "seconds": CLIP_SECONDS, "seed": FIXED_SEED,
                "starting_frame": ref, "ending_frame": ref,
            })
            cid = clip_id_of(reply or {})
            print(f"\n[{i}/{len(INSTRUCTIONS)}] enqueued {cid}  ::  {label}")
            if not cid:
                print("   reply:", reply)
                raise RuntimeError("no clip_id in enqueue reply (see command_error above)")

            await wait_for({"clip_generated"}, lambda m: clip_id_of(m) == cid)
            frames.clear(); rec["on"] = True
            await r.send_command("play", {"clip_id": cid})
            await wait_for({"clip_started"}, timeout=90)
            await wait_for({"clip_finished", "clip_stopped"}, timeout=90)
            await asyncio.sleep(0.3)
            rec["on"] = False

            # The stream emits a black frame at clip end; drop blank frames at either edge
            # so the MP4 ends on real content and the drift metric is honest.
            while frames and frames[-1].mean() < 2:
                frames.pop()
            while frames and frames[0].mean() < 2:
                frames.pop(0)
            if not frames:
                print("   !! no frames captured")
                continue
            out = OUT / f"clip-{i}-{re.sub(r'[^a-z0-9]+', '-', label)[:40].strip('-')}.mp4"
            write_mp4(frames, out)
            first, last = frames[0], frames[-1]
            Image.fromarray(first).save(OUT / f"clip-{i}-first.png")
            results.append((label, first, last))
            print(f"   saved {out.name}  ({len(frames)} frames)  "
                  f"first-vs-seed MAD={mad(seed_rgb, first):.1f}  last-vs-seed MAD={mad(seed_rgb, last):.1f}")
    finally:
        await r.disconnect()
        print("\ndisconnected (session closed)")

    if results:
        thumb = (336, 189)
        sheet = Image.new("RGB", (thumb[0] * (1 + len(results)), thumb[1] * 2), (12, 14, 18))
        for row in (0, 1):
            sheet.paste(Image.fromarray(seed_rgb).resize(thumb), (0, thumb[1] * row))
        for j, (_, first, last) in enumerate(results, 1):
            sheet.paste(Image.fromarray(first).resize(thumb), (thumb[0] * j, 0))
            sheet.paste(Image.fromarray(last).resize(thumb), (thumb[0] * j, thumb[1]))
        sheet.save(OUT / "contact-sheet.png")
        firsts = [f for _, f, _ in results]
        cross = [mad(firsts[0], f) for f in firsts[1:]]
        print(f"\ncontact sheet: {OUT / 'contact-sheet.png'}  (col 1 = seed; row 1 = first frames, row 2 = last frames)")
        print("cross-clip MAD (clip 1 vs others):", ", ".join(f"{c:.1f}" for c in cross),
              "  (0 = identical; <5 very consistent; >15 visibly different)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tile", type=int, default=None, help="1-based tile index (default: largest)")
    ap.add_argument("--inspect", action="store_true", help="detect tiles and save the seed, no generation")
    a = ap.parse_args()
    seed_path = make_seed(a.tile)
    if a.inspect:
        return
    asyncio.run(generate(seed_path))


if __name__ == "__main__":
    main()
