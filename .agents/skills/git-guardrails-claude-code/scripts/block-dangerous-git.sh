#!/bin/bash
# PreToolUse hook: refuse destructive git commands.
#
# The original version tested the raw command string against a list of literal
# substrings. That reads as a denylist of *operations* and is actually a
# denylist of *spellings*: `git push` does not appear in `git -C /tmp push
# origin main`, and `git clean -f` does not appear in `git clean -df`. Both
# are ordinary git syntax, both exited 0, and nothing said the check had been
# skipped. A safety hook that fails open silently is worse than no hook.
#
# Three layers now, each one covering a hole the layer above it left.
#
#   1. The original literal patterns, unchanged, over the raw string. Keeping
#      them means this script can only ever block a SUPERSET of what it did
#      before, including sloppy cases the parser would clear.
#   2. A quote-aware tokenizer. Splitting on whitespace is not good enough:
#      `git -C "/Users/me/AI Projects/repo" push origin main` word-splits into
#      `-C` `"/Users/me/AI` `Projects/repo"` `push`, so the value-skip eats the
#      wrong token, `Projects/repo"` reads as the subcommand, and the push
#      sails through. Any repository under a path with a space in it turns the
#      guard off. The tokenizer honours single quotes, double quotes and
#      backslash escapes, and it never executes the input.
#   3. A parser over those tokens that strips git's global options and matches
#      on subcommand + flag SET rather than on adjacency and flag order.
#
# Run `block-dangerous-git.sh --self-test` to replay the known-answer fixtures
# at the bottom, which include every bypass named above. A guard nobody tested
# against a command it is supposed to block reports its own holes as safety.

set -f # never let a pathspec like '*' glob while we tokenize

NL=$'\n'
TAB=$'\t'
SEP=$'\037' # unit separator: marks a shell command boundary between tokens
INCOMPLETE_MARK="${SEP}INCOMPLETE"

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

# --- Layer 2: quote-aware tokenizer ---------------------------------------

# Emits one token per line. Unquoted `;`, `|`, `&` and newline become a lone
# $SEP token so command boundaries survive into the parser; the same
# characters inside quotes stay part of their token. A trailing
# $INCOMPLETE_MARK means the input ended inside a quote, i.e. this tokenizer
# does not actually understand the string and the caller must be conservative.
tokenize() {
  # Two statements on purpose. The shell expands every word of a command
  # before running it, so `local s="$1" n=${#s}` measures whatever `s` was in
  # the CALLER's scope — empty here — and the loop below never runs. Silent:
  # the tokenizer just emits nothing and every parsed check reads as allow.
  local s="$1"
  local i=0 n c state=none token='' started=0 dq_pending=0
  n=${#s}
  while [ "$i" -lt "$n" ]; do
    c=${s:$i:1}
    i=$((i + 1))

    if [ "$state" = single ]; then
      if [ "$c" = "'" ]; then state=none; else token="$token$c"; fi
      continue
    fi
    if [ "$state" = double ]; then
      # Double quotes are literal for most things but NOT for substitution:
      # the shell still runs `$(...)` and backticks inside them, so
      # `echo "$(git clean -df)"` really does clean. Treating the whole quoted
      # run as one opaque token meant the nested command was never inspected.
      # Drop back to normal tokenizing for the substitution's body and
      # remember to return here when it closes.
      if [ "$c" = '$' ] && [ "${s:$i:1}" = '(' ]; then
        if [ "$started" -eq 1 ]; then
          printf '%s\n' "${token//$NL/ }"
          token=''
          started=0
        fi
        printf '%s\n' "$SEP"
        i=$((i + 1))
        dq_pending=$((dq_pending + 1))
        state=none
      elif [ "$c" = '`' ]; then
        if [ "$started" -eq 1 ]; then
          printf '%s\n' "${token//$NL/ }"
          token=''
          started=0
        fi
        printf '%s\n' "$SEP"
        dq_pending=$((dq_pending + 1))
        state=none
      elif [ "$c" = '"' ]; then
        state=none
      elif [ "$c" = '\' ] && [ "$i" -lt "$n" ]; then
        token="$token${s:$i:1}"
        i=$((i + 1))
      else
        token="$token$c"
      fi
      continue
    fi

    case "$c" in
      "'")
        state=single
        started=1
        ;;
      '"')
        state=double
        started=1
        ;;
      '\')
        if [ "$i" -lt "$n" ]; then
          if [ "${s:$i:1}" = "$NL" ]; then
            # Line continuation: the backslash and the newline both vanish and
            # the token CONTINUES. Appending the newline instead turned
            # `git \<newline>push` into the token " push", which is not the
            # subcommand `push`, and the guard waved it through.
            i=$((i + 1))
          else
            token="$token${s:$i:1}"
            i=$((i + 1))
            started=1
          fi
        fi
        ;;
      ' ' | "$TAB")
        if [ "$started" -eq 1 ]; then
          printf '%s\n' "${token//$NL/ }"
          token=''
          started=0
        fi
        ;;
      # Parentheses are grouping, not part of the word. Without this,
      # `(git -C /tmp push ...)` tokenizes its first word as `(git`, which is
      # not `git`, so the segment was never inspected at all. Treating them as
      # boundaries also makes `$(git push ...)` visible for free.
      ';' | '|' | '&' | '(' | ')' | '`' | "$NL")
        if [ "$started" -eq 1 ]; then
          printf '%s\n' "${token//$NL/ }"
          token=''
          started=0
        fi
        printf '%s\n' "$SEP"
        # Closing a substitution that began inside double quotes puts us back
        # inside those quotes, not at top level.
        case "$c" in
          ')' | '`')
            if [ "$dq_pending" -gt 0 ]; then
              dq_pending=$((dq_pending - 1))
              state=double
            fi
            ;;
        esac
        ;;
      *)
        token="$token$c"
        started=1
        ;;
    esac
  done

  [ "$started" -eq 1 ] && printf '%s\n' "${token//$NL/ }"
  [ "$state" != none ] && printf '%s\n' "$INCOMPLETE_MARK"
  return 0
}

