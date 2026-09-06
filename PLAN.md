# MYK9-416 — explicit Codex review verdict contract

Status: In progress

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
