#!/usr/bin/env bash
# Pull the latest changes for the current branch.
# Keeps your uncommitted work (autostash) and replays your local commits on top.
# Usage: ./gitpull.sh
set -euo pipefail

cd "$(dirname "$0")"

branch="$(git rev-parse --abbrev-ref HEAD)"
git pull --rebase --autostash origin "$branch"
echo "Pulled origin/$branch"
