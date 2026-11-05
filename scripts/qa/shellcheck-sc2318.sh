#!/usr/bin/env bash
# MYK9-1709 (LESSON local-self-reference): `local s="$1" n=${#s}` measures the
# CALLER's `s`, because the shell expands every word before running `local`.
# shellcheck SC2318 catches it; this runs ONLY that code over every tracked
# shell script so the rollout does not turn on every warning.
#
# Usage: scripts/qa/shellcheck-sc2318.sh [file...]
#   no args: every tracked *.sh, plus tracked .githooks/* whose shebang is sh/bash.
#   args:    exactly those files (used by the known-answer test).
set -euo pipefail

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck-sc2318: shellcheck is not installed." >&2
  exit 2
fi

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  cd "$(git rev-parse --show-toplevel)"
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(git ls-files '*.sh')
  while IFS= read -r f; do
    case "$f" in *.sh) continue ;; esac
    if head -n 1 "$f" | grep -Eq '^#!.*\b(ba)?sh\b'; then files+=("$f"); fi
  done < <(git ls-files '.githooks/*')
fi

echo "shellcheck-sc2318: checking ${#files[@]} file(s)"
shellcheck --include=SC2318 "${files[@]}"
