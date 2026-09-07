#!/usr/bin/env bash
# Format the files this working tree has changed. Used as a PostToolUse hook
# by Codex (.codex/hooks.json) and safe to run by hand; it does not need to
# know which file the tool wrote, so it works for shell-driven edits too.
# With --check it only reports (CI runs it against the merge base).
#
# Usage: format-changed.sh [--check] [<base-ref>]
#   no base: files changed vs HEAD plus untracked files (the hook's mode)
#   base:    files changed vs `git merge-base <base-ref> HEAD` (CI's mode)
set -uo pipefail
MODE=--write
BASE=""
for arg in "$@"; do
  case "$arg" in
    --check) MODE=--check ;;
    *) BASE="$arg" ;;
  esac
done
cd "$(git rev-parse --show-toplevel)" || exit 1
if [ -n "$BASE" ]; then
  FILES="$(git diff --name-only --diff-filter=ACMR "$(git merge-base "$BASE" HEAD)" HEAD)"
else
  FILES="$(git diff --name-only --diff-filter=ACMR HEAD; git ls-files --others --exclude-standard)"
fi
FILES="$(printf '%s\n' "$FILES" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|yml|yaml|html)$' | sort -u)"
[ -z "$FILES" ] && { echo "format-changed: nothing to format"; exit 0; }
# One argument per line: the tree has paths with spaces
# (docs/design/.../Field Guide Landing Page.html), which a bare xargs would split.
printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 ./node_modules/.bin/prettier "$MODE" --ignore-unknown --log-level warn