# --- Layer 3 helpers ------------------------------------------------------

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
      # These genuinely take a SEPARATE value. `--exec-path` and
      # `--super-prefix` do not (they are `--opt=<v>` only), and listing them
      # here made the parser swallow the following word: `git --exec-path push`
      # lost `push` to the value-skip and came out clean.
      -C | -c | --config-env | --git-dir | --work-tree | --namespace)
        shift 2 || return 1
        ;;
      # A token in subcommand position that looks like `key=value` is not a
      # subcommand — it is the orphaned value of a global option nobody listed
      # here. Skipping it generalises past the specific options above, which
      # is the fix that keeps working when git grows the next one.
      *=*)
        shift
        ;;
      --git-dir=* | --work-tree=* | --namespace=* | --exec-path=* | --super-prefix=* | \
        --exec-path | --super-prefix | \
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
      # -d alone is allowed (it refuses unmerged branches); -d --force is -D
      # by another name.
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

# One shell command: step past env assignments and wrappers, require git,
# then inspect.
inspect_segment() {
  # Find `git` ANYWHERE in the segment rather than maintaining a list of things
  # that may precede it. The list approach lost to every prefix nobody thought
  # of: `if git ... push` (shell keyword), `sudo -u richard git ... push` (a
  # wrapper option that takes a value), `{ git push; }` (brace grouping). Each
  # was a separate bypass and the next one would have been too. Scanning
  # forward covers all of them at once and can only ever block MORE: the cost
  # is treating `man git push` as a push, which is a rephrase, not a loss.
  while [ $# -gt 0 ]; do
    case "$1" in
      git | */git)
        shift
        break
        ;;
      *) shift ;;
    esac
  done
  [ $# -eq 0 ] && return 1

  local reason arg
  if reason=$(inspect_git_invocation "$@"); then
    printf '%s' "$reason"
    return 0
  fi

  # Backstop. Every hole found in this parser so far has been the option-strip
  # walking past the subcommand — a global option that takes a value when it
  # should not, or one nobody listed. The consequence is always the same shape:
  # `push` is sitting right there in the tokens and the parser never looked at
  # it. So look. This deliberately over-blocks `git commit -m push` and
  # `git log --grep push`; the message says which pattern fired, and a false
  # refusal costs a rephrase while a false allow costs a force-push.
  for arg in "$@"; do
    if [ "$arg" = "push" ]; then
      printf 'a bare `push` argument the option parser never reached'
      return 0
    fi
  done
  return 1
}

