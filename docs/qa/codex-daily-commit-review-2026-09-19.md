# Codex daily commit review — September 19, 2026

> source: codex · automation: nightly-commit-review

Three new move-up findings are tracked in the existing MYK9-639 and MYK9-640 contracts. The existing wizard verification gap was restored to Linear under MYK9-627, and MYK9-648 was corroborated. No application code, database, deployment or shared fixtures changed.

## Window and review depth

- Shared start, exclusive: `738a5a6cfe7cd7d1431f03f738da5729989100c0`, stamped by Claude September 15 at 09:05 UTC. This supersedes this automation's older private cursor.
- Reviewed endpoint: **`71537ced65ef8b6b3d773fe94e9e023f9817e63f`**; last application baseline **`0c684debe573f02fe9e57c4927f5c1d5baec85a0`**. The endpoint only restores historical audit documentation; its changed provenance was preserved.
- Continuous window: **2026-09-15T09:05:00Z–2026-09-19T13:03:00Z**; **236 first-parent commits**. No 24-hour fallback or intervening SHA/time gap. Audit publication itself is outside this boundary.
- Risk-focused review covered the commit inventory, current combined changes and complete implementations behind candidates: financial roots and consumers, move-up/reversal SQL, withdraw/pull and jump-height RPCs, ledger and role policies, club authorization/access requests, dog deletion/restore, registration/cart recovery, day-of fees, junior-handler mapping, account reads/replication, show navigation/actions, ringside counting, and review-gate tooling. Generated types and mechanical copy/deletion changes were checked against their source changes; this is not a fresh full-app certification or a replacement for MYK9-544's independent review gates.
- Primary checkout and other agents' work were preserved. Review/scratch evidence is in `/private/tmp/myk9-ncr-review-20260919`.

## Lifecycle counts and Linear actions

| Status           | Count | Notes                                                                   |
| ---------------- | ----: | ----------------------------------------------------------------------- |
| New              |     3 | Two P1, one P2; all under existing canonical issues                     |
| Unchanged        |     1 | P2 test/verification prerequisite MYK9-627                              |
| Resolved         |     0 | No fresh closure claim from code alone                                  |
| Duplicate        |     1 | P2 existing MYK9-648; no new issue                                      |
| Rejected         |     1 | QA-RBAC-ID-SPACE-001 as a confirmed user-visible regression; see limits |
| Blocked findings |     0 | Environment/check blocks below are not product findings                 |

Unresolved reviewed items: **P0 0 / P1 2 / P2 3 / P3 0**. Three product data-flow/guard defects, one existing UI data-flow defect, one test/verification gap. Four existing issues updated; **zero created, zero closed**. MYK9-639 and MYK9-640 reopened to Backlog/High; MYK9-627 reopened to Backlog/Medium; MYK9-648 retained Backlog with Medium canonical priority. All carry Codex and written `source: codex`, full execution contracts, ownership or gap, proof and closure criteria. Searches included archived issues by move-up, balance, moneyRoot, linkage/reversal and symptoms; full MYK9-639/640/495/627/648 descriptions and relevant comments were read. Original completed scope is explicitly preserved.

## P1 — unresolved

### NCR-2026-09-19-01 / MYK9-639 — unpaid move-up disappears from exhibitor balances

**New finding; pre-existing mechanism**, not falsely attributed to #2346. Source High; owner Richard Beezley; first/last seen September 19, one Codex run; high confidence in the actual computation. Exhibitor My Shows/My Payments after a secretary moves an unpaid cash/check entry.

The balance mapper reads each row's own fee/payment fields, while eligibility excludes the moved source. A destination is money-neutral and the account projection/derivation never resolves its source. Exact locations: [entryBalanceSummary.ts:163](https://github.com/rbeezley/myk9-platform/blob/0c684debe573f02fe9e57c4927f5c1d5baec85a0/apps/myk9show/src/features/payments/entryBalanceSummary.ts#L163), eligibility at line 225, and the USER_ENTRIES_SELECT/account read. This differs from MYK9-495's already-fixed order-status override.

**Executed proof:** real mapEntryRowToBalanceSource → summarizeEntryBalancesFromSource, a future synthetic show, confirmed/pending cash entry $35: control reports 3500 cents. Mark source moved and add confirmed/pending destination with moved_from_entry_id=source, fee=0 and method=null: expected 3500, **received 0**. Stored debt still exists; its discovery path disappears. No payment loss or duplicate charge was demonstrated.

**Next/closure:** apply the existing root contract to both authoritative and replica exhibitor reads, preserving live identity and one obligation. Red-to-green single-/multi-hop paid/pending/waived/refunded/missing-root controls, real money-surface rendering, and owned online/offline browser balance plus appropriate settlement-action proof. Full contract: [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639).

