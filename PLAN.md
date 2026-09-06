# MYK9-416 — explicit Codex review verdict contract

Status: Implemented and verified; awaiting PR/merge

Use issue option 1: instruct the reviewer to emit the wording the gate already
requires. Keep whole-branch review and positive-match, fail-closed parsing.
This narrow tooling fix uses the lightweight workflow, not OPSX.

1. Add an invocation-level regression test and demonstrate it failing.
2. Supply review-only developer instructions through CLI configuration because
   `codex review --base` rejects a positional prompt. Preserve finding exit 1
   and incomplete/unrecognized exit 2 (the issue's request for findings exit 2
   conflicts with the documented existing contract).
3. Test the wrapper and review-gate checker, shell syntax, and whitespace.
4. Run three consecutive real wrapper reviews; record logs and evidence before
   considering the issue's real-run acceptance criterion satisfied.

No product surfaces, parser broadening, or automatic clean inference.

## Verification

- Regression first: 18 tests passed, the new invocation-contract test failed
  because the original wrapper supplied no verdict instruction.
- After fix: all 60 wrapper and review-gate tests passed.
- Shell syntax, Prettier checks, and `git diff --check` passed.
- After explicit user authorization, three consecutive real wrapper runs on
  2026-09-06 all exited 0, began their verdict with `No actionable defects found.`,
  and emitted `Review gate: codex reviewed 331df1832..df0051884 — no findings`.
- Raw logs: `/tmp/myk9-416-real-1.log`, `/tmp/myk9-416-real-2.log`, and
  `/tmp/myk9-416-real-3.log`. Runs 2 and 3 independently reran all 60 focused
  tests successfully; run 1 lacked local test dependencies, subsequently supplied.
- The required three-run observation passed; a future reviewer can still ignore
  instructions, in which case the unchanged parser fails closed.
- Linear is In Progress pending PR/merge. Findings retain the documented exit 1,
  rather than the issue's contradictory exit-2 wording; neither emits evidence.
