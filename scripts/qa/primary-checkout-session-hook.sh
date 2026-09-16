#!/usr/bin/env bash
# SessionStart hook: keep the primary checkout current, and SAY SO when it is not.
#
# The previous form of this hook was:
#   git -C '<primary>' pull --ff-only --quiet 2>/dev/null || true
# which discarded the error (2>/dev/null) and forced success (|| true). On
# 2026-09-10 an uncommitted draft in the primary checkout began aborting that
# pull with "Your local changes would be overwritten by merge". The hook ran at
# every session start for 5 days and threw the message away each time, while 105
# commits piled up on origin/main. The damage surfaced later as false
# `supabase db push --dry-run` drift, stale node_modules and stale package dist.
#
# A hook that cannot fail is not a guard. This one never blocks a session (it
# always exits 0) but it reports into the transcript, and it distinguishes
# "the guard found a problem" from "the guard could not run" -- a banner that
# fires on a clean tree trains you to ignore it, which ends where silence does.
#
# ORDER MATTERS: the local guard runs FIRST, then the network pull. The pull can
# hang on a bad network until the hook's timeout kills the whole script; running
# it second means a killed pull still leaves the guard's verdict reported.
#
# Paths are quoted throughout: this repo lives under "AI Projects", and an
# unquoted path splits on the space (LESSONS guard-word-split).

set -uo pipefail

# Derive the repo rather than hardcoding it: a hardcoded path goes permanently
# and silently inert the moment the checkout is renamed, moved, or cloned by
# anyone else -- which is itself a swallowed failure.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEARCH_FROM="${CLAUDE_PROJECT_DIR:-$SELF_DIR}"

resolve_primary() {
  local common
  common="$(git -C "$1" rev-parse --git-common-dir 2>/dev/null)" || return 1
  case "$common" in
    /*) ;;
    *) common="$(cd "$1" && cd "$(dirname "$common")" && pwd)/$(basename "$common")" ;;
  esac
  ( cd "$(dirname "$common")" && pwd )
}

PRIMARY="${MYK9_PRIMARY_CHECKOUT:-}"
if [ -z "$PRIMARY" ]; then
  PRIMARY="$(resolve_primary "$SEARCH_FROM" || true)"
  if [ -z "$PRIMARY" ]; then
    PRIMARY="$(resolve_primary "$SELF_DIR" || true)"
  fi
fi

if [ -z "$PRIMARY" ] || [ ! -d "$PRIMARY/.git" ]; then
  # Could not resolve a primary checkout. Report it -- going quiet here is
  # exactly the failure mode this script exists to end.
  printf 'PRIMARY CHECKOUT GUARD could not resolve a checkout (searched from %s). It is not guarding anything.\n' "$SEARCH_FROM"
  exit 0
fi

# --- local guard first -------------------------------------------------------
guard_output=""
guard_rc=0
guard_ran=0
GUARD="$PRIMARY/scripts/qa/primary-checkout.ts"
if [ -f "$GUARD" ]; then
  guard_output="$(cd "$PRIMARY" && node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$GUARD" 2>&1)"
  guard_rc=$?
  guard_ran=1
fi

# --- then the network pull, bounded ------------------------------------------
# Without these a dead remote hangs until the hook timeout kills everything.
pull_output="$(GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=10 git -C "$PRIMARY" pull --ff-only 2>&1)"
pull_rc=$?

# guard_rc 1 == found a problem. Anything else (127 node missing, 2 undecidable)
# means the guard could not run: a different statement, reported differently.
guard_found_problem=0
guard_broken=0
if [ "$guard_ran" -eq 1 ]; then
  if [ "$guard_rc" -eq 1 ]; then
    guard_found_problem=1
  elif [ "$guard_rc" -ne 0 ]; then
    guard_broken=1
  fi
fi

if [ "$pull_rc" -eq 0 ] && [ "$guard_found_problem" -eq 0 ] && [ "$guard_broken" -eq 0 ]; then
  exit 0
fi

if [ "$guard_broken" -eq 1 ]; then
  report="PRIMARY CHECKOUT GUARD COULD NOT RUN (exit ${guard_rc}) -- this is a broken guard, NOT a finding about the repo:
${guard_output}"
else
  report="PRIMARY CHECKOUT NEEDS ATTENTION"
fi

if [ "$pull_rc" -ne 0 ]; then
  report="${report}

git pull --ff-only FAILED in the primary checkout (exit ${pull_rc}):
${pull_output}"
fi
if [ "$guard_found_problem" -eq 1 ]; then
  report="${report}

${guard_output}"
fi
report="${report}

Until this is cleared the primary checkout falls further behind origin/main,
which produces false supabase db push --dry-run drift, stale node_modules, and
stale package dist. Agent worktrees are unaffected."

# jq -Rs handles the JSON escaping. Without jq, fall back to PLAIN STDOUT: a
# SessionStart hook that exits 0 surfaces stdout as context, so writing the
# message to stderr would hide it -- swallowing again, one `command -v` away.
if command -v jq > /dev/null 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}' "$(printf '%s' "$report" | jq -Rs .)"
else
  printf '%s\n' "$report"
fi

# Never block a session on this.
exit 0
