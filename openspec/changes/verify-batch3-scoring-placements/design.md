# Design

## Current scope

MYK9-1246's rejected-save feedback (#3077), MYK9-1234's print sort (#3080), and MYK9-1230's manual-class placements (#3094, merge `f9add37f3a6c722dabb345038baaabfded4c23d8`) are merged. This batch supplies isolated browser verification and dedicated CI. It adds no duplicate migration or ResultsTab/SQL tests.

Historical Vehicle was manually completed, fully accounted for and unplaced. Current shared data is derived/in-progress with one pending entry. Preserve that state. ABC's original single-entry score remains Q/62.03/0/placement 1. Owner confirmed secretary paper scoring/Fix; original post-Save response remains unknown.

## Decisions

- Reuse existing scoring/results/report surfaces and guarded loopback helpers. No new product surface or duplicated functionality needing a link.
- Verify one/multiple-entry paper saves, assigned judge single-entry save, SQL/replica persistence, reload and actual report iframe order. Existing real-caller tests cover rejected-save retention and print ties.
- Follow the owner decision recorded in #3094: fully accounted manual classes are canonically ranked, including corrections; no app path hand-sets placements. Manual status, finalization and times stay protected. This supersedes our earlier all-ranks-missing design.
- Preserve private copies, then remove our uncommitted migration, source pins, SQL registration/test and duplicate ResultsTab test. Use #3094's implementation and tests; preserve the other task's held checkout.
- Require all three browser cases on the exact PR head, zero retries, in disposable CI before merge. Compare served build stamp with requested SHA.
- Shared reads fail closed on mutations. Isolated evidence does not silently replace original incident or deployed acceptance gates.

## Approved proof redesign — October 18

The second review found cleanup after failed sign-in and unproven firewall enforcement on the same paths. The owner approved independent disposable fixtures: every scenario creates new class/entry IDs and its own confirmed judge assignment from canonical seed references. The canonical class/entries are read-only templates. Remove soft-deletes, resets, restoration, per-class deletes and error-aggregation teardown. The test runner closes its browser contexts after each test, including failed sign-in; unconditional runner-stack destruction owns database cleanup. Tests run independently rather than serially skipping after an unrelated failure.

Reuse existing canonical dog armbands and create only missing extra-dog armbands inside the disposable show. Assert each inserted entry's number and initial unscored/unplaced state. Check every placement, including NQ/ABS, in both Check Scores and Fix. Literal rank/order assertions remain the acceptance contract.

Network isolation now has an explicit FORWARD jump and positive/negative probes on the actual Supabase gateway network: host public reachability control, local authenticated health success, and a public-IP timeout from the container. Fail closed if that network enables IPv6 because these rules cover IPv4. The probe and all three browser cases must pass on the redesigned head, followed by independent review and required CI; previous green browser runs do not waive the review findings.

## Verification and risk

Risk: verification infrastructure and scoring acceptance. Run typecheck/lint/ratchet, relevant scoring/database/print tests, independent exact-head review, required CI and dedicated browser proof. Block container public egress and require loopback fixture targets. Keep credentials private and scrub published artifacts.

Earlier full shuffle: 29,455 passed; one untouched cached-scoresheet test failed, then all seven tests in that file passed alone. Integrated paper/placement proof passed; judge stopped before authentication in unchanged Sign in click. Owner approved scoped shipping with separate tracking and mandatory CI/browser proof on October 17. Follow-ups MYK9-1251 and MYK9-1252 remain open; neither failure is resolved by declaration.

No linked migration/deployment runs in this batch's workflow. Prepare concrete shared-system gates after merge; production acceptance remains open. Earlier SQL/dry-run evidence concerns our superseded proposal, not deployment of #3094.

## Plan coverage and inflight disposition

Plan coverage: 100/100 for the scoped proof, distinct from acceptance completion. Tasks cover incident uncertainty, cardinality/reload/errors, two-class parity, preview/non-qualifiers/ties, source identity, shared-data protection, checks/review/merge, production gates and cleanup.

Initial scoped inflight exited 1 for our scaffold and old migration-directory branches, with no actual intended-file collision. A fresh issue read found #3094 merged during this resume; integrate it and drop overlap instead of a second fix PR. Workflow-scoped scan passed. Retained changes: new proof/config/workflow, one exclusion from the long proof workflow, evidence/OpenSpec. Preserve primary audit changes and unrelated branches/worktrees.

OpenSpec is the sole plan under the repository carve-out. Archive only after required verification and acceptance gates complete.

Final six-path scan from primary completed against 202 in-flight sources: exit 1 solely for this task's own 11 staged files in `/private/tmp/myk9-batch3-scoring-proof`. No other source overlapped. Primary was used read-only because its unrelated audit edits block the linked-worktree preflight. The current Linear In Progress survey found only this batch and unrelated wizard work. This is a documented self-overlap disposition, not an automatic exit-0 claim.