# Echoes a reason and returns 0 when any segment of the command is destructive.
parsed_hit() {
  local command="$1" line reason incomplete=0
  local tokens=() seg=()

  while IFS= read -r line; do
    tokens[${#tokens[@]}]="$line"
  done <<EOF
$(tokenize "$command")
EOF

  for line in ${tokens[@]+"${tokens[@]}"}; do
    if [ "$line" = "$INCOMPLETE_MARK" ]; then
      incomplete=1
      continue
    fi
    if [ "$line" = "$SEP" ]; then
      if reason=$(inspect_segment ${seg[@]+"${seg[@]}"}); then
        printf '%s' "$reason"
        return 0
      fi
      seg=()
      continue
    fi
    seg[${#seg[@]}]="$line"
  done
  if reason=$(inspect_segment ${seg[@]+"${seg[@]}"}); then
    printf '%s' "$reason"
    return 0
  fi

  # The input ended inside a quote, so the token stream above is a guess. Fail
  # towards blocking rather than towards a silent allow.
  if [ "$incomplete" -eq 1 ] &&
    printf '%s' "$command" | grep -qE '(^|[^a-zA-Z])git([^a-zA-Z]|$)' &&
    printf '%s' "$command" | grep -qE '(push|reset|clean|branch|checkout|restore)'; then
    printf 'unbalanced quoting around a git command'
    return 0
  fi
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

  # A backslash-newline continuation cannot live in the line-oriented fixture
  # table below, and it is exactly the case that regressed: appending the
  # newline to the token made `git \<newline>push` parse as the subcommand
  # " push", which matched nothing.
  local continuation="git \\${NL}push origin main"
  total=$((total + 1))
  case "$(verdict "$continuation")" in
    block:*) ;;
    *)
      echo "FAIL: backslash-newline continuation before push expected block, got allow" >&2
      failures=$((failures + 1))
      ;;
  esac

  while IFS="$TAB" read -r command expected; do
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
git -C "/Users/rb/AI Projects/myk9-platform" push origin main	block
git -C '/tmp/a b' clean -fd	block
git --work-tree "/tmp/a b" checkout -- .	block
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
git push;ls	block
/usr/bin/git -C /tmp clean -fdx	block
git -C "/tmp/unterminated clean -fd	block
git --exec-path push origin main	block
git --config-env user.name=USER push origin main	block
(git -C /tmp push origin main)	block
$(git -C /tmp push origin main)	block
echo "$(git -C /tmp clean -df)"	block
echo "`git -C /tmp clean -df`"	block
VAR="$(git -C /tmp push origin main)"	block
{ git -C /tmp push origin main; }	block
if git -C /tmp push origin main; then echo done; fi	block
sudo -u richard git -C /tmp push origin main	block
while true; do git -C /tmp clean -fd; done	block
env FOO=bar sudo -n -u rb git -C /tmp reset --hard	block
git -C "${HOME}/repo" push origin main	block
git --config-env user.name=USER clean -fd	block
git --config-env=user.name=USER clean -fd	block
git commit -m push	block
git status	allow
git commit -m wip	allow
git commit -m "push to main"	allow
git -C "/Users/rb/AI Projects/myk9-platform" status	allow
git clean -n	allow
git branch -d merged	allow
git checkout main	allow
git restore src/foo.ts	allow
git reset HEAD~1	allow
git -C /tmp status	allow
cd /tmp	allow
echo hello world	allow
echo "$(git -C /tmp status)"	allow
echo "a plain # string with spaces"	allow
if git -C /tmp status; then echo clean; fi	allow
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
