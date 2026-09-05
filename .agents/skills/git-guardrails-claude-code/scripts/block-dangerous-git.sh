#!/bin/bash
# Claude Code PreToolUse hook: block destructive git commands.
#
# LOCAL PATCH (myk9-platform #2064, Codex P2): upstream matched raw substrings
# ("git push", "git clean -fd", "git branch -D"), so equivalent forms walked
# straight past it — `git -C /repo push`, `git clean -df`, `git branch --delete
# --force x`. This version splits the command on shell separators, strips git's
# global options, and normalizes flag aliases before deciding.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

block() {
  echo "BLOCKED: '$COMMAND' — $1. The user has prevented you from doing this." >&2
  exit 2
}

# One git invocation per segment: split on && || ; | and newlines.
echo "$COMMAND" | sed -E 's/(&&|\|\||;|\|)/\n/g' | while IFS= read -r segment; do
  # Tokenize (good enough for hook input; quoted paths with spaces are rare here).
  read -r -a words <<< "$segment"
  i=0
  # Skip leading env assignments and sudo/command wrappers.
  while [ $i -lt ${#words[@]} ] && [[ "${words[$i]}" =~ ^[A-Za-z_][A-Za-z0-9_]*= || "${words[$i]}" == "sudo" || "${words[$i]}" == "command" || "${words[$i]}" == "env" ]]; do i=$((i+1)); done
  [ $i -ge ${#words[@]} ] && continue
  [[ "${words[$i]}" != "git" && "${words[$i]}" != */git ]] && continue
  i=$((i+1))
  # Strip global options: -C <path>, -c <k=v>, --git-dir=…, --work-tree=…, -p, --no-pager, --exec-path=…, etc.
  while [ $i -lt ${#words[@]} ]; do
    w="${words[$i]}"
    case "$w" in
      -C|-c|--git-dir|--work-tree|--namespace|--exec-path) i=$((i+2)); continue ;;
      -*) i=$((i+1)); continue ;;
      *) break ;;
    esac
  done
  [ $i -ge ${#words[@]} ] && continue
  sub="${words[$i]}"; i=$((i+1))
  args=("${words[@]:$i}")
  joined=" ${args[*]} "

  case "$sub" in
    push)
      echo "BLOCKED: '$COMMAND' — git push is not permitted (any form, including --force). The user has prevented you from doing this." >&2; exit 2 ;;
    reset)
      [[ "$joined" == *" --hard "* ]] && { echo "BLOCKED: '$COMMAND' — git reset --hard discards work. The user has prevented you from doing this." >&2; exit 2; } ;;
    clean)
      for a in "${args[@]}"; do
        # -f/-d in any combined short-flag cluster, or --force.
        if [[ "$a" == --force ]] || [[ "$a" =~ ^-[a-zA-Z]*[fd][a-zA-Z]*$ ]]; then
          echo "BLOCKED: '$COMMAND' — git clean with -f/-d deletes untracked files. The user has prevented you from doing this." >&2; exit 2
        fi
      done ;;
    branch)
      hasDelete=0; hasForce=0
      for a in "${args[@]}"; do
        [[ "$a" == "-D" ]] && { hasDelete=1; hasForce=1; }
        [[ "$a" == "--delete" || "$a" == "-d" ]] && hasDelete=1
        [[ "$a" == "--force" || "$a" == "-f" ]] && hasForce=1
        [[ "$a" =~ ^-[a-zA-Z]*D[a-zA-Z]*$ ]] && { hasDelete=1; hasForce=1; }
        [[ "$a" =~ ^-[a-zA-Z]*d[a-zA-Z]*$ && "$a" =~ ^-[a-zA-Z]*f[a-zA-Z]*$ ]] && { hasDelete=1; hasForce=1; }
      done
      [ $hasDelete -eq 1 ] && [ $hasForce -eq 1 ] && { echo "BLOCKED: '$COMMAND' — force-deleting a branch is not permitted. The user has prevented you from doing this." >&2; exit 2; } ;;
    checkout|restore)
      for a in "${args[@]}"; do
        [[ "$a" == "." ]] && { echo "BLOCKED: '$COMMAND' — git $sub . discards working-tree changes. The user has prevented you from doing this." >&2; exit 2; }
      done ;;
  esac
done
# `while` ran in a subshell; propagate its exit code.
status=${PIPESTATUS[2]}
[ "$status" = "2" ] && exit 2
exit 0
