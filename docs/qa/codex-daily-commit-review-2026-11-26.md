# Codex daily commit review — 2026-11-26

## Window and baseline

All 54 frozen commits were reviewed. Zero remain unreviewed. The window starts at the previous cursor, November 25 at 04:45:48 UTC (`06dc386786ad002e96d86ea7b3f373921ebf5841`, exclusive), and ends November 26 at 17:21:33 UTC (`b926c5c6f05ffaea3b1058663fb270da6671a086`, inclusive). Coverage is contiguous. Report path `docs/qa/codex-daily-commit-review-2026-11-26.md`.

## Review and verification

At the frozen target, 328 focused tests passed across 14 files, covering sheet parity, device queues, desk payments, payout reminders and checkout verification. The full replication coverage run passed 1,188 tests across 99 files with Vitest 5.1.2 and met all thresholds, including 91.51% branch coverage. An earlier run of 207 tests used the local checkout and Vitest 5.1.0. This run did not exercise browser journeys, hosted Stripe flows or applied SQL.

## P0 / P1 / P2

No findings recorded.

## P3 / Low

**NCR-2026-11-25-01 · Resolved · Ringside phone walk queue check.** The judge’s 375 px phone walk previously accepted a missing or unreadable failed-mutations store when the pending store was empty. Commit `a8385ab08b` makes the check require two readable, empty arrays. The focused controls passed at the frozen target. The canonical issue records a passing isolated phone walk at fixed head `2bce6f2c0`. [Original finding and source lines](./codex-daily-commit-review-2026-11-25.md#p3--low) · [PR #4383](https://github.com/rbeezley/myk9-platform/pull/4383) · [Phone walk](https://github.com/rbeezley/myk9-platform/actions/runs/45672435476/job/139410997844) · [MYK9-2406](https://linear.app/myk9-platform/issue/MYK9-2406)

**NCR-2026-11-25-02 · Resolved · Vitest coverage dependency mismatch.** Commit `8e731a5221` aligns the runner, UI and coverage provider at 5.1.2. After a fresh bootstrap, the full replication coverage run passed without the prior mixed-version warning. [Original finding and source lines](./codex-daily-commit-review-2026-11-25.md#p3--low) · [PR #4387](https://github.com/rbeezley/myk9-platform/pull/4387) · [MYK9-2407](https://linear.app/myk9-platform/issue/MYK9-2407)

Both findings concern test infrastructure. Each was first and last observed November 25 at `06dc386786ad002e96d86ea7b3f373921ebf5841`, with one occurrence and high confidence. Closure evidence was reconciled November 26 at the frozen target. Detecting task `nightly-commit-review`, source: codex.

## Counts and references

New 0, unchanged 0, resolved 2, duplicate 0, rejected 0, blocked 0. Two existing Linear issues received closure evidence. Zero issues created and no filing blockers. No unresolved findings remain. The review produced no implementation changes or remediation PRs.

## Commit coverage ledger

- `465ea5f220284de16c0f3738d621de1f11b6a3d1` — Checked the prior daily report ledger and its 06dc386 boundary against the frozen starting SHA and previous publication memory.
- `ae58fa00d4b035d105a41be08f2ea0344198c88c` — Checked sheet status precedence, catalog exclusions, nonrunner labels and distinct check-in and scoresheet expectations.
- `b331622c7fcdc8c84ea07c84dc54af48574a21c2` — Inspected the ship-pr guidance-only diff and its handling of proof-gate exit instructions.
- `da62003b885829f1912ea8ce8608c1253952be54` — Checked live settings integration, hidden duplicate judge/status inputs and form judge synchronization.
- `1cb987e90aa09161cffef449c7a504616445fbd8` — Traced raw RPC statuses through applySheetEntryRule before packet lookups and inspected server/client parity coverage. SQL execution unverified.
- `f26bc3f5af67a60a816e1445f8250bf92f6f4b37` — Inspected click-to-load embed, direct watch fallback, focus transfer and local poster. Playback unverified.
- `98942c781c8276b5e4f1ef87ee3a6ffc14143160` — Compared both registry scoresheet call sites with stopwatch formatter and accessible button-name assertions.
- `f78e57b904a243d7d5e4eab437f63d0ce3d82744` — Compared shared tokenizer use with reversed and punctuated owner search and existing-person selection cases.
- `a8385ab08b9811b774e5610b13efa68841e6dd6e` — Checked pending and failed store inputs to queueDrainState and E2E poll integration against prior MYK9-2406.
- `d7e5a00ab3824e8e7a05f16e5c697354228f3011` — Checked per-term timers, Promise.allSettled and partial-result handling for one stalled person lookup.
- `eab0de6827ea2bd72cf3f47796eb855e97d9fdfe` — Traced element_time_seconds through the adapter and staff index and checked qualified, showTime and zero-time guards in CompletedResult.
- `251ded89f3368ce6266c299a14b7abb20e494c3a` — Checked dismissal scoped to cached RBAC timestamp, keyboard-accessible button and preservation of offline header feedback.
- `8e731a52217c6e71cb05cb008e6cf71d86345ea2` — Compared Vitest runner, UI and coverage dependency versions across workspace declarations and lockfile. Installed checkout runner differs from lockfile.
- `a9323dde9a883b71ae6398e4ddc213a738cc68a9` — Inspected not-paper gate on live class next-up previews, replicated show subscription and paper class regression cases.
- `ad1227de4dea21c6830c6f5414f60851e9b7ad30` — Reviewed guide quote normalization, TypeScript source exclusions and occurrence-scoped allowlist matching.
- `a2a1d79d50b1f7afebd47b38dc0accc8d659f6fc` — Checked conflict-settled subscription and notification after all discarded mutation promises settle.
- `bb6de578fee9fba1a980a2af2841c953f5111406` — Traced the exact rendered receipt subject and body to delivery and log content, including missing log ID and best-effort storage errors.
- `809161ecf462e2ed24d02b56dec9f94d83507b43` — Reviewed removal of trial entry-limit rendering from four PDF bodies and venue requirements and fixture changes.
- `30145a571c6786db69968efff2189ab80de1abbd` — Reviewed ClassCard liveData prop and conditional progress and queue removal against the deleted test-only rendering cases.
- `d2df688c86a7f6c5943d1c8c406dff8e8670eeef` — Checked empty-page termination, repeated cursor detection, abort propagation and complete live ID count before visibility pruning.
- `dbca22b7e7ff2405535233124df96658552ad53e` — Checked bulk fee dialog value versus inherit action and success-only selection clearing with partial-write test coverage.
- `83a8b2c04864d8064389e96f9c112fb4e73c97df` — Checked both club/account read error returns precede payout processing and that the per-show deduplicated admin alert escapes message text.
- `c04fa02ff260a72731bdb5bb4158268fab57c5e6` — Reviewed subscription-to-customer-to-person authorization chain, livemode input and ownership failure responses.
- `1920c4dce8f3cce7c343461ea47929080fe7ad10` — Inspected removal of localStorage restore calls at startup, reconnect and recovery and updated pending/failed IndexedDB recovery instructions.
- `5e6f27b1da9891c61424133d1ac29210ee10391f` — Compared Heartland fixture class changes with preliminary-result contract and exhibitor and secretary walk references.
- `7006cd9ad0d0d486df9dc9dc3bb543824c17590c` — Verified edit form initialization and payload no longer carry the three time fields and class ID reaches the dedicated editor button.
- `209238b1bb8c43ced6cb893834e0fcc70d6f160c` — Reviewed ready/loading/error qualification state, refetch and the ready-only save gate against panel tests.
- `25fac733c5067efbeb00a5d9bef920e3b426b68b` — Inspected removal of separate handler step and its old browser spec, and retained second-dog handler selection on the class step.
- `d7fda43aa0df7293bcba76984f1af10ccf39c616` — Checked registry/style/timezone helper fallback inputs on edit, official PDF, assignment and at-show surfaces.
- `f244cb8faef63093dc5c69f26acf93eb7683d76a` — Checked preservation of original Error in logging, custom fallback reset and retry counter across derived error states.
- `b26def60e4cb2e629c04ccd46d3d603c0fa66f0c` — Checked transient read errors propagate to webhook retry and paid-at is derived from event creation on replay; later checkout pricing change reviewed separately.
- `885f1be86b16b88ca49569417f69b1290b544397` — Compared asynchronous store action signatures, unknown-session guards and preservation of state on a missing session.
- `c4f3a33fbec3348d170fb82ae04a6036aec79fe3` — Reviewed all-status subscription pagination and active, trialing and past_due guards before checkout creation.
- `cb3c0f3e56307160f7585b53d7a6e2b61e33de56` — Traced conflict read state to the volunteer picker; linked people wait for readiness and walk-ups remain selectable.
- `7c77025e841306606ebc8c8006e6c3298976fc6e` — Traced shared starting_after pagination into both refund reuse matching and idempotency attempt counts for entry and show refunds.
- `26ff8508e7a86b440820a986e56094bb7283ec89` — Reviewed per-page abort checks, query signals, count requests and show-scoped paperwork keyset paging.
- `0a287678e9f14a07885a006a1414cf50a7947fc5` — Checked move-triggered offer, UTC calendar subtraction, entry-open lower bound and explicit user action before updating the show.
- `576baef6e2a65e552981ad106251798c157706a7` — Compared portal and upgrade malformed JSON responses and verified provider details are confined to logging in catch-all paths.
- `76bcfc35e9e49b5efd02a8078f6991e8614c6e5c` — Checked per-class handler ID fallback and discipline-aware edit title, and local move destination lookup fallback on read failure.
- `8b317a0beedc0bc7fd6930651904db5d25ff74e5` — Traced initial read failure, ambiguous insert, same-account and competing-account rereads before orphan cleanup, plus safe error mapping.
- `b905f9763142205246f9fdb5eacff77416d43f83` — Checked ordered range reads against repository max_rows=1000, partial page error handling and fetch-before-mutation sequencing.
- `5480dba40e8272e81b368b9ca5c12dd738e1df37` — Checked omission of status_before_close on ordinary edits and explicit key preservation for intentional changes.
- `97f5cc050ede28fadd91c8ecf7be76fad340cb3d` — Compared corrected dynamic timer example, checkout and club onboarding guide labels with removal of knownDrift entries.
- `58d33311ccc22b96874e94aa3e7db2d04cb28fac` — Checked optional field clear serialization, blank-to-null versus numeric zero, and opened-window validation for published shows.
- `7b606734c5087764525b861ae998a62a15d32e9d` — Reviewed all three prior-link expiration error gates and generic catch response before replacement checkout creation.
- `4c0fb39b64344a6e2c0d1d8a2acdb2cc93b0452b` — Frozen-target parity tests passed for armband order, nonrunner label and blank order, and runners-only scoresheets.
- `cd54c9c7f7c82ccaa14da448bb824978cf131623` — Reviewed slow-return decision matrix, failed Stripe read and at-most-one retry. Decision tests passed at target; hosted payment journey not run.
- `01257ef0545cd89dd59248d3a7b010bcebdafece` — Compared provider nesting before and after StoreProvider removal, associated mocks and deleted lazy-store dependency.
- `72e09cb490a22055c05834f0ade35f522e406d80` — Checked development-only dashboard import, removal of prototype route and anonymous exception, and show store initialization without mock data.
- `8b1f58416bc1c59f30f056985c10dad8ca1f1a1c` — Compared formatted display labels with separate ISO date sort keys and PDF text snapshots. Financial totals tests passed at target.
- `3f59e03a60c61d126fefc3942637093b0e9890fc` — Traced attempt ID reuse through RPC, normalized reference/date comparison, enrollment row lock and authorization. Ledger save tests passed; SQL source only.
- `32d8b41db9ff5d4a34005622b697eb6834cbc5a5` — Checked due cursor ordering, claim/release guards, status transition resolution and alert refresh. Reminder suites passed at target; no operator email or applied SQL replay.
- `67c18fe9f198cd898da3a12ac52e8333669fd59f` — Checked line metadata and one-to-one matching, stamped fee and captured total validation, transient read errors and legacy repricing. Snapshot and webhook boundary suites passed at target.
- `b926c5c6f05ffaea3b1058663fb270da6671a086` — Compared generated payout stamp and optional payment UUID with both migrations. Target verification: 328 focused tests passed, then 1188 replication coverage tests passed on 5.1.2. Prior P3 findings MYK9-2406 and MYK9-2407 reconciled as resolved. Browser, hosted Stripe and applied SQL not exercised in this run.
