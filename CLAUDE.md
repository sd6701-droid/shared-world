# CLAUDE.md — "Shared World" (Reactor × Google DeepMind Hackathon, NYC, Oct 8 2026)

> This file is the build plan and the single source of truth for the agent and
> teammates. Read it top to bottom before writing code. It is ordered so that
> **Option C (ships first, guaranteed to work) → Option A (the upgrade)**.
> Build C fully, demo-ready, BEFORE touching A.

---

## 0. One-paragraph overview

We are building a **2-player shared-world demo** that proves the one thing
single-player video world models can't: **multi-agent consistency**. Two players
("agents") inhabit **one authoritative world state** and each gets their own view.
Because every view is derived from the *same* state, what one player does is
visible — consistently — to the other. The headline: *most world models are
single-player and drift; we keep one shared state and render a consistent view
per agent, so agents can join or leave without retraining (population-scalable
multi-agent world modeling).*

The simplest instance: **two people walking side by side** through a world. You
see yourself and the other agent; the other agent sees you; move together, and
both views stay mutually consistent. Later we swap environments and add an
open-source **video world model** as the renderer.

### The core invariant (NEVER violate this)
There is exactly **ONE** authoritative world state (the "STBoard"). Every agent's
image is a **deterministic function of that state + that agent's camera pose**.
No per-agent generator is ever allowed to invent world content that isn't in the
STBoard. Consistency is a *property of the architecture*, not something we hope
the model gives us. If a change we make could let two views disagree about the
world, that change is wrong.

---

## 1. The three options (we climb this ladder)

| Option | World rendered by | Consistency | Role |
|---|---|---|---|
| **C** | classical renderer we write (three.js), ONE shared stream, split-screen | **Exact, trivially** (literally one scene) | **Ship first. The floor.** |
| **A** | video world model, per-agent view, conditioned on a crude frame from the shared state | **Exact structure** (model only re-skins our frame) | **The upgrade.** |
| B (not building) | pure generation, anchored/re-grounded | approximate only | skip — can't guarantee consistency |

**Strategy:** C is a complete, winnable submission by itself and cannot fail on
stage. A is the research flex layered on top WITHOUT changing the architecture —
same STBoard, same per-agent-pose loop, we only replace the renderer. If A isn't
ready, C still demos and A becomes the "what's next / here it is offline" slide.

---

## 2. Architecture (same for C and A)

```
            ┌──────────────────────────────┐
            │  STBoard  (authoritative)     │   one object, in memory
            │  - world: ground + obstacles  │
            │  - agents: [{id,pos,yaw}]     │
            └──────────────┬───────────────┘
            action+collision│ (classical, exact)
            ┌───────────────▼───────────────┐
            │  per-agent camera pose          │
            └───────┬───────────────┬────────┘
     Option C       │               │        Option A
  classical render  │               │  crude render → video world model
     (three.js)     ▼               ▼     (LingBot-World, conditioned)
                 Agent 1 view    Agent 2 view   ← mutually consistent
```

- **STBoard** = plain data (a dict / small class). Not a neural net. We own it.
- **World evolution** = apply each agent's action to its pose, clamp with a
  collision/bounds check against the world. Classical kinematics. Exact.
- **View synthesis** = the ONLY thing that differs between C and A.

---

## 3. Repo layout

```
shared-world/
  CLAUDE.md                 # this file
  web/                      # Option C: the playable game (three.js, single file ok)
    index.html
    main.js                 # STBoard, agents, input, two cameras, render loop
    stboard.js              # shared-state class (import target for both C and A)
  render_server/            # Option A: neural renderer service (runs on HPC/A100s)
    app.py                  # FastAPI: POST pose+scene -> PNG frame (or WS stream)
    lingbot_runner.py       # wraps LingBot-World inference
    README.md               # exact HPC run instructions (see §6)
  shared/
    protocol.md             # the pose/scene message schema C and A both speak
  scripts/
    download_models.sh      # huggingface-cli downloads
  demo/
    pitch.md                # 90-sec script + backup-video checklist
```

Keep `stboard.js` renderer-agnostic so Option A reuses it unchanged.

---

## 4. OPTION C — build this first (target: ~3 hrs, fully demoable)

**Goal:** a real 2-player game, split-screen, one shared world, exact consistency,
zero models. "Two people walking side by side."

### Stack
- **three.js** (CDN, pinned version e.g. `three@0.160.0`), single `index.html` +
  `main.js`. No build step. Runs by opening the file / a static server.
- No backend. No network. Everything local in the browser.

### Checkpoints (each ends in a working state)
- **C1 — STBoard + ground (30 min).** `stboard.js`: world = flat ground plane +
  a few obstacle boxes placed on a grid; `agents = [{id:0,...},{id:1,...}]` with
  `pos` and `yaw`. Render a top-down view of it. *Exit: see the world from above.*
- **C2 — Two cameras, split screen (45 min).** Two three.js viewports side by
  side, each a camera at an agent's pose looking out. Draw the ground + obstacles.
  *Exit: two first-person views of the same scene.*
