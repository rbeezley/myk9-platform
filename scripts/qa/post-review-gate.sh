#!/usr/bin/env bash
# The ONLY writer of `Review gate:` evidence comments. An agent that ran a
# review calls this with the log; an agent that did not has no log to hash.
# Format contract: line 1 is the evidence line scripts/qa/review-gate.ts
# parses; line 2 is the sha256 of the review log; the rest is the verdict
# block, fenced, so the PR carries what the reviewer actually said.
#
# With --withdraw it writes the MIRROR of that: an evidence line the checker
# REJECTS, so a re-review that finds defects turns a green gate red. Without it
# a second review of the same head could only add a findings comment, which
# `review-gate.ts` never reads, leaving the earlier clean attestation as the
# latest evidence for a SHA now known to be defective (Codex review of #2115,
# round 3). A withdrawal is refused unless the verdict really is one the
# checker rejects and the log really does carry findings — it can only ever
# make the gate redder.
#
# Usage: post-review-gate.sh [--withdraw] <pr> <codex|claude|adversarial|none|owner> <base-sha> <head-sha> "<verdict>" <log>
# Exit:  0 posted · 2 refused (bad reviewer/verdict grammar, missing or
#        malformed owner env vars, or — codex/claude/adversarial only —
#        an empty/incomplete log); nothing posted
#
# `owner` and `none` have no review log BY DEFINITION (owner defers scrutiny
# entirely; none asserts the paths were low-risk enough that no review ran),
# so <log> is exempt from every log-SHAPE check below for those two tiers:
# it may be missing, empty, or a plain note — it is never required to look
# like a completed review. Requiring that shape was a real hole (not merely
# an unflagged one): the only route through it was to type a sentence
# asserting "no actionable findings" from a review that never happened, and
# an honest log ("Codex unavailable, no review was run") was REFUSED. A tool
# whose own escape hatch can only be used by lying is worse than no escape
# hatch. <log> is still hashed and quoted verbatim when the caller supplies
# one (real provenance, never fabricated); codex/claude/adversarial keep
# every check as before, because those tiers DO have a log.
#
# The `adversarial` tier requires REVIEW_LENSES in the environment: the
# newline-separated NAMES of the lenses that were run, two or more. They are
# emitted as `Adversarial subagent review: <name>` body lines, which
# review-gate.ts parses, and the gate refuses adversarial evidence whose body
# names fewer than two, and the verdict's <N>
# must equal the number of distinct lenses named. When the base..head
# diff can be resolved locally and touches supabase/migrations/, one lens must
# be exactly `migration-auditor` — refused here by name, and independently
# enforced by the gate (which always has the real file list).
#
# The `owner` tier additionally requires OVERRIDE_REASON="<harness>
# unavailable — <detail>" (or "convergence stop — <detail>", the honest wording
# for a reviewer that IS available when the convergence rule says to stop the
# round) and DEFERRED_REVIEW=<ISSUE-ID> in the environment
# — checked for PRESENCE and, via review-gate.ts (the same parser that will
# judge the posted comment), for SHAPE, so `DEFERRED_REVIEW=myk9-523` or
# `OVERRIDE_REASON="I was busy"` is refused here instead of posting
# successfully and then failing the real gate. They are appended as the 2nd
# and 3rd lines of the comment body. When the base..head diff resolves
# locally, the verdict's claimed floor is also checked against the real one
# (scripts/qa/review-tier.ts --files-stdin) — the gate refuses a mismatch, so
# posting one only produces a confusing red.
#
# POST_REVIEW_GATE_DRY_RUN=1 validates the reviewer token, the owner-tier env
# vars and the verdict-vs-tier grammar, then exits 0 WITHOUT touching the log
# or calling gh — so a contract test can probe reviewer/tier validation
# without a real review log or a live PR. It runs BEFORE the (tier-gated)
# log checks, so it proves nothing about them — a separate, non-dry-run test
# with a stub `gh` is what exercises owner/none's real posting path.
set -euo pipefail
WITHDRAW=0
if [ "${1:-}" = "--withdraw" ]; then WITHDRAW=1; shift; fi
PR="$1"; REVIEWER="$2"; BASE="$3"; HEAD="$4"; VERDICT="$5"; LOG="$6"
GH="${GH_BIN:-gh}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# One definition of "clean verdict", shared with both review wrappers.
# shellcheck source=scripts/qa/review-verdict.sh
. "$HERE/review-verdict.sh"

