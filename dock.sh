#!/usr/bin/env bash
# Generate several consistent Loading Dock images into dock/ (see scripts/gen-dock.py).
#
# Usage:
#   ./dock.sh                 # 5 images: dock/dock_1.jpg .. dock_5.jpg
#   ./dock.sh 8               # 8 images (max 10)
#   ./dock.sh 5 --force       # redo existing images
#   ./dock.sh 5 --base public/rooms/dock.png   # start from an existing image
#
# Needs in .env.local: GEMINI_API_KEY=...  and  GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
set -euo pipefail
cd "$(dirname "$0")"

COUNT="${1:-5}"; shift || true
PY=demo-live/.venv/bin/python

for var in GEMINI_API_KEY GEMINI_IMAGE_MODEL; do
  grep -qE "^\s*${var}\s*=\s*\S" .env.local 2>/dev/null \
    || { echo "Missing ${var} in .env.local"; exit 1; }
done

if [ ! -x "$PY" ]; then
  echo "Setting up Python environment (one time)…"
  python3 -m venv demo-live/.venv
  "$PY" -m pip install -q --upgrade pip
fi
"$PY" -c "import google.genai, PIL" 2>/dev/null || { echo "Installing google-genai (one time)…"; "$PY" -m pip install -q google-genai pillow; }

"$PY" -u scripts/gen-dock.py --count "$COUNT" "$@"
open dock 2>/dev/null || true
