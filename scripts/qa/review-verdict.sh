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
# ...and Claude's /code-review also writes `- \`path:line\` — [P2] ...` with the
# tag AFTER the location (a ten-minute review of #2124 on 2026-09-07 was
# discarded as "unrecognized output" for this). Exactly those shapes and no
# more: a prose bullet that merely mentions "[P1]" is not a finding (Codex
# review of #2130). Shape 3 = a backticked location, then a hyphen, en dash
# or em dash (spelled out; a wildcard here matched the word "is"), then the tag.
REVIEW_FINDING_BULLET='^[[:space:]]*- ((\*\*)?\[P[0-9]\]|`[^`]+`[[:space:]]*(-|–|—)[[:space:]]*(\*\*)?\[P[0-9]\])'

# Structured findings (MYK9-1209) are PARSED, not sniffed. Claude's review can
# emit its findings as a fenced JSON array of {"file", "line", "summary",
# "failure_scenario"} objects instead of bullets. On 2026-10-15 a review of
# #3003 opened with "No actionable defects found is not the verdict here,
# because I found three." and then listed three such objects; no line matched
# REVIEW_FINDING_BULLET and the prose opening read as clean, so "no findings"
# was posted over three findings. Key-sniffing regexes were tried first and
# both over- and under-matched (a quoted schema reads as findings), so a fenced
# ```json block (or an unlabelled ``` block starting with `[`) counts only when
# it PARSES to a non-empty array whose every element is an object with string
# `file`, `summary` and `failure_scenario`. Anything else is ignored.
REVIEW_FINDINGS_PARSER='
const t = require("fs").readFileSync(0, "utf8");
const re = /^[ \t]*```([A-Za-z]*)[ \t]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
let n = 0, m;
while ((m = re.exec(t)) !== null) {
  const lang = m[1].toLowerCase(), body = m[2];
  if (!(lang === "json" || (lang === "" && body.trimStart().startsWith("[")))) continue;
  try {
    const a = JSON.parse(body);
    if (Array.isArray(a) && a.length > 0 && a.every((o) => o && typeof o === "object" && !Array.isArray(o) &&
        ["file", "summary", "failure_scenario"].every((k) => typeof o[k] === "string"))) n += a.length;
  } catch (e) {}
}
console.log(n);
'

# SIGPIPE-safe matching. Every wrapper runs under `pipefail`, and
# `echo "$VERDICT" | grep -q` fails on a large verdict: grep exits at the
# first match, the writer takes SIGPIPE, and the pipeline reads as "no match".
# On 2026-09-07 a 184 KB Codex verdict with real findings was reported as
# "unrecognized output" this way (#2127, round 8). `grep -c` reads all input.
review_text_matches() {  # PATTERN TEXT  (case-sensitive)
  [ "$(printf '%s\n' "$2" | grep -Ec "$1")" -gt 0 ]
}
review_text_imatches() {  # PATTERN TEXT  (case-insensitive)
  [ "$(printf '%s\n' "$2" | grep -Eic "$1")" -gt 0 ]
}

# Number of findings reported as parsed JSON arrays (see REVIEW_FINDINGS_PARSER).
# Reads all of stdin, so it is SIGPIPE-safe. Text with no ``` fence never needs
# node. FAIL CLOSED: when a fence is present and the parser did not run (node
# missing or exited non-zero) this returns 1 with no count, which is different
# from "parsed, found nothing" (0 and status 0). REVIEW_NODE_BIN overrides node.
review_json_finding_count() {  # TEXT
  if ! review_text_matches '^[[:space:]]*```' "$1"; then
    echo 0
    return 0
  fi
  local n
  n="$(printf '%s\n' "$1" | "${REVIEW_NODE_BIN:-node}" -e "$REVIEW_FINDINGS_PARSER" 2>/dev/null)" || return 1
  case "$n" in '' | *[!0-9]*) return 1 ;; esac
  echo "$n"
}

# 0 when the text carries findings in ANY recognised shape: bullet or JSON array.
review_has_findings() {  # TEXT
  review_text_matches "$REVIEW_FINDING_BULLET" "$1" ||
    [ "$(review_json_finding_count "$1" || echo 0)" -gt 0 ]
}
# How many findings (bullets plus JSON array elements), for "N findings" evidence.
review_finding_count() {  # TEXT
  local b j
  b="$(printf '%s\n' "$1" | grep -Ec "$REVIEW_FINDING_BULLET" || true)"
  j="$(review_json_finding_count "$1" || echo 0)"
  echo $((${b:-0} + ${j:-0}))
}

# The verdict is the text after the LAST `codex` marker line; the CLI prints
# one marker per assistant message, and a review log can carry several
# (reasoning, tool output, then the verdict). Falls back to the whole file when
# there is no marker (claude -p prints none).
review_last_block() {  # FILE
  awk '/^codex$/{buf=""; f=1; next} f{buf=buf $0 "\n"} END{printf "%s", buf}' "$1"
}

# The clean-verdict sentence, by EXACT SHAPE (MYK9-1209), never by a list of
# disqualifying words: `No actionable <qualifiers> <finding noun> [[was|were]
# <found|identified|...>] [in|on|... <short scope>]` and then a terminator
# (. ; : or end of paragraph). "No actionable defects found is not the verdict
# here, because I found three." fails because the sentence continues after
# `found`. Whatever follows the terminator is free text (caveats and history).
# Qualifiers ("correctness, security, or data-flow") are a few plain words; the
# match is checked so they hold no verb or conjunction ("No actionable verdict
# is found for defects found." is not clean).
REVIEW_CLEAN_NOUN='(defect|regression|issue|finding|problem|concern|bug|risk)s?'
# A word may hold a dot only between characters (SKILL.md), never trailing: a
# trailing dot is a sentence terminator, and letting words swallow it lets the
# longest-match engine stretch the shape across two sentences.
REVIEW_CLEAN_WORD='([A-Za-z0-9_/-]|\.[A-Za-z0-9])+'
REVIEW_CLEAN_SHAPE="No actionable +((${REVIEW_CLEAN_WORD},? +){0,6})${REVIEW_CLEAN_NOUN}(( +(was|were))? +(found|identified|detected|reported|observed))?( +(in|on|across|within|during|after|for) +(${REVIEW_CLEAN_WORD},? +){0,7}${REVIEW_CLEAN_WORD})?(([.;:]([[:space:]]|\$))|[[:space:]]*\$)"

# 0 when the first sentence-shaped match is a clean one. $1 = prefix pattern.
_review_clean_match() {  # PREFIX PARAGRAPH
  local qual
  [[ "$2" =~ $1$REVIEW_CLEAN_SHAPE ]] || return 1
  qual=" ${BASH_REMATCH[1]} "  # group 1 of the shape; the prefixes hold no groups
  [[ "$qual" =~ [[:space:]](is|are|was|were|not|but|because|for|found|however|would|could)[[:space:],] ]] && return 1
  return 0
}

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
  local text="$1" paragraph hit=1
  # Structured findings override whatever the prose says.
  review_has_findings "$text" && return 1
  # Fail closed: a fenced block the parser could not examine may hold findings.
  review_json_finding_count "$text" > /dev/null || return 1
  paragraph="$(review_first_paragraph "$text")"
  shopt -s nocasematch
  _review_clean_match '^[[:space:]]*' "$paragraph" && hit=0
  shopt -u nocasematch
  [ "$hit" = 0 ] && return 0
  _review_clean_match '[.!?][[:space:]]+' "$paragraph" && return 0
  return 1
}
