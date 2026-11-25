# shellcheck shell=bash
# The `Next:` line every review wrapper prints on exit (MYK9-2395), sourced by
# scripts/qa/agy-review.sh, scripts/qa/claude-review.sh and
# scripts/qa/codex-review.sh. The wrapper's exit code is the contract; this line
# tells the caller what to do with it, so the ship-pr skill points here instead
# of carrying its own copy of each code's meaning.
#
# Install with:  trap 'review_next_step $? "${REVIEW_NEXT_MODE:-}"' EXIT
# REVIEW_NEXT_MODE: "detached" (--detach started a run; 0 means started, not
# clean) or "relayed" (--wait is replaying the child's output, which already
# carries the child's own Next: line). Empty for a normal run.
#
# The trap never calls `exit`, so the script's exit status is unchanged.

review_next_step() {  # CODE MODE
  local code="$1" mode="${2:-}"
  [ "$mode" = relayed ] && return 0
  if [ "$mode" = detached ]; then
    if [ "$code" = 0 ]; then
      echo "Next: the review is running in the background. Poll it with --wait; this exit is not a verdict."
    else
      echo "Next: the background review did not start (see above). Fix the cause and run --detach again. Not a verdict."
    fi
    return 0
  fi
  case "$code" in
    0) echo "Next: clean for this head. A clean re-run does not check earlier rounds, so confirm each earlier finding was fixed. Any later push needs a new review." ;;
    1) echo "Next: fix the findings above, commit, push, and run the review again for the new head. Any clean evidence for this head has been withdrawn." ;;
    2) echo "Next: NOT a verdict. Read the lines above. If findings were posted they are real: fix them, and confirm older clean evidence was withdrawn before merging. Otherwise fix the cause and run again; if the reviewer itself is unavailable, use the owner override (ship-pr Step 3a)." ;;
    3) echo "Next: the review is still running. Call --wait again; this is not a verdict." ;;
    *) echo "Next: exit ${code} is outside the 0-3 contract: treat it as 2 (not a verdict) and run again." ;;
  esac
}
