#!/bin/bash
# Bootstrap a git worktree with dependencies, env files, and package builds.
# Designed to run automatically via PostToolUse hook after EnterWorktree,
# or manually: bash scripts/bootstrap-worktree.sh
set -euo pipefail

WORKTREE_DIR="$(git rev-parse --show-toplevel)"
cd "$WORKTREE_DIR"
MAIN_REPO="$(git worktree list --porcelain | head -1 | sed 's/^worktree //')"

echo "=== Bootstrapping worktree ===" >&2
echo "  Worktree: $WORKTREE_DIR" >&2
echo "  Main repo: $MAIN_REPO" >&2

# Activate tracked git hooks (concurrent-agent worktree guard).
#
# This repo enables extensions.worktreeConfig, and the Claude Code worktree
# harness seeds a per-worktree core.hooksPath (in each checkout's
# config.worktree, pointed at .git/hooks) that SHADOWS the shared value. The
# guard only ever BLOCKS from the PRIMARY checkout (it's a no-op in linked
# worktrees), so the primary's override is the one that must be cleared for
# enforcement to work. We therefore:
#   1. set the shared/common value (covers fresh clones with no worktrees),
#   2. clear this checkout's per-worktree override, and
#   3. clear the PRIMARY checkout's override too — so enforcement turns on even
#      when this script runs from a linked worktree (the usual case).
# Runs BEFORE the main-repo skip below so a fresh clone still gets step 1.
if [ -d "$WORKTREE_DIR/.githooks" ]; then
  common_cfg="$(git rev-parse --path-format=absolute --git-common-dir)/config"
  git config --file "$common_cfg" core.hooksPath .githooks
  if [ "$(git config --get extensions.worktreeConfig 2>/dev/null)" = "true" ]; then
    # A per-worktree config.worktree OVERRIDES the common value, so point each
    # override AT the tracked dir (a relative path resolves per checkout).
    # Setting is more robust here than --unset-all. Cover this checkout AND the
    # primary — the primary is the only checkout the guard actually blocks from.
    this_wt_cfg="$(git rev-parse --path-format=absolute --git-dir)/config.worktree"
    if [ -f "$this_wt_cfg" ]; then git config --file "$this_wt_cfg" core.hooksPath .githooks; fi
    primary_wt_cfg="$MAIN_REPO/.git/config.worktree"
    if [ -f "$primary_wt_cfg" ]; then git config --file "$primary_wt_cfg" core.hooksPath .githooks; fi
  fi
  echo "  Git hooks activated (.githooks)" >&2
fi

# Skip if this IS the main repo (not a worktree)
if [ "$WORKTREE_DIR" = "$MAIN_REPO" ]; then
  echo "  Not a worktree — skipping bootstrap" >&2
  exit 0
fi

# 1. Install dependencies
if [ ! -x "apps/myk9show/node_modules/.bin/vite" ]; then
  echo "  Installing dependencies..." >&2
  pnpm install --frozen-lockfile 2>&1 | tail -3 >&2
else
  echo "  myK9Show dependencies exist — skipping install" >&2
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