- **C3 — Both agents visible to each other (45 min).** Render each agent as a
  simple avatar (capsule/box + a colored marker) IN the scene, so Agent 1's
  avatar appears in Agent 2's view and vice-versa. *Exit: you can see the other
  player in your pane.* **This is the first consistency proof.**
- **C4 — Input + walking side by side (30 min).** Player 1 = WASD + mouse/QE to
  turn; Player 2 = arrows + ,/. to turn (keep it keyboard-simple). Move both;
  verify each sees the other move, correctly positioned, in real time.
  *Exit: the "two people walking side by side" demo works.*
- **C5 — A shared interaction (30 min).** One mutable thing: a block/flag/door
  either player can toggle (spacebar near it). Toggling changes the STBoard, so
  BOTH views show the change. *Exit: Player 1 opens the door → Player 2 sees it
  open.* **This is the money-shot consistency proof — it is literally impossible
  without shared state.**
- **C6 — Minimap overlay (optional, 20 min).** Small top-down STBoard view showing
  both agents + their view-direction cones. Makes "one state, two views" visible
  at a glance.

### Definition of done for C
Two panes, two players, walking together, each seeing the other and a shared
toggle update live. **If you reach here, you have a submission.** Record a backup
screen capture now (see `demo/pitch.md`).

---

## 5. OPTION A — the upgrade (target: ~2–3 hrs, only after C is done)

**Goal:** replace the classical per-agent render with a **video world model**, so
each agent's view is *generated* — while structure (and therefore consistency)
stays pinned by the shared STBoard.

