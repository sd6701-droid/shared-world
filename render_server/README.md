# render_server — Option A (NOT built yet)

This directory is for **Option A**, the video-world-model renderer that runs on
the HPC A100s. Per the build plan (CLAUDE.md §9), **do not start Option A until
Option C is demo-ready and a backup video is recorded.**

Planned contents (see CLAUDE.md §5–§6):
- `app.py` — FastAPI service: `POST /render` with `{scene_id, pose, prompt}` →
  PNG, speaking the schema in `shared/protocol.md`.
- `lingbot_runner.py` — wraps LingBot-World inference (image-to-video,
  camera-pose conditioned).

Develop locally against a **stub renderer** that returns the crude three.js frame
unchanged, so the web client ⟷ service integration is finished without a GPU.
Then move to the cluster, download weights (`scripts/download_models.sh`), and
validate step A1 (single frame) first.

## GPU job (this cluster — ultraviolet)
4× A100 interactive session (4h dev window):
```bash
srun --partition=a100_dev --gres=gpu:a100:4 --cpus-per-task=16 --mem=128G \
  --time=04:00:00 --pty bash
```
Longer runs: `a100_short` (≤3 days) or `a100_long` (≤28 days), raise `--time`.
4× V100 alternative: `--partition=gpu4_dev --gres=gpu:v100:4`.
