# Codex daily commit review — 2026-11-22

## Window and baseline

The window continued from the November 21 cursor at 05:08:15 UTC (`59a4833c00a40971a1eca1aa20fccf054d4e1e79`, exclusive) through November 21 at 19:54:37 UTC (`29698f4f91bc37089a582709fc211797edc53b32`, inclusive). All eight frozen commits were reviewed, with zero unreviewed and no coverage gap. Report path `docs/qa/codex-daily-commit-review-2026-11-22.md`.

## Review and verification

At the frozen target, all 244 focused tests passed. Chromium passed 52 landing checks, with four viewport-specific skips. Three additional isolated cases reproduced the two findings below. Authenticated journeys and hosted Stripe checkout received source review only. No payment or shared database write was executed.

## P0 / P1

No findings recorded.

## P2 / Medium

**MYK9-2328 — A secretary can assign a steward before learning of a handler conflict.** In Show Desk’s single-class picker, a ready roster enables assignment while the entries lookup is pending or unavailable. Two component cases selected a linked volunteer and observed the assignment callback without a notice. The secretary could schedule someone to work a ring while handling a dog there. High confidence in the UI behavior across viewport sizes. Source: codex. New observation, first and last seen November 22, one run. [Single-class render](https://github.com/rbeezley/myk9-platform/blob/29698f4f91bc37089a582709fc211797edc53b32/apps/myk9show/src/features/show-map/cockpit/FocusedClassStewards.tsx#L30-L65) · [PR 4312](https://github.com/rbeezley/myk9-platform/pull/4312)

Richard Beezley owns the issue. Closure requires component controls for pending, failed, known-conflict and clear responses, plus a secretary browser replay showing when the notice appears and whether a write occurred before it. [MYK9-2328 reconciliation](https://linear.app/myk9-platform/issue/MYK9-2328#comment-432e1dd4-64d3-4cfb-bdaf-d3b32fb9cf6c)

## P3 / Low

**MYK9-2314 — The 390px running-order test can silently skip its geometry check.** The exhibitor’s My Shows regression counts matching rows before taking a separate measurement. Removing the last row between reads produced zero geometry assertions and zero skip annotations in an isolated replay. High confidence in the harness behavior. Its frequency in CI is unknown. Source: codex. New observation, first and last seen November 22, one run. [Spec lines 158–194](https://github.com/rbeezley/myk9-platform/blob/29698f4f91bc37089a582709fc211797edc53b32/apps/myk9show/src/test/e2e/myEntriesPullLinkMuted.spec.ts#L158-L194) · [PR 4314](https://github.com/rbeezley/myk9-platform/pull/4314)

Richard Beezley owns the issue. Closure requires deciding whether to annotate from the measured array, proving a disappearing row records the skip and a wrapped or overflowing row fails the assertion, then rerunning the isolated 390px regression. MYK9-2329 retains its separate timing proof. [MYK9-2314 reconciliation](https://linear.app/myk9-platform/issue/MYK9-2314#comment-44cc0c55-6383-4aa4-8da2-9b456a731079)

## Counts and references

New observations 2, unchanged 0, resolved 0, duplicate 0, rejected 0, blocked 0. One product UX finding and one test-harness finding. Two existing Linear issues reconciled, zero created. No filing blockers, subsequent fixes or remediation PRs for these findings in the window.

## Commit coverage ledger

- `de12fa2d722732de4473ab93e29f0f250d6c266d` — {'reviewedAt': '2026-11-22T11:06:06.873Z', 'notes': 'Verified the prior report and cursor agree with controller memory on the 15 reviewed commits, MYK9-2305 and the frozen lower-bound SHA.'}
- `796d6f008a3b755c5b0786d56605b9999365f7fd` — {'reviewedAt': '2026-11-22T11:06:22.551Z', 'notes': 'Compared changed authentication, handler, payment and decline selectors with current UI copy and reviewed the held-entry control, pull confirmation and responsive search assertions. Authenticated journeys were not replayed.'}
- `48b4cebeba98ecaa48e4fc4dba6b1e339e6a72a9` — {'reviewedAt': '2026-11-22T11:06:29.248Z', 'notes': 'Traced the grid exclusion through the strip-bottom measurement, finite-value guard, scroll-distance controls and independent header hit test.'}
- `d018c4114fd949b30b8df181456dcb41f92d9317` — {'reviewedAt': '2026-11-22T11:06:33.644Z', 'notes': 'Inspected per-field frame discovery, optional billing fields, card selection, strict Pay locator, test-key guard, redirect and independent settlement assertions. No hosted checkout or payment executed.'}
- `8ed5dc01b7921ed83a12882c9650fc8d4c310805` — {'reviewedAt': '2026-11-22T11:07:26.044Z', 'notes': 'Checked reading order, visible audience labels, media and scene rendering, responsive grid breakpoints and reduced-motion rules. Landing and steward component/model suites passed together at the frozen target (244 tests).'}
- `13bfbb5692d7dd5a57dcc8e406ebcf8a5f6e9be2` — {'reviewedAt': '2026-11-22T11:08:23.430Z', 'notes': 'P2 MYK9-2328 reconciled: two isolated component cases confirm single-class assignment without notice when the handler conflict lookup is pending or unavailable. Checked bulk conflict handling, deduplication, cancellation filtering, mutation and shared query keys. Focused suites passed.'}
- `2f968c1d753c39f2d2d1f2917709b5463856a448` — {'reviewedAt': '2026-11-22T11:09:37.332Z', 'notes': 'P3 test-harness finding reconciled on MYK9-2314: replayed the committed 390px assertion block with one row removed between count and measurement. It returned with zero geometry assertions and zero skip annotations. Existing MYK9-2329 timing proof is distinct.'}
- `29698f4f91bc37089a582709fc211797edc53b32` — {'reviewedAt': '2026-11-22T11:10:07.345Z', 'notes': 'Confirmed both audiences end at Results, the exhibitor dog-record still remains above the Results scene, and no obsolete step references remain in landing components or specs. Frozen-target Chromium landing lifecycle, still geometry and end-of-timeline suites: 52 passed, four viewport-specific skips. Focused Vitest suites: 244 passed.'}
