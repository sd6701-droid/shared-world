#!/usr/bin/env bash
# Generate a LingBot-World-2 world of the room from one of the 5 room views.
#
# Usage:
#   ./world.sh                 # front view
#   ./world.sh front-left      # front | front-left | front-right | left | right
#   ./world.sh all             # all 5 views, one after another
#   ./world.sh right goggles   # optional lens: plain | goggles | cameras
#   ./world.sh live            # start localhost:5050 and open the interactive page (WASD)
#
# Output: demo-live/out/world/<view>/world-run.mp4 (opened when done).
# Needs: REACTOR_API_KEY in .env.local, python3, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"

VIEW="${1:-front}"
LENS="${2:-plain}"
PY=demo-live/.venv/bin/python

image_for() {
  case "$1" in
    front)       echo angle_05.jpg ;;
    front-left)  echo angle_03.jpg ;;
    front-right) echo angle_07.jpg ;;
    left)        echo angle_01.jpg ;;
    right)       echo angle_09.jpg ;;
    *) echo "unknown view '$1' (use: front | front-left | front-right | left | right | all)" >&2; exit 2 ;;
  esac
}

# --- checks ---
grep -qE '^\s*REACTOR_API_KEY\s*=\s*\S' .env.local 2>/dev/null \
  || { echo "Missing REACTOR_API_KEY in .env.local (add: REACTOR_API_KEY=rk_...)"; exit 1; }

# --- live mode: local server + browser page, you drive with WASD ---
if [ "$VIEW" = "live" ]; then
  command -v node >/dev/null || { echo "node not found (needs Node 18+)"; exit 1; }
  lsof -ti:5050 | xargs kill 2>/dev/null || true
  ( sleep 1.5; open "http://localhost:5050/" 2>/dev/null || true ) &
  echo "Live world model at http://localhost:5050  (Ctrl+C to stop)"
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
  local view="$1" img
  img="$(image_for "$view")"
  echo
  echo "=== world: $view ($img), lens: $LENS ==="
  "$PY" -u demo-live/generate_world.py --seed "demo-live/rooms50/$img" --lens "$LENS" --tag "$view"
}

if [ "$VIEW" = "all" ]; then
  for v in front front-left front-right left right; do run_view "$v"; done
  open demo-live/out/world 2>/dev/null || true
else
  run_view "$VIEW"
  open "demo-live/out/world/$VIEW/world-run.mp4" 2>/dev/null || true
fi
