# Codex daily commit review — 2026-11-21

## Window and baseline

The review continued from the November 20 cursor at 22:49:12 UTC (`86b7c0e0bca5feeb0165e286f2dbaf6f93ec5341`, exclusive) through November 21 at 05:08:15 UTC (`59a4833c00a40971a1eca1aa20fccf054d4e1e79`, inclusive). All 15 frozen commits were reviewed, with zero unreviewed and no coverage gap. Report path `docs/qa/codex-daily-commit-review-2026-11-21.md`.

## Review and verification

At the frozen target, the shuffled app suites passed 423 of 425 tests on the first run. The sandbox denied the loopback listener for two landing-capture tests. With loopback access, all 30 tests in that file passed, covering both failures. Chromium passed 46 landing lifecycle and geometry checks. Three phone-only cases skipped their desktop variants. Applied database behavior, live payments and authenticated browser journeys were outside the verification performed.

## P0 / P1

No findings recorded.

## P2 / Medium

**MYK9-2305 — The Stripe rollback checklist can block recovery on a legitimate live payment.** New observation on an existing operations issue. Section 3.2a tells the operator to repeat every forward-cutover check before rotating back to test mode. Its sandbox-money query requires zero rows and has no payment-mode filter. The rollback appendix specifies only the payout freeze and drain. In an isolated SQL replay, one published show with a synthetic $20 online payment and no refund returned 2,000 payable cents. An operator following the first instruction during a live checkout outage could delay rollback to investigate a valid charge. High confidence in the conflicting instructions. No production incident observed. Source: codex. First and last seen November 21, one occurrence. [Runbook §3.2a](https://github.com/rbeezley/myk9-platform/blob/59a4833c00a40971a1eca1aa20fccf054d4e1e79/docs/operations/go-live-runbook.md#L904-L965) · [Rollback appendix](https://github.com/rbeezley/myk9-platform/blob/59a4833c00a40971a1eca1aa20fccf054d4e1e79/docs/operations/go-live-runbook.md#L1318) · [Introducing PR 4303](https://github.com/rbeezley/myk9-platform/pull/4303)

Richard Beezley owns the issue. Closure requires consistent rollback instructions and an operator walkthrough using three synthetic cases. A legitimate live-paid entry with no unresolved payout must permit rollback. A processing payout must still block rotation, and a sandbox-paid rehearsal show must still block forward cutover. [MYK9-2305 reconciliation and proof criteria](https://linear.app/myk9-platform/issue/MYK9-2305#comment-405bb3c0-97ba-4a22-acdf-41f368ab51d3)

## P3 / Low

No findings recorded.

## Counts and references

New observations 1, unchanged 0, resolved 0, duplicate 0, rejected 0, blocked 0. One existing Linear issue reconciled, zero created. No filing blockers, subsequent fixes or remediation PRs in this window. [MYK9-2305](https://linear.app/myk9-platform/issue/MYK9-2305)

## Commit coverage ledger

- `19de5f2d997a88204505dc19126eabd6c86b05e3` — Compared the 80-commit report, both Linear references and cursor SHA against the previous controller memory and this frozen lower bound.
- `f053dac0bc5f01e59acb5fe785a6d085b1ac0159` — Traced pulled flags through desk editability, removal exclusion, per-dog counting, class join, trial-day labels, query failures and both closeout screens; inspected parity and action tests.
- `6a5e918821809b669e9fdccdca8a4770dd6867c2` — Checked all four shipped PNG dimensions against the story metadata, the step render gate, isolated capture guard, workflow ordering and expected artifact counts.
- `fb7b5071c75e050998748348e9edd9e9cc5005ea` — Compared removed tsconfig excludes with deleted deployment, conflict, sync barrel and hook files; searched the resulting app source for surviving imports of the removed modules.
- `1370e3b06ae27b99409fb7ded3e4a5cd0f3196a7` — Compared typed table reads and payloads, nullable class IDs, task fields, omission versus null for override writes, reset IDs and the batched visibility fallback against the pre-change queries.
- `f547b943467ce9a3a0bf2dd2a16abbebe93ece36` — Reviewed legacy and cross-organization draft handling, server narrative selection and the locked publish RPC check before idempotency or writes; inspected registered behavioral SQL controls. Applied database unverified.
- `7dcdd2c43b4c8b1e091668fb0a01304107304c3d` — Checked manifest and lockfile removals and Vitest aliases; searched frozen app references and distinguished the remaining BatchProcessor mock from imports of the deleted service.
- `ddab115c196755ea00234e483404f4bc77b8dfe9` — Checked show and club target tables, exact update columns, cutoff handling, inherited-text nulling and cents conversion against the two new save assertions.
- `0d3918b358d2612add96f5184b64e67caf5bed81` — P2 MYK9-2305 reconciled: compared the rollback appendix with step 3.2a and payout math. Replayed the sandbox query on a synthetic live-paid show: 2000 cents blocks the all-steps rollback instruction.
- `63a498ecc03fad6e60093e0217923024a6af348e` — Checked the overload drop, remaining reason-bearing signature and stale-bundle behavior versus the new restart action; denial and UI tests passed at the target. No live refund or applied SQL.
- `5997c1b2d5bad768bce2590c5da1f5a55786a3f7` — Checked the single-column non-CASCADE drop, generated row types and old queued INSERT/UPDATE stripping. Migration source tests passed; applied database was outside this attempt.
- `c5b83e936ffb26f549dec84430b5e860cba456e5` — Checked both scoring-choice controls retain pressed, disabled and action behavior while allowing multiline labels and a 44px minimum height. FocusedClassScoring tests passed.
- `416d5c34fdeda24b4345974a8e9ca63dd94fb8c3` — Traced scene reducer, line controls, live announcements, reduced-motion storyboard and device placement. Frozen Chromium landing lifecycle and still geometry suites: 46 passed, 3 skipped.
- `8d20ae80545b04ba49eb2a5e0f71bc23489794fb` — Checked the mobile grid, nonwrapping run order, separate judge/time labels, Requirements action and header alignment. Class row, dog card and exhibitor facts component tests passed. Authenticated viewport replay not run.
- `59a4833c00a40971a1eca1aa20fccf054d4e1e79` — Compared show header, address/directions and banner branches; only separator nodes were removed, clock stays with time. Banner and exhibitor facts tests passed. Shuffled changed app suites: 423/425 initially, both loopback failures passed in isolated 30/30 rerun. No live money, applied DB or authenticated browser verification.
