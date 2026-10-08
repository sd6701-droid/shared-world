#!/usr/bin/env python3
"""
FastH3 transitions across a set of room views: clip N starts pinned on image N
and ends pinned on image N+1, so the camera travels between real views and every
clip is anchored to the user's images at both ends.

Saves to demo-live/out/transitions/:
  t01-02.mp4 ... t49-50.mp4   one clip per transition
  walkthrough.mp4             all clips stitched in order
  report.txt                  per-clip drift: first frame vs image N, last frame vs image N+1

Run:  demo-live/.venv/bin/python demo-live/generate_transitions.py <images_dir> [--first 1 --last 50]
"""
import argparse
import asyncio
import glob
import os
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
OUT = HERE / "out" / "transitions"

MODEL = "reactor/fast-h3"
FIXED_SEED = 42
CLIP_SECONDS = 6.0          # FastH3 minimum is ~5.17 s
AHEAD = 3                   # clips building ahead of the one playing
SESSION_CAP_S = 45 * 60     # hard cap on billed session time
FPS = 24

PROMPT = (
    "A closed, windowless room with plain grey walls, a dark wooden plank floor, a rectangular "
    "light panel in the ceiling, and a single wooden table in the center with one small white vase on it. "
    "The camera moves smoothly and slowly from the first view to the final view, keeping the table in view. "
    "The camera keeps the same height and the same distance from the table the whole time; it only orbits "
    "around the table. No zooming in, no close-ups, no tilting down toward the table. "
    "No people, no animals, no windows, no doors, no new objects. The room, table, vase and lighting stay "
    "exactly the same as in the reference images. Steady, realistic, no cuts."
)


def load_key() -> str:
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            m = re.match(r"^\s*REACTOR_API_KEY\s*=\s*(.*?)\s*$", line)
            if m:
                return m.group(1).strip("\"'")
    sys.exit("REACTOR_API_KEY not found in .env.local")


def mad(a, b):
    b = cv2.resize(b, (a.shape[1], a.shape[0]))
    return float(np.mean(np.abs(a.astype(np.int16) - b.astype(np.int16))))


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
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-c:v", "libx264",
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)])
    if r.returncode == 0:
        tmp.unlink(missing_ok=True)
    else:
        tmp.rename(path)