### The mechanism (why consistency survives)
1. From the STBoard + agent pose, produce a **crude conditioning frame** (reuse
   the three.js render of that agent's view — blocky but structurally correct).
2. Send it to the neural renderer, which does **image-conditioned** generation:
   it beautifies/realism-upgrades the crude frame but must NOT invent new layout.
3. Because both agents' conditioning frames come from the ONE STBoard, two views
   of the same spot are structurally matched → consistency holds. The model is a
   **skin**, not the source of truth.

### Integration path (smallest first)
- **A1 — Offline single frame.** Get the model to turn ONE crude frame + prompt
  into ONE nice frame on the HPC. Prove the install + weights work. *(see §6)*
- **A2 — Offline clip per agent.** Feed a short pose sequence (agent walking) →
  short generated clip. Do it for both agents from the same STBoard scene; eyeball
  that they look like the same world.
- **A3 — Service.** Wrap it in `render_server/app.py` (FastAPI): `POST /render`
  with `{scene_id, pose, prompt}` → PNG, or a WebSocket that streams frames. The
  browser (Option C) calls this instead of drawing locally, per agent.
- **A4 — Swap in the demo.** Add a UI toggle: "classical renderer ⟷ world model."
  Classical stays as the always-works fallback; the world-model view is the flex.

### Honesty rule for the pitch (say this before a judge asks)
A *generated* renderer is not pose-exact: two views of the same corner won't be
pixel-identical. Our claim is **structural/architectural consistency** — shared
state drives every view — and **pose-exact neural rendering of shared state is the
open research problem**, which is exactly the training direction we'd pursue next.
Do not overclaim pixel-perfect multi-view consistency from the video model.

---

## 6. OPEN-SOURCE WORLD MODEL — install & run (HPC / A100s)

### Which model
**LingBot-World** (Apache-2.0). It is the right pick because it takes **camera
poses** natively (`poses.npy` + `intrinsics.npy`), which is exactly our
"pose → view" interface, and it does **image-to-video** (`--task i2v-A14B`) so we
can seed it with our crude frame. Repo: `github.com/robbyant/lingbot-world`
(note: maintainers point to successor `robbyant/lingbot-world-v2` — check it, but
the commands below are the documented v1 ones).

> ⚠️ **Scale reality (read before committing time):** this is a **14B** model.
> The documented inference uses **8 GPUs** (`--nproc_per_node=8`, `--ulysses_size 8`,
> FSDP). On **2–3× A100** you must use the **4-bit community quant**
> (`cahlen/lingbot-world-base-cam-nf4`) and/or small `--frame_num`, `--t5_cpu`,
> and expect **offline/near-real-time**, not live-in-the-loop. Plan Option A as
> **pre-rendered clips** for the demo, with live generation as a stretch. Real-time
> per-agent streaming on 2–3 A100 is NOT a safe assumption.

### Download (scripts/download_models.sh)
```bash
pip install "huggingface_hub[cli]"
# camera-pose base model
huggingface-cli download robbyant/lingbot-world-base-cam \
  --local-dir ./lingbot-world-base-cam
# fast variant (into the expected subdir)
huggingface-cli download robbyant/lingbot-world-fast \
  --local-dir ./lingbot-world-base-cam/lingbot_world_fast
# 4-bit quant for <8 GPU setups (inference only, third-party)
huggingface-cli download cahlen/lingbot-world-base-cam-nf4 \
  --local-dir ./lingbot-world-base-cam-nf4
```

### Environment
```bash
# Python 3.10/3.11 recommended (not stated upstream; Wan2.2 base)
python -m venv .venv && source .venv/bin/activate
pip install torch>=2.4.0            # match your CUDA (HPC module)
pip install -r requirements.txt     # from the repo (built on Wan2.2)
pip install flash-attn --no-build-isolation
```

### Run — image-to-video, camera-pose conditioned (480P)
```bash
torchrun --nproc_per_node=8 generate.py \
  --task i2v-A14B --size 480*832 \
  --ckpt_dir lingbot-world-base-cam \
  --image path/to/crude_frame.png \
  --prompt "a person walking down a street, photorealistic" \
  --action_path path/to/poses_dir \
  --dit_fsdp --t5_fsdp --ulysses_size 8 \
  --frame_num 81
```
On 2–3 GPUs: drop `--nproc_per_node` to your count, reduce `--ulysses_size`
accordingly, add `--t5_cpu`, use the nf4 checkpoint, keep `--frame_num` small
(e.g. 33–81). If OOM: smaller frame_num first, then nf4, then 480P only.

### Fast variant (script)
```bash
bash run_fast.sh lingbot-world-base-cam 81   # <weights_dir> <frame_num>; 16 FPS
```

### Camera-pose inputs (our interface to the STBoard)
- `poses.npy` : shape `[num_frames, 4, 4]`, **OpenCV** camera-to-world, one per frame.
- `intrinsics.npy` : shape `[num_frames, 4]` (fx, fy, cx, cy).
- We GENERATE these from the STBoard: for each agent, each frame, convert
  `{pos, yaw}` → a 4×4 pose. This is the bridge: **STBoard pose → model input.**
  (Upstream can also extract poses from video with ViPE — we don't need that; we
  synthesize poses directly, which is cleaner and exactly on-architecture.)

### HPC workflow (local dev → cluster run)
1. Develop `render_server/` locally against a **stub renderer** (returns the crude
   frame unchanged) so the web client + service integration is done without a GPU.
2. `rsync`/git the code to the HPC; download weights there (big — do early).
3. Submit an interactive or batch job requesting your 2–3 A100s; load CUDA module;
   build the venv; run A1 (single frame) FIRST to validate.
4. Expose the service: run FastAPI on a compute node, SSH-tunnel the port to your
   laptop for the demo, OR (safer) pre-render clips to disk and serve those.
   **Decide tunnel-vs-prerender by whether the HPC allows inbound/tunneled ports;
   if unsure, pre-render.**

---

## 7. Protocol between web client and render service (shared/protocol.md)

Keep it tiny and renderer-agnostic so C and A share it:
```json
// request (per agent, per frame or per short sequence)
{ "scene_id": "room-1", "agent_id": 0,
  "pose": {"pos": [x,y,z], "yaw": r, "pitch": r},
  "poses_seq": [[4x4], ...],          // optional, for clip generation
  "prompt": "two people walking side by side, daytime street" }
// response
{ "agent_id": 0, "frame_png_b64": "...", "frames": ["...", ...] }
```
Option C never calls this (renders locally). Option A points each agent's view at
`POST /render`. Same STBoard feeds both.

---

## 8. Environments (the "different environment" ask)

Environments are just **different STBoard presets + prompts**, nothing structural:
- `street` : ground + building boxes; prompt "city street, daytime".
- `forest` : scattered tree obstacles; prompt "forest path".
- `room`   : walls + door (the toggle interaction); prompt "indoor room".
Switching environments = swap the obstacle layout + the text prompt. Because the
STBoard is the source of truth, every environment is automatically consistent
across agents. Add a dropdown in the UI.

---

## 9. Hackathon guardrails (read before each decision)

- **Time:** ~6–7 hrs. Spend the FIRST block finishing Option C end-to-end. Do not
  start Option A until C5 is demoable and the backup video is recorded.
- **Risk order:** C always works (local, no deps). A depends on HPC + a 14B model
  on too-few GPUs → treat as upgrade, keep classical fallback wired in.
- **Consistency is the whole pitch** — never add a feature that could make two
  views disagree about the world. When in doubt, route the disagreement through
  the STBoard.
- **Latency/cost:** Option C is free and instant. Option A on 2–3 A100 is slow →
  pre-render for the demo unless live is proven.
- **Pitch (90s):** problem (world models are single-player, drift) → our insight
  (one shared state, per-agent views) → live proof in Option C (walk together +
  shared toggle) → "and here's the same architecture with a video world model as
  the renderer" (Option A clip) → "next: train a pose-exact neural renderer of the
  shared state on Minecraft/multi-view data (our A100s)."
- **Always have a recorded backup video of the working C demo.** Live demos fail.

## 10. Open questions to resolve early (first 30 min)
- [ ] Confirm whether `lingbot-world-v2` has lighter / better-documented inference
      than v1; prefer it if so.
- [ ] Confirm A100 count + whether HPC allows a tunneled port (decides live vs
      pre-render for Option A).
- [ ] Confirm the hackathon gives Gemini/other credits (could serve as an
      alternative image-conditioned "beautifier" if LingBot won't fit the GPUs).
- [ ] (If you have it) cross-check the Khora paper's condition-map interface
      against our "crude frame → model" bridge and update §5 if it differs.