# Line terminators, as a CLASS. Every value this script publishes verbatim into
# a comment body passes through one of these two checks, so no value can smuggle
# an extra rendered line — in particular a forged `Review gate:` line — into the
# record written by the one script whose premise is that nobody types an
# evidence line by hand.
#
# The class is CR, LF, U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH
# SEPARATOR). CR and LF are CommonMark line endings AND JavaScript `/m`
# terminators; U+2028/U+2029 are JS `/m` terminators only (they render inline),
# but defeating the shape probe with an invisible character is still a hole.
# `\n` alone once let a bare CR through, and CR-plus-U+2028 once let U+2029
# through (fallback review of #2243, M3) — hence one named class, two callers.
has_inline_terminator() {  # CR / U+2028 / U+2029 — anything but a bare LF
  case "$1" in
    *$'\r'*|*$'\xe2\x80\xa8'*|*$'\xe2\x80\xa9'*) return 0;;
  esac
  return 1
}
has_any_terminator() {  # the above, plus LF
  case "$1" in
    *$'\n'*) return 0;;
  esac
  has_inline_terminator "$1"
}

case "$REVIEWER" in
  codex|claude|adversarial|none|owner) ;;
  *) echo "post-review-gate: reviewer must be codex, claude, adversarial, none or owner" >&2; exit 2;;
esac

# The `adversarial` tier's lens attestation. Checked here, before the dry-run
# exit, so the poster and the gate agree about what an adversarial record must
# carry instead of the poster publishing a body the gate will refuse.
if [ "$REVIEWER" = "adversarial" ]; then
  [ -n "${REVIEW_LENSES:-}" ] || { echo "post-review-gate: adversarial tier needs REVIEW_LENSES=<one lens name per line, 2 or more>" >&2; exit 2; }
  LENS_LINES="$(printf '%s\n' "$REVIEW_LENSES" | sed -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//' | grep -v '^$' || true)"
  # Distinct names: the tier's substance is two INDEPENDENT bug-finding lenses,
  # so the same lens listed twice is one lens. The gate applies the same rule.
  LENS_COUNT="$(printf '%s\n' "$LENS_LINES" | sort -u | grep -c '.' || true)"
  if [ "${LENS_COUNT:-0}" -lt 2 ]; then
    echo "post-review-gate: adversarial tier needs at least 2 distinct lens names in REVIEW_LENSES (got ${LENS_COUNT:-0})" >&2
    exit 2
  fi
  # A lens name is published verbatim into the comment body, so it may never
  # forge another evidence line. TWO rules, because each misses what the other
  # catches: the grep sees an LF-separated entry that BEGINS "Review gate:",
  # and the terminator check sees a CR / U+2028 / U+2029 smuggled INSIDE an
  # entry, which the grep cannot — it splits on LF only. A raw CR mid-entry
  # published a second, human-visible forged evidence line at exit 0 (fallback
  # review of #2243, M2); this is the owner tier's guard, reused verbatim.
  # LF itself is the legitimate separator here, so only the inline class is
  # refused; an LF entry that forges a line is caught by the grep below.
  if has_inline_terminator "$REVIEW_LENSES"; then
    echo "post-review-gate: a REVIEW_LENSES entry may not contain a line-terminator character (CR, U+2028 or U+2029)" >&2
    exit 2
  fi
  if printf '%s\n' "$LENS_LINES" | grep -qi '^Review gate:'; then
    echo "post-review-gate: a REVIEW_LENSES entry may not begin with 'Review gate:'" >&2
    exit 2
  fi
  # The verdict's <N> is a number the CALLER typed; LENS_COUNT is what the
  # record will actually name. Unbound, "9 lenses, all findings addressed" over
  # a two-lens body went green (fallback review of #2243, M5). Refuse the
  # mismatch here so the poster and the gate — which applies the same rule in
  # adversarialBodyProblem — never disagree.
  # `case`, not sed: BSD sed (this repo's own macOS dev machine) has no `\|`
  # alternation in a BRE, so a `lens\|lenses` pattern silently matched NOTHING
  # and the check was inert — it exited 0 on a "9 lenses" verdict over a
  # two-lens body, i.e. it reported the very bug it was added to close.
  VERDICT_LOWER="$(printf '%s' "$VERDICT" | tr '[:upper:]' '[:lower:]')"
  VERDICT_LENS_COUNT=""
  case "$VERDICT_LOWER" in
    [0-9]*' lens, all findings addressed'|[0-9]*' lenses, all findings addressed'|[0-9]*' lens, all findings addressed.'|[0-9]*' lenses, all findings addressed.')
      VERDICT_LENS_COUNT="${VERDICT_LOWER%% *}"
      case "$VERDICT_LENS_COUNT" in *[!0-9]*) VERDICT_LENS_COUNT="";; esac;;
  esac
  if [ -n "$VERDICT_LENS_COUNT" ] && [ "$VERDICT_LENS_COUNT" -ne "$LENS_COUNT" ]; then
    echo "post-review-gate: verdict claims $VERDICT_LENS_COUNT lenses but REVIEW_LENSES names $LENS_COUNT distinct; nothing posted" >&2
    exit 2
  fi
  # Migration diffs need the migration-auditor lens. Resolved from git in the
  # CURRENT working tree (the poster is always run from the repo it is posting
  # about); when the SHAs are not present locally — a shallow clone, a fixture
  # — this check simply does not fire, and the gate re-checks it against the
  # PR's real file list either way, so the record can never go green without
  # the lens.
  MIGRATION_FILES="$(git diff --name-only "$BASE...$HEAD" 2>/dev/null | grep '^supabase/migrations/' || true)"
  if [ -n "$MIGRATION_FILES" ] && ! printf '%s\n' "$LENS_LINES" | grep -qx 'migration-auditor'; then
    echo "post-review-gate: this diff touches supabase/migrations/, so one REVIEW_LENSES entry must be exactly 'migration-auditor'" >&2
    exit 2
  fi
