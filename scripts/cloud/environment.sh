#!/usr/bin/env bash
# Shared discovery for setup and task shells. Source only after cloud/local guards.
# No credential/config files are read or copied.
myk9_cloud_tools() {
  if [ -z "${MYK9_CLOUD_HOME:-}" ]; then
    local common
    if ! common="$(git rev-parse --git-common-dir 2>/dev/null)"; then
      echo "cloud: run from a Git checkout or set MYK9_CLOUD_HOME explicitly." >&2
      return 1
    fi
    MYK9_CLOUD_HOME="$(cd "$common/.." && pwd)/.cloud-tools"
  fi
  export MYK9_CLOUD_HOME
  myk9_writable_path MYK9_TOOLS_DIR "${MYK9_TOOLS_DIR:-$MYK9_CLOUD_HOME/bin}" "$MYK9_CLOUD_HOME/bin"
  export PATH="$MYK9_TOOLS_DIR:$PATH"
}

myk9_directory_writable() {
  local probe
  mkdir -p "$1" 2>/dev/null &&
    probe="$(mktemp -d "$1/.myk9-write-XXXXXXXX" 2>/dev/null)" && rmdir "$probe"
}

# Keep writable explicit/default locations. Export a replacement only on failure.
myk9_writable_path() {
  local key="$1" current="$2" fallback="$3"
  if myk9_directory_writable "$current"; then
    # Tools must be exported even when their default was used; runtime defaults
    # remain unset so the tool itself retains its normal discovery semantics.
    if [ "$key" = MYK9_TOOLS_DIR ]; then export MYK9_TOOLS_DIR="$current"; fi
  else
    if ! myk9_directory_writable "$fallback"; then
      echo "cloud: no writable directory for $key; choose a writable MYK9_CLOUD_HOME." >&2
      return 1
    fi
    printf -v "$key" '%s' "$fallback"
    export "${key?}"
  fi
}

myk9_cloud_runtime() {
  # Do not relocate XDG config, browser caches, data or state. In particular,
  # ASTRO_TELEMETRY_DISABLED avoids Astro's config write without hiding gh/git.
  myk9_writable_path COREPACK_HOME "${COREPACK_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/node/corepack}" "$MYK9_CLOUD_HOME/corepack"
  myk9_writable_path PNPM_HOME "${PNPM_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/pnpm}" "$MYK9_CLOUD_HOME/pnpm"
  myk9_writable_path DENO_DIR "${DENO_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/deno}" "$MYK9_CLOUD_HOME/deno"
}
