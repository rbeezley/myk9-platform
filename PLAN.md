# MYK9-416 — explicit Codex review verdict contract

Status: Implemented; real-review evidence blocked pending authorization

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
- Three consecutive real reviews remain unverified. Automatic approval review
  rejected the first attempt because sending branch changes and potentially
  sensitive repository code to the external Codex service needs explicit user
  authorization. No real-review evidence was emitted; do not close MYK9-416.
- Linear write tools are unavailable in this session, so tracker state and a
  completion comment have not been updated.