### NCR-2026-09-19-03 / MYK9-640 — stale Undo can reverse the middle of a move-up chain

**New**, introduced by #2346 / 935dbe05d. Source High; Richard Beezley; first/last seen September 19, one run. Secretary moves A→B; another device moves B→C; first device still holds Undo targeting B.

The real [client resolver:126](https://github.com/rbeezley/myk9-platform/blob/0c684debe573f02fe9e57c4927f5c1d5baec85a0/apps/myk9show/src/features/show-map/moveUpSupersession.ts#L126) accepts B even when its refreshed status is moved. A focused test of reverseShowMapMoveUp(B), mocking only replica/class reads and RPC transport, expected refusal but **resolved successfully with B/A**. [Server RPC:785](https://github.com/rbeezley/myk9-platform/blob/0c684debe573f02fe9e57c4927f5c1d5baec85a0/supabase/migrations/20260918193300_myk9_639_move_up_supersession.sql#L785) checks neither terminal lineage nor live successors. Its CASE maps moved B to confirmed A, then soft-deletes B and leaves C untouched: two live entries and a deleted intermediate payment link.

**Evidence limit:** client submission is executed proof; persisted SQL outcome is a complete source trace, not a live SQL replay. High confidence in the missing guards; no actual score/payment loss asserted.

**Next/closure:** reject nonterminal reversal under concurrency-safe server locking and explain stale Undo. Behavioral SQL must refuse reverse(B) with A→B→C unchanged, pass reverse(C) then reverse(B), and preserve check-in, money, scoring and authorization controls. Require competing-transaction and controlled two-device proof against the applied migration. Full contract: [MYK9-640](https://linear.app/myk9-platform/issue/MYK9-640).

## P2 — unresolved

### NCR-2026-09-19-02 / MYK9-639 — a valid two-hop move-up raises a false missing-money warning

**New**, introduced by #2346. Source Medium; Richard Beezley; first/last September 19, one run; high confidence. Secretary Financial Report and summaries.

[buildMoneyAttribution:153–177](https://github.com/rbeezley/myk9-platform/blob/0c684debe573f02fe9e57c4927f5c1d5baec85a0/apps/myk9show/src/features/financial/moneyRoot.ts#L153) records only ultimate roots as claimed. Real-function A(moved,$35)←B(moved,$0)←C(confirmed,$0) resolves C's money correctly to A, but returns B as orphaned-supersession. Expected unresolved=[], **received [{entryId:'b',problem:'orphaned-supersession'}]**. The shared UnresolvedMoneyRootNotice says the fee/payment is excluded although it was included. This is a false reconciliation warning, not demonstrated missing money.

**Next/closure:** mark all ancestors claimed by valid live lineage. Two-/three-hop aggregate tests must show one run/$35/no warning while genuine orphan, missing and cyclic controls still warn; render both actual reporting surfaces. [Canonical MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639).

### QA-TEST-FLAKE-002 / MYK9-627 — wizard visual-sweep proof remains incomplete

**Unchanged verification/harness gap**, source Low; canonical P2 for incomplete verification. Unassigned; registration E2E ownership needed. First seen September 16; source last rechecked September 19. Original unstable Save Draft click evidence comes from MYK9-545/#2315, not a fresh runtime recurrence today.

Current wizardVisualQA.spec.ts still has serial mode at line 5 and raw dialog clicks at 203, 229, 923; no in-window commit changed that file. The registry remains open and contains no passing closure proof. Cancellation only moved this work to Markdown under an older filing-threshold policy, which the user's current policy explicitly overrides. Reused/reopened [MYK9-627](https://linear.app/myk9-platform/issue/MYK9-627).

**Next/closure:** own the existing helper/dependency criteria and record three consecutive green chromium and mobile-chrome runs executing all applicable cases. Fix/justify serial dependencies and validate affected helper tests. No product defect is inferred; MYK9-517/622 remain separate.

### MYK9-648 — previous show's premium info appears during navigation

**Duplicate of existing open work**, source High; canonical P2; unassigned. First September 17; source last checked September 19. Current usePublishInfo still inherits previous-query placeholder data; the route header/card survives a show-key change and can display A's published state/PDF under B. High source-trace confidence; browser not rerun. [Canonical MYK9-648](https://linear.app/myk9-platform/issue/MYK9-648) updated, no duplicate created.

**Closure:** deferred B-response query-key test plus real A→B browser proof that neither Actions nor the premium PDF ever carries A's information under B, including loading/failure. Original #2325 acceptance remains distinct.

## Reconciliation and exclusions

- Subsequent fixes were considered at the final combined tree: f0c0ac6e2 was reverted by 94b289843 and replaced by reviewed #2336; the temporary revert is not a current regression. Move-up type overlays were removed by #2350, and receipt references were carried through the view/replica by #2351/#2352. Original single-hop waiver/counting and check-in fixes remain valid.
- MYK9-495 is already Done and its entry-first payment mapper is present; the new unpaid-move-up cause is separate. Older memory's MYK9-466/467/494/423/479 entries are historical, not automatically re-reported open after the shared Claude review advanced the cursor. No issue was closed from a merge or an unrelated pass.
- QA-RBAC-ID-SPACE-001 remains inconclusive as a product defect: enhancedContext.userEntries has no identified rendering consumer, live userHasEntries is independently overridden from activeEnteredShowIds, and the two judge permission functions have no production callsite outside their exported map. No fresh filing or resolution claim; the registry's reachability caveat remains.
- Existing separate follow-ups discovered in deduplication (including MYK9-664, 650, 655, 607 and 676) were not duplicated or claimed resolved by this review.

## Checks, limitations and publication

| Check                                     | Outcome                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Financial app tests                       | 22 files / 243 tests pass, using existing local package builds                                      |
| Initial moneyRoot test                    | 12 pass; subset/repeat, not added to unique total                                                   |
| Root review-gate + primary-checkout tests | 2 files / 180 tests pass                                                                            |
| Financial probes                          | 1 positive control pass, 2 intended failures                                                        |
| Stale reverse probe                       | 1 intended failure against real client code; mocked transport                                       |
| Broader app/database/dog batch            | Stopped after no progress; no completed suite verdict                                               |
| qa:dist-fresh                             | Fails: borrowed package builds stale; broad package-dependent results cannot certify current source |
| Dependency bootstrap                      | Blocked by npm DNS failures; install canceled, no rebuild of shared primary outputs                 |
| Reviewed-range git diff --check           | Pass                                                                                                |
| qa:inflight                               | Exit 2, GitHub CLI network failure; not a pass                                                      |

The broader batch printed 28 AKC mapping failures before stalling; its imports use stale @myk9/secretary output, so this is not classified as a current product regression. A mistaken Node test-runner invocation of Vitest files failed at harness import; the correct pnpm Vitest run then passed 180 tests. These are explicit verification limits, not passing checks or filed product defects. No full typecheck/build, fresh browser, applied SQL, payment, load or deployment replay was run. Pure app financial/client probes exercise the current functions; package-dependent coverage is qualified above.

The GitHub connector confirmed the remote endpoint and the final documentation-only recovery commit. Shell DNS blocked git/gh and package download, while Linear writes succeeded. No open GitHub PRs were returned by the connector; current In Progress issues were MYK9-520 and MYK9-501. The latter's recovered docs commit was incorporated, and its retained worktree was clean. This supplements, but does not relabel, the inconclusive inflight command.

Report/cursor/registry publication result is recorded in automation memory and the task response. No hook or PUSH HOLD guard may be bypassed to publish this batch.

## First-parent commit inventory

Every commit in the shared range is listed below; full hashes resolve from Git. Generated/doc-only commits were reviewed as such, with implementation attention prioritized as described above.

- `3c146d76f` docs(qa): record daily commit review 2026-09-15 and stamp the shared cursor
- `720f36320` fix(stripe): RESTRICT the ledger FKs so a show or enrollment delete cannot orphan an order (MYK9-527) (#2261)
- `c56755602` docs(walks): rotate the secretary walk's registry mapping so UKC lands on Sep 16 and Oct 7 (MYK9-524)
- `55a463058` fix(qa): page the review gate's changed-file list instead of trusting one GraphQL page (MYK9-553) (#2262)
- `bda40d230` docs(seed-reset): document the four reseed aborts and the warning as failure modes (MYK9-556) (#2265)
- `7e01892cb` fix(entries): let an exhibitor withdraw their own unpaid entry through an online-only RPC (MYK9-535) (#2263)
- `943d0072e` fix(entries): read My Entries from the authoritative account-scoped view, replica as offline fallback (MYK9-536) (#2264)
- `b9dcc1b05` feat(dogs): let a site admin override the paid/scored delete refusal (MYK9-574) (#2267)
- `d027df008` fix(entries): never seed the show-scoped entries replica from the withdrawal path (MYK9-573) (#2266)
- `2af5903d7` chore(supabase): regenerate database types for force_delete_dog and withdraw_own_entry (MYK9-580) (#2268)
- `ea9d1b64d` fix(rls): scope entries_insert to the row's own show (MYK9-577) (#2269)
- `112aadd1f` fix(ui): center the radio dot and checkbox check inside their controls (#2273)
- `0c73c90ba` feat(access): club-routed show-access requests, appointment stays the only grant (MYK9-571) (#2271)
- `e0b117cb2` fix(dogs): report a refused bulk delete, and stop the cache lying about it (MYK9-584) (#2275)
- `f49ed1ab6` feat(dogs): make dog lifecycle status reachable from the badge and Edit Dog (MYK9-586) (#2274)
- `7a872ce5b` chore(gitignore): keep the local-only impeccable skill untracked in every skill tree (#2276)
- `c8c772564` fix(shows): enforce the draft→published Stripe gate in the database (MYK9-579) (#2270)
- `513932f06` fix(qa): guard the primary checkout against silent uncommitted drift (#2277)
- `719a771fc` chore(claude): version the settings so hook wiring is not one machine's secret (#2278)
- `4029a9eaa` feat(clubs): gate show publication and the public directory on club authorization (MYK9-572) (#2272)
- `d429cedab` docs(plan): Linear backlog burndown 2026-09 orchestration plan
- `e82822a81` docs(plan): record child issue ids and the MYK9-546 probe result
- `af9a68f5e` fix(dogs): keep the dog page and its dialog mounted when a delete fails (MYK9-595) (#2279)
- `70c4977b4` fix(secretary): map AKC Detective to SWDC and fail closed on an unknown class (MYK9-547) (#2280)
- `956c6f9e8` docs(plan): ledger batch 1 merges and new issues
- `880a20870` fix(registration): let the handler name field accept a space (MYK9-567) (#2281)
- `6119c32d7` docs(plan): ledger MYK9-567 merge; batch 1 complete
- `0ff63ca10` fix(seed): rename the load-rehearsal fixture out of engineering shorthand (MYK9-566) (#2282)
- `15a1c96f3` docs(plan): ledger MYK9-566 merge and two new issues
- `73231fac4` fix(dogs): audit, re-sequence and re-place the force-delete cascade (MYK9-596) (#2283)
- `4a85de81c` docs(plan): ledger MYK9-596 SQL merge
- `9f9d3ccca` fix(rls): guard nullable club_id in 16 RLS policies (MYK9-585) (#2284)
- `8def072e5` docs(plan): ledger MYK9-585 merge; batch 2 complete
- `d379a1128` fix(notifications): guard subscribeToPush's raw .ready await with the timeout (MYK9-549) (#2285)
- `5b8a92778` docs(plan): ledger MYK9-549 merge and MYK9-609
- `b5675c7b3` fix(entries): route the exhibitor jump-height save through an own-entry RPC (MYK9-561) (#2287)
- `7fb650c01` docs(plan): ledger MYK9-561 merge and MYK9-610
- `2247db33f` fix(registration): label each Select Classes trial with its day of the week (MYK9-564) (#2286)
- `f303c9873` docs(plan): ledger MYK9-564 merge; batch 3 complete
- `687f4d100` fix(entries): name what opens on the not-yet-open entry badge (MYK9-568) (#2288)
- `d44d9a451` docs(plan): ledger MYK9-568 merge
- `6511965c1` refactor(seed): extract the reseed's paid-stray guard into a tested SQL function (MYK9-538) (#2290)
- `5e57ad2be` docs(plan): ledger MYK9-538/539 merge
- `802a6d475` fix(dogs): treat an unknown blocking-entry count as unknown, not zero (MYK9-600) (#2289)
- `6ff20d3c7` docs(plan): ledger MYK9-600 merge; batch 4 complete
- `68f16c7f1` fix(types): widen withdraw_own_entry's p_expected_version to number | null (MYK9-583) (#2291)
- `600ac4c86` docs(plan): ledger MYK9-583 merge and two new issues
- `a2286dd8f` fix(ui): repoint dead Radix data-state selectors to Base UI data-checked (MYK9-591) (#2292)
- `0c33fb9b3` docs(plan): ledger MYK9-591 merge; schedule MYK9-612 in batch 6
- `5e1aa37b0` fix(ui): render a distinct indeterminate glyph in the shared Checkbox (MYK9-590) (#2293)
- `ed0b1ef6e` docs(plan): ledger MYK9-590 merge; batch 5 complete
- `1aaeb3916` docs(ops): record the 23rd stripe_orders orphan from the 2026-09-16 reseed
- `125cb23fa` Merge origin/main into docs(ops) orphan-record commit
- `1b7d3e841` fix(dogs): give the dogs-table checkboxes a 44px tap target and pin the select column beside Name (MYK9-592) (#2295)
- `f4f15ee54` docs(plan): ledger MYK9-592 merge
- `a6f3fc956` fix(replication): refuse un-opted-in cold INSERTs on show-scoped replicas (MYK9-575) (#2297)
- `55fcc1def` docs(plan): ledger MYK9-575 merge; MYK9-612 redirected
- `1de55f43b` refactor(ui): delete the dead Radix data-state overrides on TabsTrigger and pin the primitive's selected style (MYK9-612) (#2298)
- `2b97b1691` docs(plan): ledger MYK9-612 merge; batch 7 in flight; MYK9-616 filed
- `32e2edfcc` chore(packages): delete dead-code residue from the MYK9-328 sweep (MYK9-551) (#2300)
- `6bf748af0` docs(plan): ledger MYK9-551 merge
- `2c61c6dfa` fix(core): redact Bearer-scheme values in key=value and URL-param secrets (MYK9-550) (#2299)
- `b95af4337` docs(plan): ledger MYK9-550 merge; batch 8 sonnet items dispatched
- `892fe6a0c` fix(dogs): show a read-only lifecycle status badge on every Edit Dog surface (MYK9-594) (#2302)
- `fedd0025d` docs(plan): ledger MYK9-594 merge; MYK9-617 filed
- `b3808d5c7` docs(plan): ledger MYK9-537 PR #2304 in review; MYK9-589 round-1 fixes
- `0d8805a2e` fix(registration): stop emptying the staff dog roster on a people.id/auth.uid compare (MYK9-537) (#2304)
- `2c03458d4` docs(plan): ledger MYK9-537 merge; MYK9-618 filed
- `bfe7f2f8f` docs(plan): ledger MYK9-563 round 2, MYK9-589 round 3 in review
- `5f9d8d121` docs(plan): ledger MYK9-563 blocked on decision; batch 9 dispatched
- `636e98e4f` chore(e2e): delete the dead phase2-show-management-workflow spec (MYK9-589) (#2303)
- `cc5fcf0cf` docs(plan): ledger MYK9-589 merge
- `d8c9e63f7` docs(plan): ledger batch 9 PRs in review
- `34f1c4d09` fix(db): reconcile view_public_entry_results comment with its released-only body (MYK9-552) (#2305)
- `11088deae` docs(plan): ledger MYK9-552 merge (deploy held); 569/562 round 2
- `8cc494291` fix(seed): correct stale § 0 guard text, delete unreachable order guard (MYK9-562) (#2307)
- `dd52f8356` docs(plan): ledger MYK9-562 merge; MYK9-619 filed; batch 10 tooling items dispatched
- `605e0e5bf` docs(plan): ledger MYK9-569 gated, MYK9-554 PR #2308, MYK9-565 audit
- `457f2ac2c` feat(registration): mark the registration a show will use on the dog card (MYK9-569) (#2306)
- `f489bb6c5` docs(plan): ledger MYK9-569 merge; MYK9-560 PR #2309 in review
- `81c039f27` docs(plan): ledger MYK9-565 blocked on decision; 554/560 fix rounds; 582 dispatched
- `e2dc8ca5f` fix(db-push): paginate the migration-collision sweep past 100 files (MYK9-554) (#2308)
- `ce1c7eea3` docs(plan): ledger MYK9-554 merge; MYK9-560 round 2
- `99f2b15a6` docs(plan): ledger MYK9-582 PR #2310 in review; MYK9-560 round 2
- `d3afe7947` docs(plan): ledger MYK9-560 round 2 pushed; MYK9-582 review round 1; MYK9-620 filed
- `92c85e23d` docs(plan): ledger cap raised to 4; MYK9-578 and MYK9-543 dispatched
- `b68ee0559` fix(qa): review-gate follow-ups — synthetic test fixtures, a catch that cannot throw, an if:failure() status fallback, pinned invariants (MYK9-560, MYK9-555) (#2309)
- `3b31a269d` docs(plan): ledger MYK9-560 merge; MYK9-582 round 2 restructure; MYK9-578 PR #2311
- `d51f3bc69` docs(plan): ledger MYK9-543 PR #2312; MYK9-578 diagnosis disproved; MYK9-582 round 2
- `c1c096f78` docs(plan): ledger 582 convergence restructure; 578 round 2; 543 round 1; 622/623 filed
- `e09969bcf` docs(plan): ledger 582 round 4; 578 round 2 corrections; 543 round 2
- `69c979ef3` fix(my-entries): mark a withdrawn class row on a mixed dog card (MYK9-582) (#2310)
- `2a11c4362` docs(plan): ledger MYK9-582 merge; MYK9-578 gate; MYK9-543 restructure
- `60aac1b8b` fix(ci): make the scheduled-failure notifier tolerate an early-closing reader (MYK9-578) (#2311)
- `62b45cc69` docs(plan): ledger MYK9-578 merge; MYK9-541 and MYK9-581 dispatched
- `ec431c3ba` docs(plan): ledger MYK9-543 gate; MYK9-541 PR #2313; MYK9-581 PR #2314
- `28dd0bf29` test(e2e): select the first dog at phone width in the wizard helper (MYK9-543) (#2312)
- `091342766` docs(plan): ledger MYK9-543 merge
- `329ac6029` docs(plan): ledger MYK9-541 round 1; MYK9-581 PR #2314; MYK9-545 dispatched
- `aa8bfc359` docs(plan): ledger MYK9-545 PR #2315; MYK9-581 round 1; MYK9-625-628 filed
- `ae2d839fc` docs(qa): record the wizardVisualQA flake in findings; raise the burndown's filing threshold
- `100544cd8` docs(plan): record the three-round cap, single delta lens, and full-queue rules
- `13ad7f88e` docs(plan): ledger 541/545 round 3; MYK9-540 PR #2316
- `200092213` fix(e2e): bound and log sign-in retries in the smoke helper (MYK9-541) (#2313)
- `6a44a4150` test(e2e): make the registration sweep tolerate staging fixture drift (MYK9-545) (#2315)
- `dd839006f` chore(qa): burn down the scripts typecheck baseline, batch 1 (MYK9-540) (#2316)
- `93d11c916` docs(plan): ledger 541/545 merges, 540 batch 1; fix-round sizing rule
- `b07624c31` docs(plan): ledger MYK9-581 blocked at the cap; MYK9-540 batch 2
- `6fe4aa334` docs(plan): ledger MYK9-563 closed, MYK9-629 PR #2317, MYK9-540 batch 2
- `d1d3672ab` chore(qa): burn down the scripts typecheck baseline, batch 2 (MYK9-540) (#2318)
- `b22d7787a` docs(plan): ledger MYK9-540 batch 2 merge, batch 3; MYK9-629 round 1
- `124cff46f` chore(qa): burn down the scripts typecheck baseline, batch 3 (MYK9-540) (#2319)
- `3a233bebe` docs(plan): ledger MYK9-540 complete
- `f11154f3a` docs(plan): ledger MYK9-629 round 2
- `3c6d8d6ce` fix(entries): derive money once from the confirmed/replica source, keep receipts reachable (MYK9-629) (#2317)
- `5dc05707c` docs(plan): ledger MYK9-629 merge
- `722818b8e` docs(plan): final report for the September backlog burndown
- `2b29a1952` docs(plan): batch 14 (MYK9-593, MYK9-618) after the end-state gap
- `b3cb39d87` docs(plan): ledger MYK9-552 deploy and MYK9-578 AC3 → Done
- `2d3196290` chore(registration): delete the dead people-id-vs-auth-id filterAccessibleDogs closure (MYK9-618) (#2320)
- `b7c197d01` docs(plan): ledger MYK9-618 merge, MYK9-593 in review; findings QA-RBAC-ID-SPACE-001
- `3a6886c4d` fix(rbac): restore the MYK9-618 deletion that b7c197d01 re-added by mistake
- `d2241fcf1` docs(plan): ledger MYK9-593 round 1
- `886137c4a` fix(dogs): surface a swallowed bulk retry and log dialog submit rejections (MYK9-593) (#2321)
- `33928bb46` docs(plan): ledger MYK9-593 merge
- `d37efefa1` docs(plan): ledger owner walks 590/537/575, decisions on 629/581
- `a70c69930` docs(ops): deploy probes must hit the custom domain (MYK9-546)
- `c96e0e43e` docs(plan): ledger batch 15 quick wins (546, 559, 565)
- `1ce407013` docs(plan): secretary show actions inventory (MYK9-630) (#2323)
- `8546ab1e2` docs(plan): exhibitor show actions inventory (MYK9-631) (#2324)
- `ad6a567ab` docs(plan): ledger inventories merged (630, 631), 633 filed
- `341f7e281` docs(audits): secretary task walk 2026-09-17 (UKC week 38)
- `ba359d1bb` docs(plan): ledger MYK9-524 closed on the UKC walk
- `0ddceab04` docs(plan): secretary show actions decisions and phase 2 (one tab row) (MYK9-630)
- `a7f307c4c` docs(plan): header Actions button decision (MYK9-630, MYK9-631)
- `785b05e24` fix(monogram): collapse public show page to one entry CTA (MYK9-565) (#2322)
- `76fbd4df1` docs(plan): ledger MYK9-565 merge
- `eec04f1db` docs(plan): batch 16 dispatched (636, 637, 630 phase 1)
- `9d0e9293c` fix(rls): scope show_announcements mutations to the show's own club (MYK9-636) (#2327)
- `c178cea2d` docs(plan): ledger MYK9-636 merge
- `bb33c9de7` docs(plan): actions placement rule — menu for page verbs, inline for row verbs (MYK9-630, MYK9-631)
- `55241263e` fix(at-show): hydrate the show's entries so the ringside class list stops reading 0 / 0 (MYK9-637) (#2326)
- `9e3bf1b7c` docs(plan): ledger MYK9-637 merge
- `52a99d0fc` docs(plan): settings placement decision (MYK9-630)
- `a9abd4d78` docs(plan): ledger MYK9-541 closed
- `c629a2a97` docs(plan): ledger MYK9-636 deployed and Done
- `629a4000a` docs(plan): batch 17 dispatched (632, 645, 633)
- `600022dbb` fix(at-show): one counting rule across the ringside entry counters (MYK9-645) (#2328)
- `94b946ef5` docs(plan): ledger MYK9-645 merge
- `9e498973b` feat(actions): one header Actions menu backed by a route-context registry (MYK9-630) (#2325)
- `f155a325e` docs(plan): ledger MYK9-630 phase 1 merge
- `5505455e2` docs(plan): queue MYK9-630 phase 2 after 632 and 633 merge
- `92f9edce3` fix(landing): collapse 7 styled show pages to one entry CTA (MYK9-633) (#2329)
- `b5cca4724` docs(plan): ledger MYK9-633 merge
- `121f78d88` fix(entries): Withdraw and Pull are different acts and write different states (MYK9-632) (#2330)
- `978dff620` docs(plan): ledger MYK9-632 merge
- `2b0a8b18b` docs(plan): ledger MYK9-581 restructure re-dispatch
- `17127a575` docs(plan): ledger MYK9-632 migration pushed
- `ad0333ba3` docs(plan): ledger MYK9-632 AC6 walk result
- `7e8c52504` docs(plan): ledger MYK9-630 phase 2 structural batch
- `55ba0ed9d` docs(plan): ledger MYK9-581 PR open
- `c4256cfdf` docs(plan): ledger MYK9-632 follow-up PR open
- `7008d493a` docs(plan): ledger MYK9-630 phase 2 round 1
- `83d24d1b9` docs(plan): ledger MYK9-581 round 1
- `35c04db85` docs(plan): ledger MYK9-632 follow-up round 1
- `7deed7b87` docs(plan): ledger MYK9-630 phase 2 round 1 fixed
- `8906b2c24` docs(plan): ledger MYK9-630 phase 2 round 2
- `9b6c80924` docs(plan): ledger MYK9-632 follow-up round 2
- `b3fca2d75` docs(plan): ledger MYK9-581 round 1 fixed
- `d1b788335` docs(plan): ledger MYK9-632 follow-up delta lens
- `6728307d1` docs(plan): ledger MYK9-632 follow-up gate posted
- `9fe880d61` docs(plan): ledger MYK9-581 delta lens
- `0e74823d7` fix(entries): Edit Entry sheet keeps Withdrawn distinct from Pulled on a fresh load (MYK9-632) (#2333)
- `59edc699b` docs(plan): ledger MYK9-632 follow-up merged
- `56ac1240a` docs(plan): ledger MYK9-581 gate posted
- `ba356aefd` fix(registration): ensureCart returns ready|failed so the class step can never hang (MYK9-581) (#2332)
- `d7322a5bd` docs(plan): ledger MYK9-581 merged
- `cfd12b686` docs(plan): ledger MYK9-631 dispatched
- `ebe916550` docs(plan): ledger MYK9-630 phase 2 deletions batch
- `19812ca5d` docs(plan): ledger MYK9-630 phase 2 final lens
- `f0c0ac6e2` feat(exhibitor): one Actions menu per show card, leave a class from the row, no id fragments (MYK9-631)
- `8730614da` docs(plan): ledger MYK9-630 phase 2 gate posted
- `27cfb413d` docs(plan): ledger MYK9-630 phase 2 owner override
- `d7d11972e` docs(plan): ledger MYK9-630 phase 2 doc-staleness red
- `9a3a12df6` docs(plan): ledger MYK9-630 override re-posted, MYK9-631 worktree
- `94b289843` revert(exhibitor): back out the unreviewed MYK9-631 commits that reached main by mistake
- `15d468030` docs(plan): ledger MYK9-631 unreviewed-push incident and revert
- `10252d38e` docs(plan): ledger MYK9-630 phase 2 stale E2E red
- `790bc6bd2` docs(plan): ledger MYK9-630 phase 2 override on merged head
- `20cb14730` docs(plan): ledger MYK9-631 re-land PR open
- `c68d778f8` feat(shows): one row of six tabs on the secretary show page (MYK9-630 phase 2) (#2331)
- `ee1be7232` docs(plan): ledger MYK9-630 phase 2 merged
- `ac7ece68e` docs(plan): ledger MYK9-631 round 1, 634/635 status
- `d599f96fe` docs(plan): ledger MYK9-634 closed as duplicate
- `728e36191` docs(plan): ledger MYK9-631 round 1 fixed
- `c6d5cdb6a` docs(plan): ledger MYK9-631 delta lens
- `a8d9813f4` docs(plan): ledger MYK9-631 gate posted
- `31c7390fa` feat(exhibitor): one Actions menu per show card, leave a class from the row, no id fragments (MYK9-631) (re-land) (#2336)
- `10d883517` docs(plan): ledger MYK9-631 merged
- `d26854a90` docs(lessons): a docs-only HEAD:main push carries whatever HEAD is (MYK9-631 incident) (#2337)
- `bc1941bc2` docs(plan): ledger LESSONS PR merged
- `7cb5e60a0` docs(plan): ledger MYK9-632 view migration pushed
- `0a1c3d47c` docs(plan): ledger MYK9-632 done
- `5e0ee494b` docs(plan): ledger types regen gate posted
- `87b327647` chore(supabase): regenerate database.types.ts after 20260918041700 (MYK9-632) (#2340)
- `8ced00606` docs(plan): ledger types regen merged
- `84d0fb680` docs(plan): ledger MYK9-630 phase 3 dispatched
- `e1d802aee` docs(plan): ledger MYK9-635 done
- `fab262279` docs(plan): ledger MYK9-570 slice 1 dispatched
- `ca1107b46` docs(plan): ledger MYK9-630 phase 3 PR open
- `7ee54caf6` docs(plan): ledger MYK9-630 phase 3 round 1
- `2ff756d75` docs(plan): ledger MYK9-570 slice 1 PR open, MYK9-630 round 2
- `60f252209` docs(plan): ledger MYK9-630 round 3 cap, MYK9-570 round 1 fixed
- `dc2445dfa` feat(shows): club admins manage the show — six tabs, settings, and reports grouped by phase (MYK9-630 phase 3) (#2341)
- `0de7a17e9` docs(plan): ledger MYK9-630 phase 3 merged, MYK9-570 round 3
- `677954abe` docs(plan): ledger MYK9-630 production green, MYK9-570 final commit
- `4799b808c` docs(plan): ledger Oct 10 test show queue
- `2a97a05f1` docs(plan): ledger Oct 10 decisions, main red after #2341, #2342 gated
- `01f11f65a` refactor(ui): one vocabulary for entering a dog — Add + <noun>, every role (#2344)
- `4d2a845a6` docs(plan): ledger Oct 10 batch 1 in review, batch 2 dispatched
- `f65a3c954` docs(plan): ledger #2346 round 1 restructure, #2345 round 1
- `f2b4e0ea8` docs(plan): ledger stop after in-flight (Richard, token budget)
- `d12f9ac1d` fix(routes): showSectionRedirects warm-refresh tests under shuffled order (MYK9-666) (#2345)
- `c6f7c8357` fix(rls): scope enrollments_select to the show's own club (MYK9-663) (#2343)
- `512bb0324` feat(people): junior handler date of birth and registry number, derived status printed on forms and catalog (MYK9-570 slice 1) (#2342)
- `6e7e59de5` chore(types): regenerate database.types.ts after migration 20260918154700 (MYK9-570) (#2349)
- `3643530cc` docs(plan): ledger stop-phase landings — #2345, #2343, #2342, #2349 merged; 642/659 parked
- `0599698ef` fix(ringside): the class dialogs count the same entries the badges do (MYK9-646) (#2347)
- `cc46cd42f` docs(plan): ledger stop — #2347 merged, #2346 parked; session ends
- `79f3116c6` fix(entries): one rule decides both the day-of-show fee and is_day_of_show (MYK9-642) (#2348)
- `935dbe05d` fix(show-map): a move-up is a supersession, not a waiver — money, check-in and a way back (MYK9-639, MYK9-640) (#2346)
- `85c2f8a2e` chore(types): regenerate database.types.ts after migration 20260918193300 and drop the temporary move-up overlay (MYK9-639) (#2350)
- `b5930067f` fix(exhibitor): the receipt's order reference is the confirmation number, online and offline (MYK9-659) (#2351)
- `199e5b70e` chore(types): regenerate database.types.ts after migration 20260918193700 (MYK9-659) (#2352)
- `0c684debe` docs(plan): ledger — #2346/#2348/#2350/#2351/#2352 merged, 629 Done, 601 reopened; session ends
- `71537ced6` docs(qa): restore September 12-13 audit reports
