#!/usr/bin/env bash
# Run each cloud command with the same writable tool/cache paths, including
# commands launched in a fresh shell or a linked worktree. See README.md.
# Does not install Node/pnpm, copy credentials or change the caller's HOME.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: MYK9_CLOUD=1 MYK9_CLOUD_HOME=.cloud-tools bash scripts/cloud/run.sh <command> [args...]" >&2
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

if [ -z "${MYK9_CLOUD_HOME:-}" ]; then
  echo "cloud run: MYK9_CLOUD_HOME is required (e.g. .cloud-tools relative to the primary checkout)." >&2
  exit 2
fi
# Use the same absolute primary-checkout lookup as bootstrap-worktree.sh.
if ! COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; then
  echo "cloud run: run from inside the Git checkout; cloud home does not select the working directory." >&2
  exit 2
fi
case "$MYK9_CLOUD_HOME" in
  /*) ;;
  *) MYK9_CLOUD_HOME="$(dirname "$COMMON_DIR")/$MYK9_CLOUD_HOME" ;;
esac
export MYK9_CLOUD_HOME
export MYK9_TOOLS_DIR="$MYK9_CLOUD_HOME/bin"
export COREPACK_HOME="$MYK9_CLOUD_HOME/corepack"
export PNPM_HOME="$MYK9_CLOUD_HOME/pnpm"
export DENO_DIR="$MYK9_CLOUD_HOME/deno"
export ASTRO_TELEMETRY_DISABLED=1
export MYK9_CLOUD=1
case ":$PATH:" in
  *":$MYK9_TOOLS_DIR:"*) ;;
  *) export PATH="$MYK9_TOOLS_DIR:$PATH" ;;
esac

# Initialize only the fixed destinations. Permission validation never selects a
# different path and does not create/delete temporary probe files.
for key in MYK9_TOOLS_DIR COREPACK_HOME PNPM_HOME DENO_DIR; do
  directory="${!key}"
  if ! mkdir -p "$directory" || [ ! -w "$directory" ] || [ ! -x "$directory" ]; then
    echo "cloud run: cannot use $key; fixed directory is not writable/searchable. Fix MYK9_CLOUD_HOME; no fallback." >&2
    exit 1
  fi
done

# Preserve provider TLS/CA flags and any explicit heap choice.
case " ${NODE_OPTIONS:-} " in
  *" --max-old-space-size"* | *" --max_old_space_size"*) ;;
  *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=6144" ;;
esac

exec "$@"