fi

# The `owner` tier defers scrutiny rather than skipping it, so it needs a
# reason (which harness was unavailable and why) and a tracked issue to
# re-review later — without either there is no debt record and the override
# is refused. Checked before the verdict/log work below so a caller who
# forgot the env vars gets a fast, cheap failure.
if [ "$REVIEWER" = "owner" ]; then
  [ -n "${OVERRIDE_REASON:-}" ] || { echo "post-review-gate: owner tier needs OVERRIDE_REASON=\"<harness> unavailable — <detail>\" or \"convergence stop — <detail>\"" >&2; exit 2; }
  [ -n "${DEFERRED_REVIEW:-}" ] || { echo "post-review-gate: owner tier needs DEFERRED_REVIEW=<ISSUE-ID>" >&2; exit 2; }
  # Reject any LINE-TERMINATOR character BEFORE the shape probe below. The
  # probe's regexes (review-gate.ts's OVERRIDE_REASON/DEFERRED_REVIEW) are
  # `m`-flagged because the GATE side legitimately needs to find the line
  # within a multi-line PR comment body read back from GitHub — but that
  # same `m` means the PROBE asks "does some line of this value match", not
  # "is this value one well-formed line". A caller could then smuggle a
  # second line — including a forged `Review gate: ...` line — straight
  # into the published comment. It cannot fool the checker (parseGateComments
  # only ever reads line 1), but it is a human-visible forgery from the one
  # script whose whole premise is that nobody types an evidence line by
  # hand. Checked here, on the RAW env values, not the gate's regexes, so
  # the gate's own multi-line search over real GitHub bodies is untouched.
  #
  # The class itself lives in has_any_terminator above (CR, LF, U+2028,
  # U+2029) — it has been widened twice by review, which is exactly why it is
  # one named function now rather than two hand-copied `case` patterns.
  if has_any_terminator "$OVERRIDE_REASON"; then
    echo "post-review-gate: OVERRIDE_REASON must be a single line (no line-terminator characters)" >&2
    exit 2
  fi
  if has_any_terminator "$DEFERRED_REVIEW"; then
    echo "post-review-gate: DEFERRED_REVIEW must be a single line (no line-terminator characters)" >&2
    exit 2
  fi
  # Presence alone reopens the same disagreement --reviewer just closed for
  # verdicts: "I was busy" and "myk9-523" are both non-empty and would post
  # successfully, then fail the real gate (overrideAccepted's OVERRIDE_REASON
  # / DEFERRED_REVIEW regexes in review-gate.ts). Ask that parser, not a copy.
  if ! node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
    "$HERE/review-gate.ts" --override-reason-line "Override reason: $OVERRIDE_REASON"; then
    echo "post-review-gate: OVERRIDE_REASON must read \"<harness> unavailable — <detail>\" or \"convergence stop — <detail>\" (got: \"$OVERRIDE_REASON\")" >&2
    exit 2
  fi
  if ! node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
    "$HERE/review-gate.ts" --deferred-review-line "Deferred re-review: $DEFERRED_REVIEW"; then
    echo "post-review-gate: DEFERRED_REVIEW must be an issue id like MYK9-523 (uppercase prefix; got: \"$DEFERRED_REVIEW\")" >&2
    exit 2
  fi
  # The claimed floor, checked against the REAL one — the same check
  # evaluateReviewGate runs after the comment is posted. Until now the poster
  # published a claim the gate would then refuse, which is precisely the
  # poster/judge disagreement `--reviewer` closed for verdicts and the two
  # shape probes closed for the body lines (fallback review of #2243, S-c; the
  # file's own comments claimed the two sides already agreed here). Resolved
  # from git in the CURRENT working tree, exactly like the migration-lens check
  # above: when the SHAs are not present locally — a shallow clone, a fixture —
  # it does not fire, and the gate re-checks it against the PR's real file list
  # either way, so the record can never go green on a misstated floor.
  OWNER_DIFF="$(git diff --name-only "$BASE...$HEAD" 2>/dev/null || true)"
  if [ -n "$OWNER_DIFF" ]; then
    CLAIMED_FLOOR="$(printf '%s' "$VERDICT" | tr '[:upper:]' '[:lower:]' | sed -n 's/^override, floor was \([a-z][a-z]*\)\.\{0,1\}$/\1/p')"
    REAL_FLOOR="$(printf '%s\n' "$OWNER_DIFF" | node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$HERE/review-tier.ts" --files-stdin)"
    if [ -n "$CLAIMED_FLOOR" ] && [ "$CLAIMED_FLOOR" != "$REAL_FLOOR" ]; then
      echo "post-review-gate: override claims floor was $CLAIMED_FLOOR, but the real floor for $BASE...$HEAD is $REAL_FLOOR; nothing posted" >&2
      exit 2
    fi
  fi
