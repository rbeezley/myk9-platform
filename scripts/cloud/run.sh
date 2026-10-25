#!/usr/bin/env bash
# Run each cloud command with the same writable tool/cache paths, including
# commands launched in a fresh shell or a linked worktree. See README.md.
# Does not install Node/pnpm, copy credentials or change the caller's HOME.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: MYK9_CLOUD=1 bash scripts/cloud/run.sh <command> [args...]" >&2
  exit 2
fi
if [ "$(uname -s)" != "Linux" ]; then
  echo "cloud run: requires Linux; local machines use their existing setup." >&2
  exit 3
fi
if [ "${MYK9_CLOUD:-}" != "1" ] && [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] &&
  [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "cloud run: no cloud marker; set MYK9_CLOUD=1 in the cloud environment." >&2
  exit 3
fi

# The common Git directory belongs to the primary checkout, so tools survive
# switching worktrees. The active checkout still owns its dependencies and logs.
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
export MYK9_CLOUD_HOME="${MYK9_CLOUD_HOME:-$(dirname "$COMMON_DIR")/.cloud-tools}"
export MYK9_TOOLS_DIR="${MYK9_TOOLS_DIR:-$MYK9_CLOUD_HOME/bin}"
export COREPACK_HOME="${COREPACK_HOME:-$MYK9_CLOUD_HOME/corepack}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$MYK9_CLOUD_HOME/config}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$MYK9_CLOUD_HOME/cache}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$MYK9_CLOUD_HOME/data}"
export XDG_STATE_HOME="${XDG_STATE_HOME:-$MYK9_CLOUD_HOME/state}"
export DENO_DIR="${DENO_DIR:-$XDG_CACHE_HOME/deno}"
export ASTRO_TELEMETRY_DISABLED="${ASTRO_TELEMETRY_DISABLED:-1}"
export MYK9_CLOUD=1
export PATH="$MYK9_TOOLS_DIR:$PATH"

# Preserve provider TLS/CA flags and any explicit heap choice.
case " ${NODE_OPTIONS:-} " in
  *" --max-old-space-size"* | *" --max_old_space_size"*) ;;
  *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=6144" ;;
esac

mkdir -p "$MYK9_TOOLS_DIR" "$COREPACK_HOME" "$XDG_CONFIG_HOME" \
  "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$DENO_DIR"
exec "$@"
