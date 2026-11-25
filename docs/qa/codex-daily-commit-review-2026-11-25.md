# Codex daily commit review — 2026-11-25

## Window and baseline

All 53 frozen commits were reviewed, with zero unreviewed. The window begins at the previous cursor, November 21 at 19:54:37 UTC (`29698f4f91bc37089a582709fc211797edc53b32`, exclusive), and ends November 25 at 04:45:48 UTC (`06dc386786ad002e96d86ea7b3f373921ebf5841`, inclusive). The November 23 and 24 runs stopped before freezing a target. This window covers the intervening commits without a gap. Report path `docs/qa/codex-daily-commit-review-2026-11-25.md`.

## Review and verification

At the frozen target, 288 focused application tests passed. The full replication package passed all 1,220 tests and coverage thresholds. A four-case local replay exercised the phone-walk queue assertion. A narrower coverage probe passed its two tests but missed package-wide thresholds with only one module selected. The subsequent full package run passed those thresholds and reproduced the version warning. Verification excluded browser journeys, hosted SQL, production replay and physical print.

## P0 / P1 / P2

No findings recorded.

## P3 / Low

**NCR-2026-11-25-01 · The ringside phone walk accepts an unreadable failed-mutations store as drained.** Test harness. In the judge’s 375 px phone walk, the pre-reset check passed with an empty pending array when the failed store was absent or returned a read error. Two empty arrays passed and a populated failed array was refused. The checkpoint can therefore advance without evidence that both queues cleared. Later server assertions still run. High confidence. Owner unassigned, ringside verification. Closure requires tests for missing, unreadable, nonempty and empty stores plus an isolated phone walk at the fixed SHA. MYK9-2370 retains its completed reset-timing proof. [Helper lines 214–263](https://github.com/rbeezley/myk9-platform/blob/06dc386786ad002e96d86ea7b3f373921ebf5841/apps/myk9show/src/test/e2e/verification/showDayProof.helpers.ts#L214-L263) · [PR #4350](https://github.com/rbeezley/myk9-platform/pull/4350) · [MYK9-2406](https://linear.app/myk9-platform/issue/MYK9-2406)

**NCR-2026-11-25-02 · The dependency update mixes unsupported Vitest and coverage-provider versions.** Test infrastructure. After a frozen install, the replication coverage command loaded Vitest 5.1.0 and coverage-v8 5.1.1 and warned that mixed versions are unsupported. All package tests and thresholds passed. The finding concerns the supportability of coverage tooling across workspaces. High confidence, viewport independent. Owner unassigned, workspace test tooling. Closure requires matching runner, coverage and UI versions after a clean frozen install, followed by a full replication coverage run with green thresholds and no version warning. MYK9-1920 covered the earlier advisory upgrade. [Package lines 34–39](https://github.com/rbeezley/myk9-platform/blob/06dc386786ad002e96d86ea7b3f373921ebf5841/packages/replication/package.json#L34-L39) · [PR #4366](https://github.com/rbeezley/myk9-platform/pull/4366) · [MYK9-2407](https://linear.app/myk9-platform/issue/MYK9-2407)

Both findings are new at the baseline above. First and last seen November 25, 2026, one observation run each. Detecting task `nightly-commit-review`, source: codex.

## Counts and references

New 2, unchanged 0, resolved 0, duplicate 0, rejected 0, blocked 0. Two Linear issues created, zero reconciled. No filing blockers, subsequent fixes or remediation PRs for either finding in the frozen window.

## Commit coverage ledger

- `bd8bb2cb6805f341c746f7389b35951ce89b5766` — Compared the November 22 two-file publication, eight-commit ledger and issue references with prior controller memory and frozen lower bound.
- `9862070e2619d0ba157af497eb875a1e6670c758` — Traced published stamp selection, no-publish rerun, per-host homepage comparison, retry and HTTP failure handling against the shell fixture tests.
- `d9176778659366bd12028d1d506afb4925263e33` — Checked CLI 3.2 pin, remote flag migration, token forwarding and JSON inventory parser. Commit 12 revisits PATH fallback and type generation.
- `73416eceb3aec1fc512d50bccd83ed5227db4068` — Reviewed daily Chicago identifiers, same-day short circuit, retirement range, no-money fixtures, postconditions and local capture cleanup guard. Later seed forgiveness changes reviewed separately.
- `c0034d8c256aaace290c62e20eeabb89e7e2653f` — Traced both footer links to the anonymous boundary, lazy public route, heading and signed-out route test.
- `c2379b3ea399e0d1d84c1a9749ba7a5c5d04016f` — Checked clean-only class deletion, full-sync stale cleanup, server-owned timestamp versus editable seconds, and registry fallback in rule lookup.
- `f823f0aa6b7b2a02ee14af5c2404c7e27ed4343e` — Reviewed pause RPC scope and grants, loading and offline states, close-time gating and themed CTA assertions. Later copy and fee adjustments tracked separately.
- `57067586535be505fdd727abc6f4bb7600fca6aa` — Checked bounded enrichment batches, offline fallback, whole-page error propagation, stable roster ordering and the 2500-row regression.
- `d09d74500d541ba6723d2a3c65dccdcc2f418ebd` — Verified the edge-function review-floor regex matches repository and nested app supabase/functions paths at a directory boundary.
- `2dd4ca63ed8b1419c65ae8fea666e9eaeccf9d8d` — Traced persisted account identity through local conflict choices and queue reads, distinct online retry authorization, reconcile failures and device-row changes.
- `8cb8ec9bd523436e7b1ee834be8f4eeda3c9d73f` — Reviewed role walks for fixture scope, live inbox restrictions, rollout prerequisites and explicit offline-duration proof.
- `6ee632313909dcad12d238bbd7fa1f5450dc7b87` — Checked CLI version failure propagation, Windows JS entry and temporary generation file replacement, including checkout paths containing spaces.
- `8ee785c7d293956d7807f7627484f5c7a9e58abd` — Inspected restore and upload coordination, coalesced retries, destruction epoch and single IndexedDB transaction for moving failed writes.
- `15277135640a4b94e05dace45a2c275a73b9824f` — Checked check-only, cash-only and combined method selection and suppression of the online fee note on paused shows.
- `61a3aa5bf4b54222df788c9c9f8f8ce92b45a6b8` — Traced element time from the result row into conditional PDF columns and correction-note formatting; compared dual-timer and ordinary class assertions.
- `eec99233651a14d90ef734a31159ad533a94829d` — Checked saved time precedence, fixed versus range rules, stale element/level guard and single-card assertions in both requirements surfaces.
- `fcd72c3224d13fa4b82be5632ec8670c5a9a66d4` — Reviewed per-row read/write transaction, strict clean and non-local checks, row-failure continuation and reload/redaction tests.
- `ee9f98bfce38a2d4e90ee8e9b53ede0d063cc90c` — Checked class-card removal, preservation of general duties, scoped Show Desk link and retry behavior when a needed query fails.
- `63f4e23be67605a3ee8dcd74c349e9dca7839eb4` — Reviewed role-specific trigger paths on insert and update, server writer preservation, RPC execute grants and SQL test registration. Applied database unverified.
- `3a0e39ef2f041555a971958b9d436c9401ca5009` — Checked the saving-state controls, remove target CSS, and disabling automatic retries on both volunteer assignment writes.
- `21fb98a9d228cbb671dccc59e5a0c061e44e67fc` — Checked pull-by-id ordering before save, timeout and offline fallthrough; later date-equivalence change reviewed separately.
- `3df5ab6a3fe0b17ddf9f18a987aa4a33db7c565e` — Compared client and RPC reversal guards for area five and element time and checked SQL registration and execute grants. Source proof only.
- `50fb52581a86701ad14f872382a6884135a9fb34` — Checked registry normalizer, anchored exception prefix and distinction between retired fixture ids and the active daily fixture.
- `41112700c41abd4373b503750a36ff3ace5b3381` — Compared invalidation prefixes with reader keys and provider cache usage for people, registration statistics and entitlement.
- `8d01859cb7054f134bb25d87c5a4f923ed9a1694` — Traced Agy exit statuses, trusted prior comment selection, head binding, completion marker and poster coverage path. Subsequent wrapper revisions reviewed separately.
- `0ca649a5b1e06689090502c20f02c2bb8a0fadcf` — Inspected catalog invariants for RLS, function privileges, private schema and pinned guard triggers and behavioral SQL runner registration. Database execution unverified.
- `dd3a7eaddef8168850086e61692e12cb3fb22ddf` — Compared show-secretary display wording across membership controls, requests, templates and guide updates; checked separate club access and verified-by attribution.
- `5b964b35bf53068ac399bb88341eb2011eee633f` — P3 NCR-2026-11-25-01 / MYK9-2406 filed. Exercised the actual queue-drain predicate: missing and unreadable failed stores both passed with empty pending; nonempty failed array refused. Prior MYK9-2370 timing proof remains complete.
- `1ee3cfdcfcb896ab67aaf577983549be47a558f8` — Checked reviewer-specific log selection and marker regression tests for Codex and whole-log reviewers.
- `14ae8ede57cb462ab373b0245ff966ba9450def5` — Reviewed mobile two-column masthead rules, border positioning and text wrap fallback against the four-column default.
- `3c253295f51578d89227d049f546cf2bfd0f61ce` — Compared SDK declarations, root override and lockfile version. Frozen-lockfile bootstrap and workspace builds succeeded at target.
- `47768287b4c566fe0cd26ae9e370a1e1a104b753` — Reviewed verifier additions covering secretary edit/save, steward assignment, packet element time, sign-out contacts and physical offline replay.
- `4bd8e571415f6911b655580f45c6ae2f2d460db2` — Traced event coalescing, delete invalidation, full-row mapping, club and judge joins, and handling of a later event during the read. Realtime suite passed within 88 focused tests at target.
- `7f6d682d92582a0f65dc32a2243007e1f3b00c27` — Reviewed six guide video links and accompanying instructions for entry forms, desk add-ons, credentials, class actions and paper scoring; playback unverified.
- `dff05021389079b80146da93c3126268c8708946` — Reviewed dropped-reply sequence, identity and version requirements, account boundaries and proposed tests against later wording-only owner decision on MYK9-2371.
- `ed08810e9da953e2d3780ad954fbe0dafaa6fb02` — Inspected the opt-in git shim rendezvous before lock acquisition, shared barrier participant count and unbarriered single-worker path.
- `efe39ba8a6a87d9f4bb194d64073599ec2bacde6` — Compared the permission-checker type with both implementations and guard call site; removed parameter was unused by the registration permission lookup.
- `6c20babcebd3b1f29fc6aacd37e252ef65306b20` — Compared all three review wrappers and their regression assertions for clean current-head reruns after earlier findings.
- `d5be07b3b018a107eaa0b973ac7a0e0f0ac2ed74` — Compared upload-first versus download-first reload controls and reviewed score, status and mixed-field conflict copy against MYK9-2371 owner scope.
- `a18786fb42102f8943a90b6a5d46f5e06eca1b5e` — Checked the same tailwind-merge major in both consumers and explicit background colors on gradient cards, tabs, avatars and hover states.
- `f29dc82401268b30f7d2fc2f12d8c06d002a9633` — Reviewed conditional coin-flip, print confirmation, daily judge sign-off and hide-results instructions alongside generated AskQ asset.
- `5ff05c476d7e2915776b2b43f0fb2b57ea008a8d` — Checked numbers-only validation, edit permissions, load/offline states, ordered partial saves and retained drafts when either write fails.
- `cb810739cad31a1819347dfbacadfc4295337d39` — Reviewed independent reviewer routing across shared rules, generated instructions and skill examples; dated owner override follows in commit 50.
- `8015245564f436492f9a733fa508eb355d5c98cd` — Checked normalization is limited to the four date-field spellings and compared same-day, true differing-day, rename and queued upload controls.
- `3f63cc78b004a62f353f724454897441c8d9384a` — Checked trial-id routing, dirty form lockout, no-dialog host fallback and single versus multiple trial controls. Frozen-target component suite passed.
- `69e56f9fb9a57c23c8e1d891002835885c12bc8b` — Compared video link and guide instructions on per-show versus per-class assignment with subsequent People qualification workflow update.
- `5601a3d56b7b71f7a9889b839ee36ecfa432ed45` — Checked pending state against runnable, count, score, check-in, reorder and queue preview paths. Mixed roster and reorder suites passed.
- `5b8eb04bd618ac5125c0757871dbd5b2716039f3` — Reviewed role check, removed-person handling and read-before-replace safeguards; focused qualification save tests passed.
- `18bd750ecc1d6088cceba8844affb6e474c9da72` — Checked name flex basis, min-content width, actual offline indicator assertion and line-height measurement in the 390px isolated test; browser run not performed.
- `18f1f71d0e5076b5ed44c2c7a22bc17d47fedaf0` — Checked temporary reviewer selection and cutoff date across canonical shared rules, generated copies, playbook, orchestrate and ship-pr notices.
- `d940cb1201a49477437133b350fe815a301a4d52` — Checked blank and legacy TBD names, no-judge collation key, assigned-name prefix and generated PDF text. Packet suites passed.
- `4fbd8c1914b47a4f8791fa2372cfcb2478540e8a` — Checked collapsed next action, class switch reset, per-report print dispatch, expand/collapse semantics and keyboard focus return. ClassStepBar suite passed.
- `06dc386786ad002e96d86ea7b3f373921ebf5841` — P3 NCR-2026-11-25-02 / MYK9-2407 filed. Frozen install resolves Vitest 5.1.0 with coverage-v8 5.1.1; the runner reports unsupported mixed versions. Full replication coverage passed 1220 tests and thresholds. App focused suites passed 288 tests. No browser, hosted SQL or production replay.