fi

# ONE grammar: ask the parser that will judge the comment, never a copied
# regex. `--reviewer` binds the check to THIS reviewer's own tier grammar so
# a codex/independent line wearing an owner/adversarial verdict phrase is
# refused here instead of being posted and then refused by the real gate.
VERDICT_ACCEPTED=0
if node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  "$HERE/review-gate.ts" --reviewer "$REVIEWER" --verdict "$VERDICT"; then
  VERDICT_ACCEPTED=1
fi

if [ "${POST_REVIEW_GATE_DRY_RUN:-}" = "1" ]; then
  if [ "$WITHDRAW" = 1 ]; then
    if [ "$VERDICT_ACCEPTED" = 1 ]; then
      echo "post-review-gate: [dry run] '$VERDICT' is a CLEAN verdict, so it cannot withdraw anything; nothing posted" >&2
      exit 2
    fi
  elif [ "$VERDICT_ACCEPTED" != 1 ]; then
    echo "post-review-gate: [dry run] verdict '$VERDICT' is outside the '$REVIEWER' tier grammar; nothing posted" >&2
    exit 2
  fi
  echo "post-review-gate: [dry run] '$VERDICT' accepted for reviewer '$REVIEWER'; nothing posted"
  exit 0
fi

if [ "$WITHDRAW" = 1 ]; then
  if [ "$VERDICT_ACCEPTED" = 1 ]; then
    echo "post-review-gate: '$VERDICT' is a CLEAN verdict, so it cannot withdraw anything; nothing posted" >&2
    exit 2
  fi
elif [ "$VERDICT_ACCEPTED" != 1 ]; then
  echo "post-review-gate: verdict '$VERDICT' is outside the gate grammar (review-gate.ts verdictAccepted); nothing posted" >&2
  exit 2
fi
# codex/claude/adversarial reviewers DO have a log; owner and none never do
# by definition (see the header comment). Every log-SHAPE check below is
# gated on HAS_REVIEW_LOG so it applies only where a log is meaningful —
# skipping it for owner/none is not a loophole, it is the fix: before this,
# the only way to satisfy these shape checks with no real review was to
# WRITE a false "no actionable findings" sentence, which the checks then
# happily hashed and published as provenance. An honest "no review ran"
# note was refused. Nothing here relaxes codex/claude/adversarial.
case "$REVIEWER" in
  owner|none) HAS_REVIEW_LOG=0 ;;
  *) HAS_REVIEW_LOG=1 ;;
