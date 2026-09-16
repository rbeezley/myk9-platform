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
# A hook that cannot fail is not a guard. This one still never blocks a session
# (it always exits 0) but it reports the problem into the session transcript.
#
# Paths are quoted throughout: this repo lives under "AI Projects", and an
# unquoted path splits on the space (LESSONS guard-word-split).

set -uo pipefail

PRIMARY="${MYK9_PRIMARY_CHECKOUT:-/Users/richardbeezley/AI Projects/myk9-platform}"

if [ ! -d "$PRIMARY/.git" ]; then
  exit 0
fi

pull_output="$(git -C "$PRIMARY" pull --ff-only 2>&1)"
pull_rc=$?

# The guard may legitimately be absent: an older primary checkout, or one that
# predates this script landing on main. A missing guard is "nothing to add",
# never a failure -- otherwise the hook cries wolf on a perfectly clean repo.
guard_output=""
guard_rc=0
if [ -f "$PRIMARY/scripts/qa/primary-checkout.ts" ]; then
  guard_output="$(cd "$PRIMARY" && node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/primary-checkout.ts 2>&1)"
  guard_rc=$?
fi

if [ "$pull_rc" -eq 0 ] && [ "$guard_rc" -eq 0 ]; then
  exit 0
fi

report="PRIMARY CHECKOUT NEEDS ATTENTION"
if [ "$pull_rc" -ne 0 ]; then
  report="${report}

git pull --ff-only FAILED in the primary checkout (exit ${pull_rc}):
${pull_output}"
fi
if [ "$guard_rc" -ne 0 ]; then
  report="${report}

${guard_output}"
fi
report="${report}

Until this is cleared the primary checkout falls further behind origin/main,
which produces false supabase db push --dry-run drift, stale node_modules, and
stale package dist. Agent worktrees are unaffected."

# jq -Rs handles the JSON string escaping; without jq, degrade to plain stderr
# rather than emitting malformed JSON.
if command -v jq > /dev/null 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}' "$(printf '%s' "$report" | jq -Rs .)"
else
  printf '%s\n' "$report" >&2
fi

# Never block a session on this.
exit 0
