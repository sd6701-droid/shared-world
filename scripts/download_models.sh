#!/usr/bin/env bash
# download_models.sh — fetch LingBot-World weights for Option A (run on the HPC).
# See CLAUDE.md §6. Big downloads — do this early on the cluster, not your laptop.
set -euo pipefail

pip install "huggingface_hub[cli]"

# camera-pose base model (our pose -> view interface)
huggingface-cli download robbyant/lingbot-world-base-cam \
  --local-dir ./lingbot-world-base-cam

# fast variant (into the expected subdir)
huggingface-cli download robbyant/lingbot-world-fast \
  --local-dir ./lingbot-world-base-cam/lingbot_world_fast

# 4-bit community quant for <8 GPU setups (inference only, third-party)
huggingface-cli download cahlen/lingbot-world-base-cam-nf4 \
  --local-dir ./lingbot-world-base-cam-nf4

echo "Done. Validate with Option A step A1 (single frame) before anything else."