esac

# A withdrawal is an ASSERTION OF FINDINGS, not a clean post, whatever the
# tier — the log-optional exemption above is for the "no review ran" case,
# which only ever applies to a CLEAN owner/none post. Gating the log
# requirement on HAS_REVIEW_LOG alone let `--withdraw none/owner ... /dev/null`
# post an evidence-free withdrawal: any trusted COLLABORATOR could red-flag a
# head nothing objected to, with no log at all (round 2 finding — proven with
# a real end-to-end run: a genuine review posted, then withdrawn by a
# different trusted author with zero evidence). REQUIRES_LOG folds WITHDRAW
# back in so a withdrawal always needs a log to hash and check for [P*]
# bullets, regardless of reviewer tier.
REQUIRES_LOG="$HAS_REVIEW_LOG"
[ "$WITHDRAW" = 1 ] && REQUIRES_LOG=1

if [ "$REQUIRES_LOG" = 1 ] && [ ! -s "$LOG" ]; then
  echo "post-review-gate: log '$LOG' is empty or missing; nothing posted" >&2
  exit 2
fi

LOG_SUPPLIED=0
if [ -s "$LOG" ] 2>/dev/null; then
  LOG_SUPPLIED=1
  HASH="$(shasum -a 256 "$LOG" | cut -d' ' -f1)"
  # Codex logs carry a `codex` marker line before the verdict; `claude -p`
  # output has no marker, so the whole log is the verdict. Never a `tail`: a
  # long clean Claude review would lose its opening contract sentence and be
  # refused (Codex review of #2110, round 9).
  VERDICT_BLOCK="$(review_last_block "$LOG")"
  [ -n "$VERDICT_BLOCK" ] || VERDICT_BLOCK="$(cat "$LOG")"
else
  # Only reachable for owner/none on a NON-WITHDRAW post: REQUIRES_LOG folds
  # WITHDRAW in above, so a withdrawal (any tier) already exited on an
  # empty/missing log before we get here — this branch is a CLEAN owner/none
  # post with no log supplied. No fabricated "clean review" text — say
  # plainly that there is no log, because for that case there isn't one.
  HASH="n/a"
  VERDICT_BLOCK="(no review log — $REVIEWER tier)"
fi

# The log must SUPPORT the verdict. The poster is reachable without the Codex
# wrapper (the Claude path calls it directly), so it re-checks what the wrapper
# checks: an interrupted or incomplete review is never evidence, and "no
# findings" needs a clean sentence in the log, not just a caller's say-so.
#
# Completeness gates ATTESTATIONS only. A review that found a defect and then
# hit a blocker has still found a defect, and refusing its withdrawal would
# leave an earlier clean attestation standing over a head now known to be
# broken — the completeness rule protecting the very state it exists to
# prevent (Codex review of #2115, round 4). A withdrawal still has to carry
# [P*] bullets, which is checked below.
if [ "$HAS_REVIEW_LOG" = 1 ] && [ "$WITHDRAW" != 1 ] &&
  { grep -Eq "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG" ||
    review_text_imatches '\bunable to complete the review\b|\breview (did not run|was interrupted)\b' "$VERDICT_BLOCK"; }; then
  echo "post-review-gate: log does not support any verdict (review did not complete); nothing posted" >&2
  exit 2
fi
if [ "$WITHDRAW" = 1 ]; then
  # A withdrawal is the mirror image: it must be backed by a log that really
  # does carry findings, so "withdraw" cannot be used to red-flag a head
  # nothing objected to. Gated on WITHDRAW alone (not HAS_REVIEW_LOG) so this
  # is true for EVERY reviewer token, including owner/none — REQUIRES_LOG
  # above already guaranteed a non-empty $LOG by the time we get here.
  if ! review_text_matches "$REVIEW_FINDING_BULLET" "$VERDICT_BLOCK"; then
    echo "post-review-gate: log does not support withdrawing '$VERDICT' (it carries no [P*] bullets); nothing posted" >&2
    exit 2
  fi
