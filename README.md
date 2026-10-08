# Shared World

A 2-player **shared-world** demo: two agents inhabit **one authoritative world
state** (the STBoard) and each gets their own view. Because every view is a
deterministic function of the same state, what one player does is visible —
consistently — to the other. See [`CLAUDE.md`](./CLAUDE.md) for the full plan.

> Most video world models are single-player and drift. We keep one shared state
> and render a consistent view per agent → population-scalable multi-agent world
> modeling.

## Run Option C (the playable demo) — no build step

```bash
cd web
python3 -m http.server 8777
# open http://localhost:8777/
```

### Controls
| | Move | Turn | Door |
|---|---|---|---|
| **Player 1** (left pane) | `W A S D` | `Q` / `E` | `Space` |
| **Player 2** (right pane) | arrow keys | `,` / `.` | `Enter` |

- Walk together — each sees the other avatar, correctly placed.
- Stand near the door and toggle it — it changes in **both** panes (the shared
  state; impossible without it).
- Switch worlds with the **Environment** dropdown (street / forest / room).
- Top-center **minimap** shows the one world with both agents' positions.

## Option A — world-model renderer (SDXL-Turbo live re-skin)

Same STBoard, same per-agent loop — only the renderer changes. The browser
captures each agent's crude three.js frame, sends it to a FastAPI service that
re-skins it with **SDXL-Turbo** (image-to-image), and overlays the result.
Because both frames come from the one STBoard, both re-skins stay structurally
consistent. Classical rendering stays underneath as the always-works fallback.

```bash
# local dev (no GPU — stub echoes the crude frame so the loop is testable):
cd render_server
python -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" pillow
uvicorn app:app --host 127.0.0.1 --port 8000
# in the web demo: tick "World model (SDXL-Turbo)", URL http://localhost:8000
```

On the GPU (air-gapped) cluster, download weights on the login node and run the
service offline on an A100 — full steps in [`render_server/README.md`](./render_server/README.md).

## Layout
```
web/           Option C — three.js game (index.html, main.js, stboard.js)
render_server/ Option A — neural renderer service (HPC/A100s; not built yet)
shared/        protocol.md — pose/scene schema C and A both speak
scripts/       download_models.sh — HuggingFace weight downloads
demo/          pitch.md — 90-sec script + backup checklist
```

`web/stboard.js` is renderer-agnostic — Option A reuses it unchanged and only
swaps the renderer. That shared state is why consistency is architectural, not
hoped-for.

## Tests
```bash
node test/test_stboard.mjs   # STBoard kinematics, collision, door, environments
```