async def run(images, first, last, only=None, seed=FIXED_SEED):
    from reactor_sdk import Reactor

    OUT.mkdir(parents=True, exist_ok=True)
    pairs = only or [(i, i + 1) for i in range(first, last)]  # 1-based image numbers
    first, last = min(a for a, _ in pairs), max(b for _, b in pairs)
    print(f"{len(images)} images, {len(pairs)} transitions, {CLIP_SECONDS:.0f}s each")

    r = Reactor(MODEL, api_key=load_key())
    loop = asyncio.get_running_loop()
    events: asyncio.Queue = asyncio.Queue()
    rec = {"on": False, "frames": []}
    generated = set()

    @r.on_message
    def _on_msg(*args):
        msg = args[0] if len(args) == 1 else {"type": args[0], "data": args[1] if len(args) > 1 else None}
        loop.call_soon_threadsafe(events.put_nowait, msg)

    @r.track("main_video").on_frame
    def _on_frame(frame):
        if rec["on"]:
            rec["frames"].append(np.ascontiguousarray(frame))

    t_start = time.time()

    async def wait_for(types, pred=None, timeout=240):
        deadline = time.time() + timeout
        while True:
            if time.time() - t_start > SESSION_CAP_S:
                raise TimeoutError("session cap reached")
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError(f"timed out waiting for {types}")
            msg = await asyncio.wait_for(events.get(), remaining)
            t = msg.get("type") if isinstance(msg, dict) else None
            if t == "clip_generated":
                generated.add(clip_id_of(msg))
            elif t == "command_error":
                print("   !! command_error:", msg.get("data"))
            elif t == "clip_failed":
                print("   !! clip_failed:", msg.get("data"))
            if t in types and (pred is None or pred(msg)):
                return msg

    print("connecting…")
    await r.connect()
    print("status:", r.status)
    report = []
    clip_ids = {}
    try:
        await r.send_command("set_canvas", {"aspect": "16:9"})
        await r.send_command("set_autoplay", {"enabled": False})
        await r.send_command("set_seed", {"seed": seed})

        refs = {}
        for n in range(first, last + 1):
            refs[n] = await r.upload_file(images[n - 1])
        print(f"uploaded {len(refs)} images")

        async def enqueue(k):
            a, b = pairs[k]
            reply = await r.send_command("enqueue", {
                "prompt": PROMPT, "seconds": CLIP_SECONDS, "seed": seed,
                "starting_frame": refs[a], "ending_frame": refs[b],
            })
            cid = clip_id_of(reply or {})
            if not cid:
                raise RuntimeError(f"enqueue {a}->{b} returned no clip id: {reply}")
            clip_ids[k] = cid

        for k in range(min(AHEAD, len(pairs))):
            await enqueue(k)

        for k, (a, b) in enumerate(pairs):
            if k + AHEAD < len(pairs):
                await enqueue(k + AHEAD)
            cid = clip_ids[k]
            if cid not in generated:
                await wait_for({"clip_generated"}, lambda m: clip_id_of(m) == cid)
            rec["frames"] = []
            rec["on"] = True
            await r.send_command("play", {"clip_id": cid})
            await wait_for({"clip_started"}, timeout=90)
            await wait_for({"clip_finished", "clip_stopped"}, timeout=90)
            await asyncio.sleep(0.3)
            rec["on"] = False

            fr = rec["frames"]
            while fr and fr[-1].mean() < 2:
                fr.pop()
            while fr and fr[0].mean() < 2:
                fr.pop(0)
            if not fr:
                print(f"[{k + 1:2d}/{len(pairs)}] {a:02d}->{b:02d}  !! no frames")
                report.append(f"{a:02d}->{b:02d}  no frames")
                continue
            path = OUT / f"t{a:02d}-{b:02d}.mp4"
            write_mp4(fr, path)
            ia = np.array(Image.open(images[a - 1]).convert("RGB"))
            ib = np.array(Image.open(images[b - 1]).convert("RGB"))
            m1, m2 = mad(ia, fr[0]), mad(ib, fr[-1])
            line = f"{a:02d}->{b:02d}  frames={len(fr):3d}  start-vs-img{a:02d}={m1:5.1f}  end-vs-img{b:02d}={m2:5.1f}"
            print(f"[{k + 1:2d}/{len(pairs)}] {line}   (session {time.time() - t_start:5.0f}s)")
            report.append(line)
    finally:
        await r.disconnect()
        print(f"disconnected (session closed after {time.time() - t_start:.0f}s)")
        (OUT / "report.txt").write_text(
            "transition  frames  drift (0 = identical, <5 visually same, >15 visibly different)\n" + "\n".join(report) + "\n")

    clips = sorted(OUT.glob("t??-??.mp4"))
    if clips:
        lst = OUT / "list.txt"
        lst.write_text("".join(f"file '{c.name}'\n" for c in clips))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                        "-i", str(lst), "-c", "copy", str(OUT / "walkthrough.mp4")])
        lst.unlink(missing_ok=True)
        print(f"walkthrough: {OUT / 'walkthrough.mp4'}  ({len(clips)} clips)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images_dir")
    ap.add_argument("--first", type=int, default=1)
    ap.add_argument("--last", type=int, default=None)
    ap.add_argument("--only", default=None, help='retry specific transitions, e.g. "4-5,10-11"')
    ap.add_argument("--seed", type=int, default=FIXED_SEED)
    a = ap.parse_args()
    images = sorted(glob.glob(os.path.join(a.images_dir, "angle_*.jpg")))
    if len(images) < 2:
        sys.exit(f"need at least 2 angle_*.jpg images in {a.images_dir}")
    last = a.last or len(images)
    only = [tuple(int(x) for x in p.split("-")) for p in a.only.split(",")] if a.only else None
    asyncio.run(run(images, a.first, last, only, a.seed))


if __name__ == "__main__":
    main()
