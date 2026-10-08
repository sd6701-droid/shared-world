# Demo — 90-second pitch + backup checklist

## The one sentence
Most video world models are **single-player and drift**. We keep **one shared
state** and render a **consistent view per agent** — so agents can join or leave
without retraining.

## 90-second script
1. **Problem (15s).** "Video world models are single-player. Put two agents in
   one and their worlds disagree — they drift apart. There's no shared ground truth."
2. **Insight (15s).** "We keep exactly one authoritative world state — the
   STBoard. Every agent's view is a deterministic function of that state plus
   their own camera pose. Consistency is architectural, not hoped-for."
3. **Live proof — Option C (40s).** Open the split-screen demo.
   - Walk both players forward together — "each sees the other, correctly placed."
   - Walk toward each other — the avatars line up in both panes.
   - **Money shot:** Player 1 opens the door (Space) → it opens in Player 2's
     pane too. "This is impossible without shared state. One object changed; both
     views reflect it." Point at the minimap: one world, two view-cones.
   - Switch environment (dropdown) — "same architecture, different world."
4. **The upgrade — Option A (15s).** "Same STBoard, same per-agent-pose loop — we
   only swap the renderer for a video world model that re-skins our frame. Here's
   an offline clip." (Show pre-rendered clip if ready.)
5. **Next (5s).** "Train a pose-exact neural renderer of the shared state on
   multi-view data — on our A100s."

## Honesty line (say before a judge asks)
A *generated* renderer isn't pixel-exact across views — our claim is
**structural/architectural** consistency. Pose-exact neural rendering of shared
state is the open research problem, and that's the training direction.

## Backup checklist (DO THIS BEFORE touching Option A)
- [ ] Record a screen capture of the full Option C demo (walk + door toggle +
      env switch). Live demos fail; have the video.
- [ ] Save the capture to `demo/backup_C.mov` (or link it here).
- [ ] Have `web/` served and tested on the actual demo laptop + browser.
- [ ] Know the controls cold: P1 WASD/QE/Space, P2 arrows/,./Enter.

## Run it
```bash
cd web && python3 -m http.server 8777
# open http://localhost:8777/
```
