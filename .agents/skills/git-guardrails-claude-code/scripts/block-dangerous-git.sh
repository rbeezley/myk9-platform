#!/bin/bash
# Claude Code PreToolUse hook: block destructive git commands.
#
# LOCAL PATCH (myk9-platform #2064). Upstream matched raw substrings, so
# `git -C /repo push`, `git clean -df` and `git branch --delete --force x`
# slipped past it. Two rewrites that tried to find shell command boundaries
# and tokenize each git invocation kept losing to the next equivalent form
# (quoted paths, `sh -c`, substitutions). A guardrail should fail CLOSED, so
# this version does no boundary parsing at all: it scans the WHOLE command for
# a `git` token, optionally followed by global options, then a dangerous
# subcommand with its aliases normalized. False positives (a commit message
# that says "git push") are acceptable and match upstream's own behaviour.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

# Collapse newlines so multi-line commands are one haystack. A dangerous
# subcommand counts when followed by end-of-input or ANY non-word character —
# `git push;`, `$(git push)`, `"git push"` — not only a space (Codex, round 4).
HAY=$(printf '%s' "$COMMAND" | tr '\n' ' ')

# `git` (or /path/git), then any run of global options — value-taking ones
# (-C <p>, -c <k=v>, --git-dir <p>, …) may carry a quoted value with spaces.
G='(^|[^A-Za-z0-9_./-])(\S*/)?git( +(-C|-c|--git-dir|--work-tree|--namespace|--exec-path)( +("[^"]*"|'"'"'[^'"'"']*'"'"'|\S+)|=\S+)| +--?[A-Za-z][A-Za-z-]*(=\S+)?)* +'

block() { echo "BLOCKED: '$COMMAND' — $1. The user has prevented you from doing this." >&2; exit 2; }

printf '%s' "$HAY" | grep -Eq "${G}push([^A-Za-z0-9_-]|$)" && block "git push is not permitted (any form, including --force)"
printf '%s' "$HAY" | grep -Eq "${G}reset( +\S+)* +--hard([^A-Za-z0-9_-]|$)" && block "git reset --hard discards work"
printf '%s' "$HAY" | grep -Eq "${G}clean( +\S+)* +(--force|-[A-Za-z]*[fd][A-Za-z]*)([^A-Za-z0-9_-]|$)" && block "git clean with -f/-d deletes untracked files"
printf '%s' "$HAY" | grep -Eq "${G}branch( +\S+)* +(-[A-Za-z]*D[A-Za-z]*)([^A-Za-z0-9_-]|$)" && block "force-deleting a branch is not permitted"
printf '%s' "$HAY" | grep -Eq "${G}branch( +\S+)* +(--delete|-[A-Za-z]*d[A-Za-z]*)( +\S+)* +(--force|-[A-Za-z]*f[A-Za-z]*)([^A-Za-z0-9_-]|$)" && block "force-deleting a branch is not permitted"
printf '%s' "$HAY" | grep -Eq "${G}branch( +\S+)* +(--force|-[A-Za-z]*f[A-Za-z]*)( +\S+)* +(--delete|-[A-Za-z]*d[A-Za-z]*)([^A-Za-z0-9_-]|$)" && block "force-deleting a branch is not permitted"
printf '%s' "$HAY" | grep -Eq "${G}(checkout|restore)( +\S+)* +\.([^A-Za-z0-9_-]|$)" && block "git checkout/restore . discards working-tree changes"

exit 0
