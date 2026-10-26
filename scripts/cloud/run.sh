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

# shellcheck source=scripts/cloud/environment.sh
source "$(dirname "${BASH_SOURCE[0]}")/environment.sh"
myk9_cloud_tools
myk9_cloud_runtime
export ASTRO_TELEMETRY_DISABLED="${ASTRO_TELEMETRY_DISABLED:-1}"
export MYK9_CLOUD=1

# Preserve provider TLS/CA flags and any explicit heap choice.
case " ${NODE_OPTIONS:-} " in
  *" --max-old-space-size"* | *" --max_old_space_size"*) ;;
  *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=6144" ;;
esac

exec "$@"
