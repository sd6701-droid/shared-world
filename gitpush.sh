#!/usr/bin/env bash
# Stage, commit, and push all changes on the current branch.
# Pulls teammates' commits first (rebase) so the push isn't rejected.
# Usage: ./gitpush.sh "optional commit message"
set -euo pipefail

cd "$(dirname "$0")"

msg="${1:-update $(date '+%Y-%m-%d %H:%M:%S')}"
branch="$(git rev-parse --abbrev-ref HEAD)"

git add -A

# Safety: never commit secrets, even if .gitignore is changed.
if git diff --cached --name-only | grep -qE '(^|/)\.env(\..*)?$|(^|/)\.env\.local$'; then
  echo "Refusing to commit an .env file (it holds API keys). Unstage it with: git reset <file>"
  exit 1
fi

if git diff --cached --quiet; then
  echo "Nothing new to commit."
else
  git commit -m "$msg"
fi

git pull --rebase --autostash origin "$branch"
git push origin "$branch"
echo "Pushed to origin/$branch"
