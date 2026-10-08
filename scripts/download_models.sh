#!/usr/bin/env bash
# download_models.sh — fetch the Option A model weights ON THE LOGIN NODE
# (ultraviolet-ln1, which has internet). The GPU/compute node has NO internet,
# so it later reads these from shared storage with HF_HUB_OFFLINE=1.
#
# Put the HF cache on SHARED storage both nodes can see (so set HF_HOME to a
# scratch/home path, NOT a node-local /tmp).
set -euo pipefail

export HF_HOME="${HF_HOME:-$HOME/.cache/huggingface}"
echo "Downloading into HF cache: $HF_HOME"

pip install "huggingface_hub[cli]"

# Renderer: SDXL-Turbo (fast image-to-image "re-skin"). ~ a few GB.
huggingface-cli download stabilityai/sdxl-turbo

echo
echo "Done. On the GPU node, run offline with:"
echo "  export HF_HOME=$HF_HOME HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1"
