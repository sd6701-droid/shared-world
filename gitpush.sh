#!/usr/bin/env bash
# Stage, commit, and push all changes.
# Usage: ./gitpush.sh "optional commit message"
set -euo pipefail

cd "$(dirname "$0")"

msg="${1:-update $(date '+%Y-%m-%d %H:%M:%S')}"

git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git commit -m "$msg"
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
git push origin "$branch"
echo "Pushed to origin/$branch"
