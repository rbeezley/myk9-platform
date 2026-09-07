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
# Fail closed: a base that does not resolve (unfetched origin/main, a typo)
# must not turn into an empty file list and a green check (Codex review of
# #2121). Exit 2 means "did not check", never "clean".
if [ -n "$BASE" ]; then
  if ! MB="$(git merge-base "$BASE" HEAD 2>/dev/null)" || [ -z "$MB" ]; then
    echo "format-changed: cannot resolve merge base of '$BASE' and HEAD; nothing was checked" >&2
    exit 2
  fi
  if ! FILES="$(git diff --name-only --diff-filter=ACMR "$MB" HEAD)"; then
    echo "format-changed: git diff against $MB failed; nothing was checked" >&2
    exit 2
  fi
else
  if ! FILES="$(git diff --name-only --diff-filter=ACMR HEAD; git ls-files --others --exclude-standard)"; then
    echo "format-changed: git diff failed; nothing was formatted" >&2
    exit 2
  fi
fi
# The extension list is what Prettier parses with no plugins. `.astro` is
# deliberately absent (and in .prettierignore): prettier-plugin-astro is not
# installed, so Prettier errors on those files rather than formatting them.
FILES="$(printf '%s\n' "$FILES" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|yml|yaml|html)$' | sort -u)"
[ -z "$FILES" ] && { echo "format-changed: nothing to format"; exit 0; }
# One argument per line: the tree has paths with spaces
# (docs/design/.../Field Guide Landing Page.html), which a bare xargs would split.
printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 ./node_modules/.bin/prettier "$MODE" --ignore-unknown --log-level warn
