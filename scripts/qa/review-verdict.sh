# shellcheck shell=bash
# The ONE definition of "the reviewer asserted a clean verdict", sourced by
# scripts/qa/codex-review.sh, scripts/qa/claude-review.sh and
# scripts/qa/post-review-gate.sh. Three copies of a sentence rule is how a gate
# quietly starts accepting different things from each caller — the same reason
# post-review-gate.sh asks review-gate.ts about the evidence grammar instead of
# carrying its own regex.
#
# Only the first non-empty paragraph can certify a review (MYK9-415): a clean
# assertion after a "the review could not finish" opening is not a verdict.
#
# The sentence, not just its opening. The noun varies — "defects",
# "regressions", "correctness, security, or data-flow regressions" — so the
# earlier rule matched the prefix "No actionable" alone, and that accepted
# "No actionable verdict is available; only one file has been inspected."
# as clean (Codex review of #2115, P2). The sentence must therefore assert the
# absence of FINDINGS: some finding noun has to appear before the sentence ends.

# A finding bullet. Codex writes `- [P2] ...`; Claude's /code-review writes
# `- **[P2]** ...` with the brackets bolded, and on 2026-09-07 a ten-minute
# review of #2124 that reported two real findings was discarded as
# "unrecognized output" because only the plain form was matched. Bold is
# optional on both sides of the bracket; the priority digit is what counts.
REVIEW_FINDING_BULLET='^[[:space:]]*- (\*\*)?\[P[0-9]\](\*\*)?'

# The clean-verdict sentence, anchored nowhere: callers add the anchor.
REVIEW_CLEAN_SENTENCE='No actionable[^.!?]*\b(defect|defects|regression|regressions|issue|issues|finding|findings|problem|problems|concern|concerns|bug|bugs|risk|risks)\b'

# Join the wrapped lines of the first non-empty paragraph so sentence matching
# behaves the same across line wraps.
review_first_paragraph() {
  printf '%s\n' "$1" | awk '
    /^[[:space:]]*$/ { if (started) exit; next }
    { printf "%s%s", started ? " " : "", $0; started=1 }
  '
}

# 0 when the text opens with a clean-verdict sentence, 1 otherwise. Clean is a
# POSITIVE match, never the absence of findings: "Unable to complete the review"
# has no [P*] bullets either, and the first wrapper certified exactly that as
# clean (Codex review of #2063, P1).
#
# Two arms, and the second is case-SENSITIVE on purpose. Mid-string, only a
# capitalised "No" is a sentence opening; accepting lowercase after any [.!?]
# would let an ellipsis in "the run stopped... no actionable verdict" read as
# clean, which is the exact class of false pass this guards.
review_verdict_is_clean() {
  local paragraph
  paragraph="$(review_first_paragraph "$1")"
  printf '%s' "$paragraph" | grep -Eiq "^[[:space:]]*${REVIEW_CLEAN_SENTENCE}" && return 0
  printf '%s' "$paragraph" | grep -Eq "[.!?][[:space:]]+${REVIEW_CLEAN_SENTENCE}" && return 0
  return 1
}
