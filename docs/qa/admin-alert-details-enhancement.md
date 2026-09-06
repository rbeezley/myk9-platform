# Admin alert detail enhancement

Status: implemented and locally verified; not deployed. Test-code typecheck stopped after exceeding 60 seconds without output.
Request: "can you make that enhancement" — lead with show name and payout amounts, keeping IDs in expandable technical details.

This narrow display fix uses the lightweight workflow rather than OPSX: no payout logic, schema, permissions, data writes or deployment changes. MYK9-407 is complete and is not reopened for this separate enhancement.

Does this duplicate an existing page? No. Extend the existing health alert card; the dashboard uses the same summary formatter and already links to System Health. Preserve explicit per-alert Resolve and the original diagnostic message as plain text.

- [x] Add regression tests for the existing stored payout mismatch message, safe unknown-message fallback, full diagnostic access and independent Resolve.
- [x] Format the known legacy payout message into an amount-first summary shared by dashboard and health; show full plain-text technical details on health for shortened messages.
- [ ] Run focused tests, app/test typechecks and lint; review diff and verify the card at narrow width.

Non-goals: mark alerts resolved, change payout behavior, infer whether a club was overpaid, alter stored alert records, add pages, or deploy functions.

## Verification

- Red before implementation: existing-message and amount-variation summary assertions failed against the ID-first truncated output.
- Green: 64 focused tests across alert-detail summaries, OperatorAlertsSection, operator-alert selectors and dashboard triage selectors.
- ESLint passed for all five changed/new TypeScript files; app `tsconfig.app.json` typecheck passed.
- Test-code `tsconfig.test.json` compilation exceeded 60 seconds without diagnostics and was stopped; do not claim it passed. Six full shuffled suite runs remain a pre-merge requirement and were not attempted for this local enhancement.
- Browser: actual OperatorAlertDetail component with app CSS in a temporary 340px card fixture; verified summary, expand/collapse, full diagnostic text and wrapping. Integration tests cover the real section, repeated occurrences, keyboard activation, safe plain-text rendering and independent Resolve. No hosted data or roles changed. Temporary preview files and server removed.
- Diff reviewed and `git diff --check` passed. Existing unknown messages keep their prior summaries; any shortened detail can now be read in full. The legacy payout parser deliberately recognizes the writer's complete sentence and falls back if its format changes.

## Shipping pass

Requested via ship-pr. Branch remains current with origin/main at ae05bbb60. The first full shuffled suite (seed 1788699566038) emitted no test results for over 60 seconds and was stopped under AGENTS.md; no six-run success is claimed. Owner decision requested before replacing the skill's local six-run gate with draft PR + CI verification. No PR or commit created while this decision is pending.

Code-quality ratchet passed using the same TypeScript entry point with Node's tsx loader (the CLI wrapper's IPC socket is sandbox-blocked). Shipping app typecheck passed; remaining test/edge/e2e checks and app-wide lint are pending. Earlier 64 focused passing tests and browser evidence remain valid; no code has changed since.

Final local shipping checks: app and test TypeScript compilations passed; edge-test compilation passed; E2E typecheck ratchet passed (59 existing diagnostics, 62 baseline, zero new); app-wide lint passed with 18 pre-existing warnings and zero errors. The E2E and code-quality ratchets were invoked with `pnpm exec node --import` / Node's tsx loader to avoid the sandbox-only tsx IPC failure. No application source or baseline was changed to make checks pass. Full-suite six-run waiver remains pending; PR body prepared at /private/tmp/admin-alert-pr-body.md. Independent review must run after publication and before merge.

Owner approved publishing a draft PR and substituting CI plus independent Claude review for the six local full-suite shuffled runs. Approval: "approved" in response to that specific proposal. This exception does not waive CI or independent review, and does not authorize merge or deployment.

## Independent review follow-up

The owner supplied Claude's review: one finding that copied parser fixtures did not track the actual payout writer. Added a contract test importing cron-process-payouts source as text, extracting its current mismatch template and substituting only its parameter values. Both dashboard and health formatters must produce the amount-first summary from that actual template. Missing templates or unknown parameter expressions fail explicitly.

Mutation proof: temporarily changed the writer phrase "was reconciled to existing transfer" to "was matched to prior transfer"; the new contract test failed while the three existing tests passed. Restored the writer byte-for-byte; all four formatter tests and focused ESLint pass. No production source changes. The previously approved full-suite waiver remains in force; the new head needs Claude re-review before the review gate can be marked complete.
