# Codex daily commit review — 2026-11-28

## Window and baseline

Reviewed all 76 frozen commits. Zero remain unreviewed. The contiguous window starts at the previous cursor on November 26 at 17:21:33 UTC (`b926c5c6f05ffaea3b1058663fb270da6671a086`, exclusive) and ends November 28 at 09:29:20 UTC (`03af148797a9e18a8c88100f74f556ca1694f43c`, inclusive). The November 27 fetch failure left the prior cursor in place. Report path `docs/qa/codex-daily-commit-review-2026-11-28.md`.

## Review and verification

At the frozen target, 277 focused Vitest tests passed across 18 files in two runs (145 and 132). Coverage included checkout fee healing, payout figures and reminders, directory paging, ring queues, RBAC, close/reopen, the Edit Show status control, qualification mapping and armband labels. Browser journeys and behavioral SQL were inspected in source only. No production, database or payment actions were exercised.

All three findings affect secretary workflows across viewports. Detecting task `nightly-commit-review`, source: codex. Each has high-confidence source evidence and one nightly confirmation at this baseline.

## P1 / High

**NCR-2026-11-28-01 · New · A published show can enter a status with no Close action.** Edit Show offers Upcoming and In Progress on a published show. After either is saved, Results tells the secretary to publish the show before closing it. Edit Show offers Published only when the panel opened on Published. The status mapper preserves both values, and the closeout test explicitly confirms both refusals. First and last seen November 28. Implementation owner unassigned. Agree the supported transitions, then exercise both choices on disposable shows through close and reopen, checking child states and history. [Edit Show options](https://github.com/rbeezley/myk9-platform/blob/03af148797a9e18a8c88100f74f556ca1694f43c/apps/myk9show/src/components/panels/edit/ShowEditBasicInfoTab.tsx#L169-L201) · [Close guard](https://github.com/rbeezley/myk9-platform/blob/03af148797a9e18a8c88100f74f556ca1694f43c/apps/myk9show/src/features/show-workbench/CloseOutShowAction.tsx#L170) · [MYK9-2537](https://linear.app/myk9-platform/issue/MYK9-2537)

## P2 / Medium

**MYK9-2508 · Unchanged · Offline close can lose the record of outstanding work.** The close succeeds before the one online note write. On failure the secretary sees a warning and the note has no retry. The note also omits Finish list inputs for results release, judge sign-off and handler clashes. First seen November 27, last confirmed November 28. Closure requires an offline close and reconnect with persisted lines matching the Finish list, or a clear connection requirement that holds the close. [Note write](https://github.com/rbeezley/myk9-platform/blob/03af148797a9e18a8c88100f74f556ca1694f43c/apps/myk9show/src/features/show-workbench/CloseOutShowAction.tsx#L163-L167) · [MYK9-2508](https://linear.app/myk9-platform/issue/MYK9-2508)

**MYK9-2526 · Unchanged · Bulk cancellation can leave a show partly closed.** Managing sends a cancellation update for every selected show, including completed ones. Its children stay completed and the close timestamp remains set. The Edit Show lock in PR #4515 covers a separate path. First and last seen November 28. Verify a mixed open/closed selection in a focused test and a disposable browser replay. Check the closed show's status, children, timestamp and recovery guidance. [Bulk write](https://github.com/rbeezley/myk9-platform/blob/03af148797a9e18a8c88100f74f556ca1694f43c/apps/myk9show/src/components/shows/browse/ShowBulkActionsBar.tsx#L83-L85) · [MYK9-2526](https://linear.app/myk9-platform/issue/MYK9-2526)

## Counts and references

New 1, unchanged 2, resolved 0, duplicate 0, rejected 0, blocked 0. Three unresolved product findings. Linear filing completed for all three. The review created no fixes or remediation PRs.

Within the window, PR #4506 replaced the separate fee-heal writes from #4436 with a lease-guarded transaction. PR #4508 extended the trial update protections from #4466 to the stale-class switch. The focused fee-heal tests passed. Applied SQL remains unverified in this run. [Checkout follow-up](https://github.com/rbeezley/myk9-platform/pull/4506) · [Trial update follow-up](https://github.com/rbeezley/myk9-platform/pull/4508)

## Commit coverage ledger

- `2722ca5a30094fc7160e15a616f71287274c67cd` — Compared the 54-commit report boundary with the cursor row and frozen starting SHA.
- `f8e89d3b8982cb73d807a9005c076cc16dfa3525` — Traced bad JSON, zero-row writes, stale customer deletion and scrubbed errors. Later atomic fee heal belongs to MYK9-2455.
- `8085eb004cbfb448cc225268a58d52ab44329baf` — Checked the directory plan status and index entry against the paging change that follows.
- `ee54d8f32d63bb33117e039ed12d50c509a3f82c` — Checked saved versus live element timer rendering in both layouts and the correction round-trip assertions.
- `41cad1f579659f09a42b30b8e4af44d5cc911b56` — Compared the steward guide, generated AskQ text and video embed test registration.
- `deec344d4411a03dbf0a06f3b30a3804be28178b` — Traced keyset ordering, short-read recount, saved directory merge and duplicate-person fallback with paging assertions.
- `e803da51f01b0fbdd442ff2ceb3dc58cbe57052c` — Compared club-scoped RPC authorization and money fields with the query key, mapper and registered SQL proof.
- `38c546ff4d076fbf3e85b3994b2a87b69e83db22` — Checked no-signal quickstart section against embed registration and generated guide asset.
- `e1a8e32179cfa20c776073d242299b55e3d6bf08` — Checked refund suggestion uses money-root ID with entry-ID fallback and moved-up fixture.
- `9a44af7e4ba486e9f944dab8a607665669a63faa` — Traced prompt target lookup from show group to dog/class and removal from repeated rows.
- `ab2fc8df63dd9615b6c4a9d3ab995c3413e041db` — Verified the approval change names a single test-club UUID and documents its scope.
- `1ddb5eeb831cf31f77f9502210bb1cc030c1ccd1` — Traced recipient and show filters from enrollment form to the gated history RPC, including paging and empty/offline UI.
- `c169b0fb094ec541b4c3d1bc08bbbc9706e606f3` — Compared shared machine rules, dispatch failure branch and missing-script harness assertion.
- `aa8e6fd031966551869c429b7dfb6944a205965d` — Traced payout figures, reconciliation availability and stage precedence through delayed, sent, fully refunded and missing-data states.
- `699261d32231631b65b0328b2dcefca979a665d4` — Checked offline desk plan registration and its separation of pending payments from posted balances.
- `711e9355e263d36e77849065e03f7d538ee02331` — Checked class-entry filtering before ringside grouping against combined and section-only undo cases.
- `f8a92c75dbaeaaec7a0ae6225cec986fb1a6728a` — Checked responsive success-column classes retain the small-screen width and expand at lg.
- `ef8907b63e056e453e63aa6fcd1234ac07310086` — Checked roster design uses one members list and distinguishes official role sources.
- `0cd73e1bf487bf507958a257d1863b6d8786345a` — Checked deletion scope and retained deterministic lock contention coverage in bootstrap harness.
- `747daa6df5f50cff36002c523d8e9a0a183dc574` — Checked single, multiple and overflow charge headlines against amounts, dates and paid-row cases.
- `ff6c932e235aa65031f115094d9291790ed9ff34` — Checked partial tile-label overrides, shared fallback and existing-browser selectors.
- `18ed68b36c00d9caeadc68eb819c87a0491c09a0` — Checked iframe sandbox and href target rewriting against preview and link tests.
- `44a2323f3a5c92e354c0a728b7e3243efb46c3e2` — Traced disabled Nationals switch into sheet selection, leaderboard, menu, show edit and tests.
- `3e15c952ce56308f52bd87737924be161a9c3200` — Checked four-word whole-step exception and refusal logging on mixed versus guide-only answers.
- `a9f727f8e613b55762906ee1026abe5c64e706ef` — Checked picker outcome and toast for success, replacement left partially assigned and failed save.
- `0a4fad0fffebe46c94da61b19ea8a6d8be13eddf` — Traced location through receipt, reminder and confirmation selects and shared venue fallback formatter.
- `9afcf46d68097a7e72cbbabe611856518f391db4` — Compared current versus ancestor crumb types, router destinations and wizard draft-preserving link targets.
- `ad4ac8dbe89f1b3fc7dd67cdb23411d992a53501` — Checked action registry and encoded show ID deep link into Messages email view.
- `c468d3318d260e066d5c3fd2e1a9090297d5f918` — Checked authenticated roster read, club-scoped permissions and success gate before rendering a whole-roster count.
- `e3a5506f0414443db260eab114b54057efe13201` — Compared panel-open baseline, store comparisons and replication payload stripping including queue resend tests.
- `873fb3a893a401ff8ae19ca33ece1153cca57724` — Traced draft ID through form history, callback URL, local storage expiry and sign-out cleanup.
- `8b852cbd69b395b0376bc1bce5289f48213b3b3b` — Checked shot-to-screen map, dependency expansion and unknown/shallow-history classification.
- `06b687d80bb0362ae12b0a094bc5af3be4f06e96` — Checked resubmission passes current draft ID and stored-ID reuse versus expired/missing draft coverage.
- `fd179cd9f295bb5a8fae2b69b8de50bc3c263530` — Checked six-pass audit step-count and existing-surface requirements. Methodology-only change.
- `5542cccdb73254e5c7a8be0d85095aa0fde4d3ac` — Traced ordered dog selections and class summaries into eight styled receipts and staff exit handling.
- `61bda356e3f9eb4ead2c3cd099293034eb906faa` — Checked targeted role/permission join, idempotent inserts and final expected-grant count.
- `dc4c3732638581ff36d670573173c6bb2373460a` — Checked blank or whitespace recipient hides send and history and preserves explanation.
- `77b7b3b304a3e9fbb5563dc0585d221ad91510a2` — Traced close child updates, show-last ordering, online note failure, reopen reason gate and individual child restoration.
- `aaaa3cdf2a8daa73fb5ae6a988060c59a64fb34b` — Compared wizard and editor person creation, phone update, prior-email reuse and fresh opposite-role check.
- `196b9d9302174b7ef69297c7eb5dd5fa0f73533d` — Checked class-link audit path exclusions and per-file allowances against the desk-link requirement.
- `cb1b5e655061533c0f9ff3a6071eed513c3a8b4f` — Traced generated and kept narratives through response schema, editor state, unsaved-input comparison and offline gate.
- `136d5092795031bb81978ea0bf3516d89575c858` — Checked shared-device payment design, existing draft PR reference and its proposed testing scope.
- `8d18766d33c453c9f960c981b2cc15ec34e15c5c` — Confirmed both payment plans marked abandoned and removed from the active index.
- `1ce7bee42175e4fa003dbb3571aee516deae8dff` — Compared pending and SQL-null lifecycle handling across accounting, ring queue, client store and SQL place fixtures.
- `42737fcb45b45ae9a3425227f09fdfed8f53cd89` — Checked guide and generated support copy distinguish declared online payment from recorded cash or check.
- `b27862a2a7544a1af5e686f7363da8d0b211e8fe` — Checked club overview title and copy assertions against corrected less-retyping claim.
- `02c612e8570a2ac72436a55f4b59dcc5551aa5fd` — Compared client and push-function pending exclusions and explicit NULL inclusion against queue fixtures.
- `08936ab50b10ce56ec156706e9794dde5e4b8eec` — Traced accepted versus declined reset to entry-specific saved-score invalidation.
- `5e0c0f2ae56b2294ec243dfc8562394505bc90c9` — Checked single eligible pull routes through confirmation, multi-entry behavior and Undo assertions.
- `03c087185d78bfb00ddc799f3f2a8add4a1a3880` — Traced unified guard permission/role conjunction, scope forwarding, loading state and current role checks.
- `f22228a6120fccbe9977dbd330c3a3937b9a6458` — Checked official creation timestamp folds into premium publish freshness and picker invalidates publish info.
- `e8e12932b355176742da67d7439527e83072e944` — Compared location column selection, distinct-value trigger, email formatting and calendar feed formatting.
- `dd4487642177931fc54e0401748676b1e13dd880` — Checked manager RPC completion precedes capped replica refresh and onUpdate, with separate exhibitor path.
- `8645c7a4ceeb7c0c921ab1cd6c2cb903a30bf682` — Compared public offline-scoring copy, simulated queue behavior and matching accessibility selectors.
- `16d157b0105066ec6279e14fefb910ca3afa7e7a` — Checked trailer embed ID, privacy-enhanced playback URL and retained separate club-tour link.
- `b1f4448d613a029d8c7282179e64c1ecc34a7f68` — Compared qualification ID/date/status mapping with scoped SQL update, preservation and new-row behavior.
- `41d51ebcb0ce7de42595e2aec4bd4f9abf0a4a28` — Checked retry is limited to one rejected non-verbatim quote, re-verifies output and reports retry outcome.
- `0aaba80048c32ea5b5aa3aaf143d7eb838e2c22d` — Traced prior-session retirement, lease lock, cart stamp and session guards, atomic line/totals write and service-role grant. Focused Vitest passed.
- `b722db0bc04f4604d4ba48a6c2f7444cf6e75f3f` — Checked read-only allowlist against STABLE alteration with function-body and ACL invariants.
- `cd5c8ca9bdbe5456987df24f7dfcc44028df9869` — Checked switch participates in stale field stripping on update and rebuilt resend; explicit writes retain it.
- `ed2ee84046c8e47642b643dbd40797e39aabd0da` — Checked independent setting updates, refused zero-row feedback and SQL same-date, different-trial condition.
- `116599772d55addd6f6569d2e35c8e9ea3c06f58` — Checked CI suite registration and both viewport geometry assertions for prompt and class names.
- `86dd65772c3a39c26746e86146aa6fb98b1dbaa6` — Compared unrun and in-ring criteria with completed/cancelled class gates and registry-specific deadline note.
- `85127959ca0ea397ff7915ca68a8d8605119242c` — Checked common approval core, decline-only delete option, reauth coverage and admin cache invalidation. Parent MYK9-2512 owns UI.
- `59c11d8c7292afc13a693266f9181a890504ab97` — Checked isolated local-stack fixture, 1200-person seed, offline lookup, reconnect assertions and CI artifact gate; browser workflow not run.
- `8d012d534003a781bed8d4188bb92de6e3e92e64` — Checked unknown versus readable refund state, Pulls destination and payout timing wording; ResultsFinishRow suite passed.
- `836fda1e63855539344d14a08502961661c50869` — Checked closed-show edit lock and delete guidance. Reconciled bulk-cancel bypass MYK9-2526 and filed public-status close dead end MYK9-2537. Close-note follow-up MYK9-2508 reconciled.
- `0b30c5bf8d7e64cf4ccf5037f1b4390c0f3798cf` — Inspected four live-row RPC guards, authenticated grants, foreign-key indexes and email-content SQL authorization test registration.
- `8ee0401cef3b80e51ca91ef71a0548cd9e6c4706` — Checked Today selector stays scoped while allowing repeated class headings and traced runner tracing configuration change.
- `cd65b1da5f3ca782f1b1657d7384a7bb43ca14a1` — Checked persisted resolved_at return skips approval email and reminder retry; approvalReminders suite passed.
- `4c1240966e82972186856865c840643620a53425` — Compared generated heal_cart_fees RPC argument names with migration and service wrapper.
- `81cd8eef6c7fc332ade0cb891331cc9840b12d1b` — Checked build-now and publish-after-approval templates branch on new-club creation versus legacy request.
- `dabd01fdef037715beb68d6052160ca2e0c44db7` — Checked isolated offline token expiry, both conflict choices, subsequent queue/server convergence and suite registration; browser workflow not run.
- `d95ff047b9d93f7b9ffc5c40ca1ae9976b7ba281` — Checked shared badge formatting, accessible armband labels and unassigned rendering across exhibitor views.
- `1066e5f17d291aa0d5bbdff6fa36a86053f249ed` — Checked Entry Forms role list includes club admin and role-filter regression assertion.
- `03af148797a9e18a8c88100f74f556ca1694f43c` — Checked secretary and check-in badge uses, confirmation-number fallback and unassigned label handling. ArmbandBadge focused suite passed.
