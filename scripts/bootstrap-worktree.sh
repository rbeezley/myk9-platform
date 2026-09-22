#!/bin/bash
# Bootstrap a git worktree with dependencies, env files, and package builds.
# Designed to run automatically via PostToolUse hook after EnterWorktree,
# or manually: bash scripts/bootstrap-worktree.sh
set -euo pipefail

WORKTREE_DIR="$(git rev-parse --show-toplevel)"
if [[ "$WORKTREE_DIR" != /* ]]; then
  echo "Refusing to bootstrap a worktree with a non-absolute path: $WORKTREE_DIR" >&2
  exit 1
fi
cd "$WORKTREE_DIR"
WORKTREE_INVENTORY_FILE="$(mktemp "${TMPDIR:-/tmp}/myk9-worktree-inventory.XXXXXX")"
trap 'rm -f "$WORKTREE_INVENTORY_FILE"' EXIT
if git worktree list --porcelain -z > "$WORKTREE_INVENTORY_FILE"; then
  :
else
  git_status=$?
  echo "Failed to list Git worktrees (exit $git_status)." >&2
  exit "$git_status"
fi

MAIN_REPO=""
while IFS= read -r -d '' record; do
  if [ -z "$MAIN_REPO" ] && [[ "$record" == worktree\ * ]]; then
    MAIN_REPO="${record#worktree }"
  fi
done < "$WORKTREE_INVENTORY_FILE"

if [ -z "$MAIN_REPO" ]; then
  echo "Failed to identify primary Git worktree from porcelain inventory." >&2
  exit 1
fi
if [[ "$MAIN_REPO" != /* ]]; then
  echo "Refusing to bootstrap with a non-absolute primary worktree path: $MAIN_REPO" >&2
  exit 1
fi

echo "=== Bootstrapping worktree ===" >&2
echo "  Worktree: $WORKTREE_DIR" >&2
echo "  Main repo: $MAIN_REPO" >&2

# Activate tracked git hooks (concurrent-agent worktree guard). With
# worktreeConfig enabled, configure this checkout and the primary checkout
# separately, avoiding writes to the common config during concurrent bootstrap.
# Older repositories without worktreeConfig use the common config fallback.
# All config writes are serialized because Git config rejects simultaneous
# updates to the same file. Run before the main-repo skip so fresh clones get
# hooks too.
if [ -d "$WORKTREE_DIR/.githooks" ]; then
  common_cfg="$(git rev-parse --path-format=absolute --git-common-dir)/config"
  worktree_config_enabled="$(git config --get extensions.worktreeConfig 2>/dev/null || true)"

  # Several new worktrees can bootstrap at once. Git config uses a lock file,
  # but concurrent writers to the same config file fail instead of waiting.
  # Serialize the small set of hook-path writes. mkdir is atomic on supported
  # local filesystems, and the bounded wait fails clearly if a prior process
  # was killed while holding the lock.
  config_lock="${common_cfg}.bootstrap.lock"
  lock_acquired=false
  release_config_lock() {
    if [ "$lock_acquired" = true ]; then
      if [ ! -f "$config_lock/pid" ] || [ "$(cat "$config_lock/pid")" = "$$" ]; then
        rm -f "$config_lock/pid"
        rmdir "$config_lock" 2>/dev/null || true
      fi
      lock_acquired=false
    fi
    rm -f "$WORKTREE_INVENTORY_FILE"
  }
  for attempt in {1..300}; do
    if mkdir "$config_lock" 2>/dev/null; then
      lock_acquired=true
      trap release_config_lock EXIT
      printf '%s\n' "$$" > "$config_lock/pid"
      break
    elif [ ! -d "$config_lock" ]; then
      echo "Cannot create Git config bootstrap lock: $config_lock" >&2
      exit 1
    fi
    sleep 0.1
  done
  if [ "$lock_acquired" != true ]; then
    echo "Timed out waiting for Git config bootstrap lock: $config_lock" >&2
    exit 1
  fi
  # Shared config is only read for linked worktrees when worktreeConfig is
  # enabled, so avoid writing it on the concurrent bootstrap path.
  if [ "$worktree_config_enabled" != "true" ]; then
    git config --file "$common_cfg" core.hooksPath .githooks
  fi
  if [ "$worktree_config_enabled" = "true" ]; then
    # A per-worktree config.worktree OVERRIDES the common value, so point each
    # override AT the tracked dir (a relative path resolves per checkout).
    # Setting is more robust here than --unset-all. Cover this checkout AND the
    # primary — the primary is the only checkout the guard actually blocks from.
    this_wt_cfg="$(git rev-parse --path-format=absolute --git-dir)/config.worktree"
    git config --file "$this_wt_cfg" core.hooksPath .githooks
    primary_wt_cfg="$MAIN_REPO/.git/config.worktree"
    git config --file "$primary_wt_cfg" core.hooksPath .githooks
  fi
  # Do not hold the shared config lock during dependency installation/builds.
  release_config_lock
  trap 'rm -f "$WORKTREE_INVENTORY_FILE"' EXIT
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

# 2. Copy gitignored local config from the main repo.
#
# .claude/launch.json is gitignored, so a fresh worktree starts without it and
# any port setting made in one worktree is invisible to the next. That matters
# when several agents run at once: every dev server tries port 5173, the second
# one silently lands on 5174/5175, and it is easy to end up reading a preview
# served by a different worktree's branch. Carrying the file over means one
# `"autoPort": true` in the main repo covers every worktree after it.
LOCAL_FILES=(
  "apps/myk9show/.env"
  "apps/myk9show/.env.local"
  "supabase/.env"
  ".claude/launch.json"
)

for local_file in "${LOCAL_FILES[@]}"; do
  if [ -f "$MAIN_REPO/$local_file" ] && [ ! -f "$WORKTREE_DIR/$local_file" ]; then
    mkdir -p "$(dirname "$WORKTREE_DIR/$local_file")"
    cp "$MAIN_REPO/$local_file" "$WORKTREE_DIR/$local_file"
    echo "  Copied $local_file" >&2
  fi
done

# 3. Build workspace packages (produces dist/ folders needed by apps)
echo "  Building workspace packages..." >&2
pnpm build --filter='./packages/*' 2>&1 | tail -3 >&2

echo "=== Worktree ready ===" >&2
