#!/usr/bin/env bash
# Corridor agent: generate a LingBot-World-2 world of the corridor from one of
# the 5 images in corridor/ (corridor_1.jpg .. corridor_5.jpg).
#
# Usage:
#   ./corridor.sh              # view 1
#   ./corridor.sh 3            # view 1 | 2 | 3 | 4 | 5
#   ./corridor.sh all          # all 5 views, one after another
#   ./corridor.sh 2 goggles    # optional lens: plain | goggles | cameras
#   ./corridor.sh live         # start localhost:5050 and open the corridor page (WASD)
#
# Output: demo-live/out/world/corridor-<n>/world-run.mp4 (opened when done).
# Needs: REACTOR_API_KEY in .env.local, python3, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"

VIEW="${1:-1}"
LENS="${2:-plain}"
PY=demo-live/.venv/bin/python

# --- checks ---
grep -qE '^\s*REACTOR_API_KEY\s*=\s*\S' .env.local 2>/dev/null \
  || { echo "Missing REACTOR_API_KEY in .env.local (add: REACTOR_API_KEY=rk_...)"; exit 1; }

# --- live mode: local server + corridor page, you drive with WASD ---
if [ "$VIEW" = "live" ]; then
  command -v node >/dev/null || { echo "node not found (needs Node 18+)"; exit 1; }
  lsof -ti:5050 | xargs kill 2>/dev/null || true
  ( sleep 1.5; open "http://localhost:5050/?scene=corridor" 2>/dev/null || true ) &
  echo "Live corridor world model at http://localhost:5050/?scene=corridor  (Ctrl+C to stop)"
  exec node demo-live/server.mjs
fi

command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }

# --- one-time Python setup ---
if [ ! -x "$PY" ]; then
  echo "Setting up Python environment (one time)…"
  python3 -m venv demo-live/.venv
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q reactor-sdk pillow numpy opencv-python-headless
fi

run_view() {
  local n="$1" img="corridor/corridor_$1.jpg"
  [ -f "$img" ] || { echo "no such image: $img (use 1-5, all, or live)" >&2; exit 2; }
  echo
  echo "=== corridor world: view $n ($img), lens: $LENS ==="
  "$PY" -u demo-live/generate_world.py --scene corridor --seed "$img" --lens "$LENS" --tag "corridor-$n"
}

if [ "$VIEW" = "all" ]; then
  for n in 1 2 3 4 5; do run_view "$n"; done
  open demo-live/out/world 2>/dev/null || true
else
  run_view "$VIEW"
  open "demo-live/out/world/corridor-$VIEW/world-run.mp4" 2>/dev/null || true
fi
