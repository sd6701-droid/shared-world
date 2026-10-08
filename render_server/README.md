# render_server — Option A (SDXL-Turbo live re-skin)

FastAPI service that re-skins each agent's crude three.js frame into a nicer
frame using **SDXL-Turbo** image-to-image, driven by the shared STBoard. The
model is a *skin* — low `strength` keeps the layout, so multi-agent consistency
is preserved. Classical rendering stays in the browser as the always-works
fallback; the web UI toggle "World model (SDXL-Turbo)" overlays this service.

```
POST /render  {scene_id, agent_id, pose, prompt, image_b64, strength, steps}
           -> {agent_id, frame_png_b64}
GET  /health  -> {ok, backend}   # backend: cuda | mps | cpu | stub
```

- `app.py` — the FastAPI service.
- `sdxl_runner.py` — SDXL-Turbo wrapper. If torch/CUDA/diffusers or the weights
  are missing, it falls back to a **stub** that returns the input frame
  unchanged, so you can build + test the web↔service loop locally with no GPU.

## Local dev (no GPU — stub mode)
```bash
python -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" pillow      # no torch needed for stub
uvicorn app:app --host 127.0.0.1 --port 8000
# open the web demo, tick "World model", point it at http://localhost:8000
# health shows backend "stub"; overlays show the crude frame (loop verified)
```

## The internet / air-gap workflow (ultraviolet cluster)
The compute node has **no internet**. Do all downloading on the **login node**.

1. **Login node (`ultraviolet-ln1`, has internet):** build the env and download
   weights to SHARED storage.
   ```bash
   git pull                               # pull your code here, NOT on the GPU node
   python -m venv .venv && source .venv/bin/activate
   pip install torch --index-url https://download.pytorch.org/whl/cu121   # match cluster CUDA
   pip install -r render_server/requirements.txt
   export HF_HOME=$SCRATCH/hf             # shared path both nodes can read
   bash scripts/download_models.sh
   ```

2. **GPU compute node (no internet):** read from the shared filesystem, run offline.
   ```bash
   srun --partition=a100_dev --gres=gpu:a100:4 --cpus-per-task=16 --mem=128G \
     --time=04:00:00 --pty bash
   source .venv/bin/activate
   export HF_HOME=$SCRATCH/hf HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
   cd render_server && uvicorn app:app --host 0.0.0.0 --port 8000
   # /health should now report backend "cuda"
   ```
   (SDXL-Turbo uses ~1 GPU; the other A100s are free for a bigger model later.)

3. **Reach it from your laptop — SSH tunnel through the login node:**
   ```bash
   # <node> is the compute node name from `squeue -u $USER`
   ssh -N -L 8000:<node>:8000 <user>@ultraviolet-ln1
   # then in the web demo set the server URL to http://localhost:8000
   ```
   If the cluster blocks tunnels, **pre-render** instead: save frames to disk on
   the node, copy back with scp, and play them as the Option A view.

## "Live" expectations
SDXL-Turbo at 1–2 steps / 512² is ~tens of ms/frame on an A100, so the overlay
updates several times a second (not 60fps). The classical sim keeps running at
full rate underneath; the neural view refreshes as fast as the service answers.
Honesty rule (CLAUDE.md §5): this is **structural** consistency — the re-skin is
not pose-exact pixel-for-pixel.
