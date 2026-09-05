#!/bin/bash
# PreToolUse hook: refuse destructive git commands.
#
# The original version tested the raw command string against a list of literal
# substrings. That reads as a denylist of *operations* and is actually a
# denylist of *spellings*: `git push` does not appear in `git -C /tmp push
# origin main`, and `git clean -f` does not appear in `git clean -df`. Both
# are ordinary git syntax, both were allowed, and the hook exited 0 with no
# sign anything had been missed.
#
# So there are two layers now.
#
#   1. The original literal patterns, unchanged, over the raw string. Keeping
#      them means this script can only ever block a SUPERSET of what it used
#      to, including sloppy cases a parser would clear.
#   2. A parser that splits the command on shell separators, strips git's
#      global options, and then matches on subcommand + flag SET rather than
#      on adjacency and flag order.
#
# Run `block-dangerous-git.sh --self-test` to replay the known-answer fixtures
# at the bottom, which include every bypass named above. A guard nobody tested
# against a command it is supposed to block reports its own holes as safety.

set -f # never let a pathspec like '*' glob while we tokenize

# --- Layer 1: the original literal patterns -------------------------------

LITERAL_PATTERNS=(
  "git push"
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "push --force"
  "reset --hard"
)

literal_hit() {
  local command="$1" pattern
  for pattern in "${LITERAL_PATTERNS[@]}"; do
    if printf '%s' "$command" | grep -qE -- "$pattern"; then
      printf 'literal pattern %s' "$pattern"
      return 0
    fi
  done
  return 1
}

# --- Layer 2 helpers ------------------------------------------------------

# True when any single-dash cluster among the arguments carries $1 as a short
# flag: -f, -df and -xdf all count for `f`. Stops at `--`.
has_short_flag() {
  local letter="$1" arg
  shift
  for arg in "$@"; do
    [ "$arg" = "--" ] && return 1
    case "$arg" in
      --*) ;;
      -*) case "$arg" in *"$letter"*) return 0 ;; esac ;;
    esac
  done
  return 1
}

# True when $1 appears as an exact long option, bare or with an attached
# value (--force, --force=x). Stops at `--`.
has_long_flag() {
  local want="$1" arg
  shift
  for arg in "$@"; do
    [ "$arg" = "--" ] && return 1
    case "$arg" in "$want" | "$want"=*) return 0 ;; esac
  done
  return 1
}

# True when `.` is passed as a pathspec, before or after a `--` separator.
has_dot_pathspec() {
  local arg
  for arg in "$@"; do
    [ "$arg" = "." ] && return 0
  done
  return 1
}

# Echoes a reason and returns 0 when this one git invocation is destructive.
inspect_git_invocation() {
  # Strip git's global options so the subcommand is actually reachable. The
  # first arm is the ones that take a SEPARATE value; the second is the ones
  # that are a single token.
  while [ $# -gt 0 ]; do
    case "$1" in
      -C | -c | --git-dir | --work-tree | --namespace | --exec-path | --super-prefix)
        shift 2 || return 1
        ;;
      --git-dir=* | --work-tree=* | --namespace=* | --exec-path=* | --super-prefix=* | \
        -p | -P | --paginate | --no-pager | --bare | --no-replace-objects | \
        --literal-pathspecs | --glob-pathspecs | --noglob-pathspecs | --icase-pathspecs | \
        --no-optional-locks | --html-path | --man-path | --info-path | --version | --help)
        shift
        ;;
      -*) shift ;; # unrecognised global option: skip it, do not stop parsing
      *) break ;;
    esac
  done

  [ $# -eq 0 ] && return 1
  local subcommand="$1"
  shift

  case "$subcommand" in
    push)
      printf 'git push'
      return 0
      ;;
    reset)
      if has_long_flag --hard "$@"; then
        printf 'git reset --hard'
        return 0
      fi
      ;;
    clean)
      if has_short_flag f "$@" || has_long_flag --force "$@"; then
        printf 'git clean --force'
        return 0
      fi
      ;;
    branch)
      if has_short_flag D "$@"; then
        printf 'git branch -D'
        return 0
      fi
      # -d is allowed on its own (it refuses unmerged branches); -d --force is
      # -D by another name.
      if { has_short_flag d "$@" || has_long_flag --delete "$@"; } &&
        { has_short_flag f "$@" || has_long_flag --force "$@"; }; then
        printf 'git branch --delete --force'
        return 0
      fi
      ;;
    checkout)
      if has_dot_pathspec "$@"; then
        printf 'git checkout .'
        return 0
      fi
      ;;
    restore)
      if has_dot_pathspec "$@"; then
        printf 'git restore .'
        return 0
      fi
      ;;
  esac
  return 1
}

# Echoes a reason and returns 0 when any segment of the command is destructive.
parsed_hit() {
  local segment reason
  # Separators become newlines so each element of a list or pipeline is judged
  # on its own. Splitting inside a quoted string can only ever produce EXTRA
  # segments, which risks over-blocking, never under-blocking.
  while IFS= read -r segment; do
    # shellcheck disable=SC2086 # word splitting IS the tokenizer here
    set -- $segment
    # Step past environment assignments and command wrappers.
    while [ $# -gt 0 ]; do
      case "$1" in
        *=* | env | sudo | nohup | command | time | exec | xargs) shift ;;
        *) break ;;
      esac
    done
    [ $# -eq 0 ] && continue
    case "$1" in
      git | */git) shift ;;
      *) continue ;;
    esac
    if reason=$(inspect_git_invocation "$@"); then
      printf '%s' "$reason"
      return 0
    fi
  done <<EOF
$(printf '%s' "$1" | tr ';|&' '\n\n\n')
EOF
  return 1
}

verdict() {
  local command="$1" reason
  if reason=$(literal_hit "$command"); then
    printf 'block:%s' "$reason"
    return 0
  fi
  if reason=$(parsed_hit "$command"); then
    printf 'block:%s' "$reason"
    return 0
  fi
  printf 'allow'
}

# --- Self-test ------------------------------------------------------------

self_test() {
  local failures=0 total=0 command expected actual
  while IFS='	' read -r command expected; do
    [ -z "$command" ] && continue
    total=$((total + 1))
    case "$(verdict "$command")" in
      block:*) actual=block ;;
      *) actual=allow ;;
    esac
    if [ "$actual" != "$expected" ]; then
      echo "FAIL: '$command' expected $expected, got $actual" >&2
      failures=$((failures + 1))
    fi
  done <<'FIX'
git push origin main	block
git -C /tmp push origin main	block
git clean -df	block
git clean -f	block
git -c user.name=x clean -xdf	block
git clean --force	block
git reset --hard HEAD~1	block
git --git-dir=/tmp/.git reset --hard	block
git branch -D feature	block
git branch -rD feature	block
git branch -d -f feature	block
git checkout .	block
git checkout -- .	block
git restore .	block
git restore -- .	block
cd /tmp && git push	block
/usr/bin/git -C /tmp clean -fdx	block
git status	allow
git commit -m wip	allow
git clean -n	allow
git branch -d merged	allow
git checkout main	allow
git restore src/foo.ts	allow
git reset HEAD~1	allow
git -C /tmp status	allow
FIX
  if [ "$failures" -gt 0 ]; then
    echo "self-test: $failures/$total FAILED" >&2
    return 1
  fi
  echo "self-test: $total/$total passed"
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit $?
fi

# --- Hook entry point -----------------------------------------------------

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

RESULT=$(verdict "$COMMAND")
case "$RESULT" in
  block:*)
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '${RESULT#block:}'. The user has prevented you from doing this." >&2
    exit 2
    ;;
esac

exit 0
