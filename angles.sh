#!/usr/bin/env bash
# Generate a LingBot-World-2 world video for each room angle image.
#
# Usage:
#   ./angles.sh                  # angle_01 .. angle_05, plain lens
#   ./angles.sh goggles          # lens: plain | goggles | cameras
#   ./angles.sh plain 1 10       # angle_01 .. angle_10
#
# Input:  room_angles_jpg/angle_NN.jpg
# Output: demo-live/out/world/angle_NN/world-run.mp4
# Needs:  REACTOR_API_KEY in .env.local, python3, ffmpeg.
# Cost:   one billed Reactor session per image.
set -euo pipefail
cd "$(dirname "$0")"

LENS="${1:-plain}"
FROM="${2:-1}"
TO="${3:-5}"
PY=demo-live/.venv/bin/python

case "$LENS" in
  plain|goggles|cameras) ;;
  *) echo "unknown lens '$LENS' (use: plain | goggles | cameras)" >&2; exit 2 ;;
esac

# --- checks ---
grep -qE '^\s*REACTOR_API_KEY\s*=\s*\S' .env.local 2>/dev/null \
  || { echo "Missing REACTOR_API_KEY in .env.local (add: REACTOR_API_KEY=rk_...)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }

# --- one-time Python setup ---
if [ ! -x "$PY" ]; then
  echo "Setting up Python environment (one time)…"
  python3 -m venv demo-live/.venv
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q reactor-sdk pillow numpy opencv-python-headless
fi

# --- generate ---
for n in $(seq "$FROM" "$TO"); do
  i=$(printf '%02d' "$n")
  img="room_angles_jpg/angle_$i.jpg"
  [ -f "$img" ] || { echo "skip: $img not found"; continue; }
  echo
  echo "=== angle_$i ($img), lens: $LENS ==="
  "$PY" -u demo-live/generate_world.py --seed "$img" --lens "$LENS" --tag "angle_$i"
done

open demo-live/out/world 2>/dev/null || true
