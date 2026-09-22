#!/usr/bin/env bash
# =============================================================================
# Deploy the production API on EC2 — run from ~/realestate
# =============================================================================
# Production runs whatever is checked out in this folder. It sat for weeks on a
# stale branch, `stabilization-prod-prep`: deploys worked only because they were
# typed as `git pull origin main`, and the first bare `git pull` fetched main
# and applied nothing, with no error. This script refuses anything but a clean
# `main` that fast-forwards to origin/main, so "deployed" means one thing.
#
# Usage:   ./scripts/deploy-api.sh
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

branch="$(git branch --show-current)"
if [ "$branch" != "main" ]; then
  echo "✗ This folder is on '$branch', not main. Production deploys main only."
  echo "  git status --short && git checkout main   — then run this again."
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ Local edits to tracked files — they would ship unreviewed, or block the pull:"
  git status --short --untracked-files=no
  exit 1
fi

before="$(git rev-parse HEAD)"
git fetch -q origin main
git merge --ff-only -q origin/main
after="$(git rev-parse HEAD)"

if [ "$before" = "$after" ]; then
  echo "• Already at $(git log --oneline -1). Restarting anyway."
else
  echo "• $(git rev-list --count "$before..$after") new commit(s):"
  git log --oneline "$before..$after"
  # Only when the lockfile moved: a needless install is the slow half of a deploy.
  if ! git diff --quiet "$before" "$after" -- package-lock.json; then
    echo "• package-lock.json changed — npm install"
    npm install --no-audit --no-fund
  fi
fi

pm2 restart re-api --update-env
sleep 4
echo
echo "• Boot banner (must say PRODUCTION · main@$(git rev-parse --short HEAD)):"
pm2 logs re-api --lines 60 --nostream 2>/dev/null | grep -E "PRODUCTION|DEVELOPMENT|LOCAL|Connection keys|UNREADABLE|MISMATCH" | tail -5
