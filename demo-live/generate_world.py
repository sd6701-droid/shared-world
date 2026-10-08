#!/usr/bin/env python3
"""
Seed LingBot-World-2 (the navigable world model) with the closed-room image and
record a scripted first-person run:  idle -> walk forward -> look right -> idle.

Saves to demo-live/out/world/:
  world-run.mp4            the generated first-person view (downscaled 2x)
  world-strip.png          seed | frames sampled through the run
  world-timeline.txt       when each control was sent and when chunks completed

Commands are the documented lingbot-world-2 schema ones:
  set_image, set_prompt, start, set_move_longitudinal, set_look_horizontal,
  set_rotation_speed_deg.  Inputs persist until changed and take effect at the
  next chunk boundary (chunk_complete), so expect a little control latency.

Run:  demo-live/.venv/bin/python demo-live/generate_world.py [--seed path] [--lens plain|goggles|cameras]
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
OUT = HERE / "out" / "world"
MODEL = "reactor/lingbot-world-2"
DEFAULT_SEED = ROOT / "public" / "rooms" / "closed-room" / "seed.png"

# One entry per world-model "agent": what the place is, and how long to walk forward.
SCENES = {
    "room": {
        "prompt": ("a closed, windowless, doorless room at night with bare dark grey walls, a dark wooden floor, "
                   "a single plain wooden table in the center with one small ceramic vase on it, "
                   "lit only by a soft cool light from the ceiling, no people"),
        "walk_s": 2.0,
    },
    "corridor": {
        "prompt": ("a long, narrow indoor corridor with plain dark grey walls, closed dark doors set into both walls, "
                   "a row of square light panels along the ceiling, and a dark wooden floor with small tan markers, "
                   "no windows, no people, the doors stay closed"),
        "walk_s": 4.0,
    },
}
SCENE = SCENES["room"]["prompt"]
LENSES = {
    "plain":   "first person, eye-level camera, photorealistic, steady, slightly soft and low-detail, no new objects",
    "goggles": "night-vision goggles view, monochrome green, bright center, dark vignette edges, slight grain, first person",
    "cameras": "security camera footage, black and white, grainy, high corner angle, slight fisheye, timestamp overlay style, first person",
}

# (seconds after generation_started, command, payload, label)
# Simple run: hold, one small step forward, hold. No turning (turning reveals
# walls the seed never showed, which is where the model invents content).
def make_timeline(walk_s: float):
    return [
        (0.0, None, None, "idle (hold)"),
        (3.0, "set_move_longitudinal", {"move_longitudinal": "forward"}, "walk forward"),
        (3.0 + walk_s, "set_move_longitudinal", {"move_longitudinal": "idle"}, "stop"),
        (6.0 + walk_s, None, None, "end"),
    ]


TIMELINE = make_timeline(SCENES["room"]["walk_s"])
HARD_TIMEOUT_S = 90  # never let a billed session run away


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


async def run(seed_path: Path, lens: str, tag: str | None = None):
    from reactor_sdk import Reactor

    global OUT
    if tag:
        OUT = HERE / "out" / "world" / tag
    OUT.mkdir(parents=True, exist_ok=True)
    key = load_key()
    seed_rgb = np.array(Image.open(seed_path).convert("RGB"))
    print(f"seed: {seed_path}  lens: {lens}")

    r = Reactor(MODEL, api_key=key)
    loop = asyncio.get_running_loop()
    events: asyncio.Queue = asyncio.Queue()
    rec = {"on": False, "t0": None, "n": 0, "jpegs": [], "samples": [], "size": None}
    timeline_log = []

    @r.on_message
    def _on_msg(*args):
        msg = args[0] if len(args) == 1 else {"type": args[0], "data": args[1] if len(args) > 1 else None}
        loop.call_soon_threadsafe(events.put_nowait, msg)

    @r.track("main_video").on_frame
    def _on_frame(frame):  # RGB (H, W, 3)
        if not rec["on"]:
            return
        if rec["t0"] is None:
            rec["t0"] = time.time()
            rec["size"] = (frame.shape[1] // 2, frame.shape[0] // 2)
        small = cv2.resize(frame, rec["size"], interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", cv2.cvtColor(small, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
        if ok:
            rec["jpegs"].append(buf.tobytes())
        if rec["n"] % 24 == 0:
            rec["samples"].append((time.time() - rec["t0"], small.copy()))
        rec["n"] += 1

    async def drain(log_types=("image_accepted", "prompt_accepted", "conditions_ready", "generation_started",
                               "chunk_complete", "command_error", "generation_reset")):
        """Non-blocking: log any events that have arrived."""
        while not events.empty():
            msg = events.get_nowait()
            t = msg.get("type") if isinstance(msg, dict) else None
            if t in log_types:
                d = msg.get("data")
                line = f"{time.time() - start_wall:6.2f}s  event {t}" + (f"  {d}" if t in ("command_error", "chunk_complete") else "")
                print("  ", line); timeline_log.append(line)
            yield msg

    async def wait_for(types, timeout=120):
        deadline = time.time() + timeout
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError(f"waiting for {types}")
            msg = await asyncio.wait_for(events.get(), remaining)
            t = msg.get("type") if isinstance(msg, dict) else None
            if t == "command_error":
                print("   !! command_error:", msg.get("data"))
            elif t not in ("state",):
                print("   event:", t)
            if t in types:
                return msg

    start_wall = time.time()
    # LingBot capacity is shared; a busy pool answers 429 "no available capacity".
    for attempt in range(1, 25):
        try:
            print("connecting…" if attempt == 1 else f"connecting… (try {attempt}/24)")
            await r.connect()
            break
        except Exception as e:
            busy = re.search(r"capacity|busy|429|rate.?limit", str(e), re.I)
            if not busy or attempt == 24:
                raise
            print("   LingBot servers are all busy — retrying in 5s")
            await asyncio.sleep(5)
            r = Reactor(MODEL, api_key=key)
            r.on_message(_on_msg)
            r.track("main_video").on_frame(_on_frame)
    print("status:", r.status)
    try:
        ref = await r.upload_file(str(seed_path))
        await r.send_command("set_image", {"image": ref})
        await r.send_command("set_prompt", {"prompt": f"{SCENE}, {LENSES[lens]}"})
        await r.send_command("set_rotation_speed_deg", {"rotation_speed_deg": 15.0})  # default 5 is subtle
        await r.send_command("start", {})
        await wait_for({"generation_started"}, timeout=120)
        rec["on"] = True
        t_gen = time.time()
        print("generation started — recording")

        for t_at, cmd, payload, label in TIMELINE:
            # wait until t_at, logging chunk/error events as they arrive
            while time.time() - t_gen < t_at:
                async for _ in drain():
                    pass
                await asyncio.sleep(0.05)
                if time.time() - start_wall > HARD_TIMEOUT_S:
                    raise TimeoutError("hard timeout")
            if cmd:
                await r.send_command(cmd, payload)
            line = f"{time.time() - t_gen:6.2f}s  SENT {label}" + (f"  ({cmd} {payload})" if cmd else "")
            print("  ", line); timeline_log.append(line)
        rec["on"] = False
    finally:
        await r.disconnect()
        print("disconnected (session closed)")

    jpegs = rec["jpegs"]
    if not jpegs:
        sys.exit("no frames captured")
    span = max(1e-3, time.time() - rec["t0"] - 0.0)
    fps = max(1.0, min(60.0, len(jpegs) / (TIMELINE[-1][0])))
    w, h = rec["size"]
    tmp = OUT / "world-run.raw.mp4"
    vw = cv2.VideoWriter(str(tmp), cv2.VideoWriter_fourcc(*"mp4v"), round(fps), (w, h))
    for b in jpegs:
        vw.write(cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR))
    vw.release()
    final = OUT / "world-run.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(final)], check=False)
    tmp.unlink(missing_ok=True)
    print(f"\nsaved {final}  ({len(jpegs)} frames, ~{fps:.0f} fps, {w}x{h})")

    # strip + drift: seed | sampled frames
    samples = rec["samples"]
    th = (336, 189)
    strip = Image.new("RGB", (th[0] * (1 + len(samples)), th[1]), (12, 14, 18))
    strip.paste(Image.fromarray(seed_rgb).resize(th), (0, 0))
    print("\n  t(s)   MAD vs seed   (0 = identical; <5 unchanged; 5-15 moving; >15 very different)")
    for i, (t, fr) in enumerate(samples, 1):
        strip.paste(Image.fromarray(fr).resize(th), (th[0] * i, 0))
        print(f"  {t:5.1f}   {mad(seed_rgb, fr):6.1f}")
    strip.save(OUT / "world-strip.png")
    (OUT / "world-timeline.txt").write_text("\n".join(timeline_log) + "\n")
    print(f"strip: {OUT / 'world-strip.png'}   timeline: {OUT / 'world-timeline.txt'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", default=str(DEFAULT_SEED))
    ap.add_argument("--lens", choices=list(LENSES), default="plain")
    ap.add_argument("--tag", default=None, help="output subfolder under out/world/")
    ap.add_argument("--scene", choices=list(SCENES), default="room", help="which place the seed image shows")
    a = ap.parse_args()
    global SCENE, TIMELINE
    SCENE = SCENES[a.scene]["prompt"]
    TIMELINE = make_timeline(SCENES[a.scene]["walk_s"])
    p = Path(a.seed)
    if not p.exists():
        sys.exit(f"seed not found: {p}")
    asyncio.run(run(p, a.lens, a.tag))


if __name__ == "__main__":
    main()