fi
# Both accepted verdicts describe a CLEAN final log: "N findings, all
# addressed" means the reviewer was re-run on the fixed head and that re-run
# came back clean, so the log it is posted with must pass the same checks
# (Codex review of #2110, round 8). No verdict form skips them.
# Gated on LOG_SUPPLIED, not HAS_REVIEW_LOG: owner/none never NEED a log, but
# when one is supplied it is hashed and quoted into the comment as provenance,
# and a clean verdict published directly above a quoted `[P1] ...` bullet is a
# record that asserts more than what happened (final whole-branch review, F8).
# This does NOT reintroduce the inverted property it replaced: the log stays
# OPTIONAL for owner/none, and an honest log that carries no findings bullets
# ("Codex unavailable, no review was run") is still accepted — only a
# findings-laden log under a clean verdict is refused.
if [ "$LOG_SUPPLIED" = 1 ] && [ "$WITHDRAW" != 1 ]; then
  if review_text_matches "$REVIEW_FINDING_BULLET" "$VERDICT_BLOCK"; then
    echo "post-review-gate: log does not support '$VERDICT' (it still carries [P*] bullets); nothing posted" >&2
    exit 2
  fi
fi
if [ "$HAS_REVIEW_LOG" = 1 ] && [ "$WITHDRAW" != 1 ]; then
  # Not free text: both review wrappers instruct the reviewer to open a clean
  # verdict with the CONTRACT sentence "No actionable <findings> ..." and
  # nothing else counts. "No findings yet; only the workflow file has been
  # inspected" is a clean-looking sentence about an incomplete review, and any
  # regex that guesses at completeness from prose will be fooled by the next
  # phrasing (Codex review of #2110, round 7). The sentence rule itself lives in
  # review-verdict.sh — the same one codex-review.sh and claude-review.sh apply.
  if ! review_verdict_is_clean "$VERDICT_BLOCK"; then
    echo "post-review-gate: log does not support '$VERDICT' (first paragraph lacks the contract sentence 'No actionable ...'); nothing posted" >&2
    exit 2
  fi
fi
if [ "$REVIEWER" = "adversarial" ]; then
  # Adversarial tier: the lens attestation lines come first, ahead of the log
  # hash — the tier's whole claim is WHICH lenses looked, and review-gate.ts's
  # adversarialBodyProblem refuses the evidence when fewer than two are named
  # (or when a migration diff's lenses omit migration-auditor).
  LENS_BLOCK="$(printf '%s\n' "$LENS_LINES" | sed 's/^/Adversarial subagent review: /')"
  BODY="$(printf 'Review gate: %s reviewed %s..%s — %s\n%s\nlog sha256: %s\n\n<details><summary>%s verdict</summary>\n\n```text\n%s\n```\n\n</details>\n' \
    "$REVIEWER" "${BASE:0:9}" "${HEAD:0:9}" "$VERDICT" "$LENS_BLOCK" "$HASH" "$REVIEWER" "$VERDICT_BLOCK")"
elif [ "$REVIEWER" = "owner" ]; then
  # Owner tier: Override reason and Deferred re-review are the 2nd and 3rd
  # lines, ahead of the log hash — overrideAccepted (review-gate.ts) matches
  # them anywhere in the body via `m`, but the brief fixes their position so
  # the override's own contract reads first, before the log provenance line.
  BODY="$(printf 'Review gate: %s reviewed %s..%s — %s\nOverride reason: %s\nDeferred re-review: %s\nlog sha256: %s\n\n<details><summary>%s verdict</summary>\n\n```text\n%s\n```\n\n</details>\n' \
    "$REVIEWER" "${BASE:0:9}" "${HEAD:0:9}" "$VERDICT" "$OVERRIDE_REASON" "$DEFERRED_REVIEW" "$HASH" "$REVIEWER" "$VERDICT_BLOCK")"
else
  BODY="$(printf 'Review gate: %s reviewed %s..%s — %s\nlog sha256: %s\n\n<details><summary>%s verdict</summary>\n\n```text\n%s\n```\n\n</details>\n' \
    "$REVIEWER" "${BASE:0:9}" "${HEAD:0:9}" "$VERDICT" "$HASH" "$REVIEWER" "$VERDICT_BLOCK")"
fi
"$GH" pr comment "$PR" --body "$BODY"
echo "post-review-gate: posted '$VERDICT' for ${HEAD:0:9} on #$PR (log sha256 ${HASH:0:12})"
