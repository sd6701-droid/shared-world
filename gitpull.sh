#!/usr/bin/env bash
# Pull the latest changes for the current branch.
# Usage: ./gitpull.sh
set -euo pipefail

cd "$(dirname "$0")"

branch="$(git rev-parse --abbrev-ref HEAD)"
git pull origin "$branch"
echo "Pulled origin/$branch"
