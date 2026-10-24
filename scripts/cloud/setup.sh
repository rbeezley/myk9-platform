#!/usr/bin/env bash
# Cloud session setup for Claude Code and Codex cloud agents (MYK9-1397).
#
# Installs the pinned gh, Deno and ShellCheck when missing or too old,
# verifying each archive's sha256 from scripts/cloud/tool-versions.json, then
# installs dependencies, builds the shared packages and runs the preflight.
#
# Local Macs never run this: it refuses on Darwin, and refuses on any machine
# without a cloud marker unless --force is given, before it downloads or
# installs anything. It never touches Node itself, git credentials, gh auth,
# ~/.codex, ~/.claude or the Keychain (docs/plan-cloud-agent-workflow.md,
# Global constraints protection 1). Local worktrees use
# scripts/bootstrap-worktree.sh.
#
# Usage: bash scripts/cloud/setup.sh [--force] [--role=implementer|reviewer|publisher]
# Env:   MYK9_TOOLS_DIR  where tools are installed (default <repo>/.cloud-tools/bin)
#        MYK9_CLOUD=1    explicit cloud marker for providers with none of their own
set -euo pipefail

FORCE=0
ROLE=implementer
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --role=*) ROLE="${arg#--role=}" ;;
    *)
      echo "setup: unknown argument $arg" >&2
      exit 2
      ;;
  esac
done

if [ "$(uname -s)" = "Darwin" ]; then
  echo "setup: refusing on macOS. Cloud setup is not for local machines; use scripts/bootstrap-worktree.sh." >&2
  exit 3
fi

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ "${GITHUB_ACTIONS:-}" != "true" ] &&
  [ "${MYK9_CLOUD:-}" != "1" ] && [ "$FORCE" -ne 1 ]; then
  echo "setup: no cloud marker (CLAUDE_CODE_REMOTE, GITHUB_ACTIONS or MYK9_CLOUD=1); refusing. Pass --force to run anyway." >&2
  exit 3
fi

if [ "$(uname -m)" != "x86_64" ]; then
  echo "setup: tool pins cover Linux x86_64 only; got $(uname -m)." >&2
  exit 3
fi

ROOT="$(git rev-parse --show-toplevel)"
PINS="$ROOT/scripts/cloud/tool-versions.json"
TOOLS_DIR="${MYK9_TOOLS_DIR:-$ROOT/.cloud-tools/bin}"

pin() { # pin <tool> <field>
  node -e 'const p = require(process.argv[1])[process.argv[2]]; process.stdout.write(String(p[process.argv[3]] ?? ""))' \
    "$PINS" "$1" "$2"
}

version_of() { # version_of <tool>: the first dotted number in `<tool> --version`, or empty
  command -v "$1" >/dev/null 2>&1 || return 0
  "$1" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1
}

at_least() { # at_least <have> <want>: dotted numeric comparison, no GNU `sort -V`
  local -a have want
  local i h w
  IFS=. read -r -a have <<<"$1"
  IFS=. read -r -a want <<<"$2"
  for i in 0 1 2; do
    h="${have[i]:-0}"
    w="${want[i]:-0}"
    if [ "$h" -gt "$w" ]; then return 0; fi
    if [ "$h" -lt "$w" ]; then return 1; fi
  done
  return 0
}

require_runtime() { # Node and pnpm come from the provider image; this script never replaces them.
  local tool="$1" have want
  have="$(version_of "$tool")"
  want="$(pin "$tool" minimum)"
  if [ -z "$have" ] || ! at_least "$have" "$want"; then
    echo "setup: $tool ${have:-missing} is below the pinned $want; configure the provider image." >&2
    exit 1
  fi
}

install_tool() { # install_tool <tool>: download, verify, unpack and place the pinned binary
  local tool="$1" have want url sha work archive
  have="$(version_of "$tool")"
  want="$(pin "$tool" minimum)"
  if [ -n "$have" ] && at_least "$have" "$want"; then
    echo "setup: $tool $have ok"
    return 0
  fi
  url="$(pin "$tool" url)"
  sha="$(pin "$tool" sha256)"
  work="$(mktemp -d)"
  archive="$work/${url##*/}"
  echo "setup: installing $tool $(pin "$tool" install)"
  curl --fail --silent --show-error --location --output "$archive" "$url"
  if ! echo "$sha  $archive" | sha256sum --check --status; then
    echo "setup: sha256 mismatch for $url; nothing installed." >&2
    rm -rf "$work"
    exit 1
  fi
  mkdir -p "$TOOLS_DIR"
  case "$tool" in
    gh)
      tar -xzf "$archive" -C "$work"
      install -m 0755 "$work"/gh_*/bin/gh "$TOOLS_DIR/gh"
      ;;
    deno)
      unzip -q -o "$archive" -d "$work"
      install -m 0755 "$work/deno" "$TOOLS_DIR/deno"
      ;;
    shellcheck)
      tar -xJf "$archive" -C "$work"
      install -m 0755 "$work"/shellcheck-v*/shellcheck "$TOOLS_DIR/shellcheck"
      ;;
  esac
  rm -rf "$work"
}

ORIGINAL_PATH="$PATH"
export PATH="$TOOLS_DIR:$PATH"
require_runtime node
require_runtime pnpm
for tool in gh deno shellcheck; do install_tool "$tool"; done

cd "$ROOT"
git config core.hooksPath .githooks
mkdir -p .logs
pnpm install --frozen-lockfile
pnpm build --filter='./packages/*'
pnpm qa:dist-fresh
pnpm run cloud:preflight --role="$ROLE"

case ":$ORIGINAL_PATH:" in *":$TOOLS_DIR:"*) ;; *)
  echo "setup: add the installed tools to PATH in later shells: export PATH=\"$TOOLS_DIR:\$PATH\""
  ;;
esac
