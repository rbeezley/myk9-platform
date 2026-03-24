#!/bin/bash
# Bootstrap a git worktree with dependencies, env files, and package builds.
# Designed to run automatically via PostToolUse hook after EnterWorktree,
# or manually: bash scripts/bootstrap-worktree.sh
set -euo pipefail

WORKTREE_DIR="$(pwd)"
MAIN_REPO="$(git worktree list --porcelain | head -1 | sed 's/^worktree //')"

echo "=== Bootstrapping worktree ===" >&2
echo "  Worktree: $WORKTREE_DIR" >&2
echo "  Main repo: $MAIN_REPO" >&2

# Skip if this IS the main repo (not a worktree)
if [ "$WORKTREE_DIR" = "$MAIN_REPO" ]; then
  echo "  Not a worktree — skipping bootstrap" >&2
  exit 0
fi

# 1. Install dependencies
if [ ! -d "node_modules" ]; then
  echo "  Installing dependencies..." >&2
  pnpm install --frozen-lockfile 2>&1 | tail -3 >&2
else
  echo "  node_modules exists — skipping install" >&2
fi

# 2. Copy .env files from main repo
ENV_FILES=(
  "apps/myk9show/.env"
  "apps/myk9q/.env"
)

for env_file in "${ENV_FILES[@]}"; do
  if [ -f "$MAIN_REPO/$env_file" ] && [ ! -f "$WORKTREE_DIR/$env_file" ]; then
    cp "$MAIN_REPO/$env_file" "$WORKTREE_DIR/$env_file"
    echo "  Copied $env_file" >&2
  fi
done

# 3. Build workspace packages (produces dist/ folders needed by apps)
echo "  Building workspace packages..." >&2
pnpm build --filter='./packages/*' 2>&1 | tail -3 >&2

echo "=== Worktree ready ===" >&2
