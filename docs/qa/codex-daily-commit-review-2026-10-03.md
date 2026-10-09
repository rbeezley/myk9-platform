# Daily commit review — 2026-10-03

source: codex. Automation: nightly-commit-review. Completed review baseline: `e95bb1ea6e3da7d387d60b8111fb2489dac9a9ba`.

## Coverage

- Exclusive start: `342c68e0cde2fa9652b797be6240454a2462d268`, from the primary checkout's shared daily-commit-review row (including the prior run's uncommitted cursor).
- Inclusive end: `e95bb1ea6e3da7d387d60b8111fb2489dac9a9ba`, fetched origin/main snapshot. Primary local main was older; review used an isolated worktree at the fetched main.
- Window: 2026-10-02T14:07:31Z through 2026-10-03T14:03:51Z. Thirty commits; 355 changed files. No gap between the previous window end and this window start; no 24-hour fallback. First included commit was at14:44:05Z October2; no commit was skipped during that idle interval.
- Reviewed authorization SQL, dog/person permissions, offline identity and replication, show-home consolidation and redirects, closeout, cart recovery, admin lists, QA tooling, changed tests and supporting plans. Subsequent fixes inside the window were assessed at the final baseline, not reported as still-broken intermediate states.
- Method: quality-finding-lifecycle, repository INTENT and scorecard, archived-inclusive Linear deduplication, prior memory and QA registry. Linear is the work queue; this report is evidence/history.

## Counts

| Status                             | Count |
| ---------------------------------- | ----: |
| New                                |     1 |
| Unchanged                          |     1 |
| Resolved since previous full audit |     6 |
| Duplicate                          |     0 |
| Rejected                           |     0 |
| Blocked on remaining proof         |     3 |

The six resolutions include evidence already recorded during intervening remediation follow-ups; they are not six newly discovered fixes. MYK9-949 was already resolved in prior memory and is excluded from this ledger. No new P0 or P1 finding. Four existing items remain open/proof-limited, plus the new P2.

## P0

**Resolved — [MYK9-939](https://linear.app/myk9-platform/issue/MYK9-939), nullable ownership in own-entry RPCs.** Source severity Critical; source: codex. First seen2026-10-02; last reconciled2026-10-03; baseline above. PR2672/fc32b8471 replaces nullable authorization with an affirmative guard in `supabase/migrations/20261002151743_myk9_939_withdraw_ownership_fail_closed.sql` and `20261002151829_myk9_939_jump_height_ownership_fail_closed.sql`. Real migration-chain CI passed17 ownership controls. The owner's October2 comment records installed definitions, SECURITY DEFINER/ACL verification, stranger refusal42501 for both RPCs on a NULL-handler entry and positive owner controls in a rolled-back transaction. This is behavioral/applied proof, not resolution inferred from merge. No shared SQL probes repeated this run.

## P2

**New — [MYK9-965](https://linear.app/myk9-platform/issue/MYK9-965), NCR-2026-10-03-01: pending-entry link shrinks on tablets.** Source Medium; source: codex. First/last seen2026-10-03; owner Richard Beezley; baseline above. Classification UX/accessibility/product-intent regression. [Exact source line35](https://github.com/rbeezley/myk9-platform/blob/e95bb1ea6e3da7d387d60b8111fb2489dac9a9ba/apps/myk9show/src/components/schedule/ClassEntryBreakdownLine.tsx#L35), introduced by PR2678/59f130c21. Secretary show-home schedule's class-specific pending-review link uses `min-h-11 sm:min-h-6`.

Actual unchanged component plus app CSS in isolated Chromium measured73.96875×44px at375px, and73.96875×24px at768px and1440px. Computed minimum height agrees, both pseudo-elements are absent, and a point5px above the anchor does not hit it. Caller inspection found no ancestor forwarding clicks to the pending-review destination. The target falls below INTENT's44px floor on the intended tablet workflow. Confidence high; no failed navigation or WCAG AA violation alleged. Full authenticated workflow was not replayed.

Archived-inclusive searches covered component, pending route/symptom,44px, touch-target and responsive-min-height causes; exact MYK9-943 and277 read. Their completed scopes predate this regression. Linear contains the complete execution contract. Next action: preserve at least44px effective target, exact filtered destination and keyboard behavior without overflow/parent activation. Closure: focused tests plus actual manager-schedule browser dimensions and navigation at375/768/1024/1440 at the fix SHA.

**Unchanged — [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834), offline ringside identity durability.** Source Medium; source: codex. First seen2026-09-26 (specific reaffirmation regressionOctober2); last reconciledOctober3; owner Richard; baseline above. PR2672 fixes same-user SIGNED_IN clearing the fallback. Current real auth reaffirmation tests pass. Remaining exact gate: deployed refocus→expired-token offline reload→local score durable write→reconnect queued upload, including invalidation controls. Existing full issue owns that proof. No current score loss alleged, no deployed session/fixture operations performed.

**Blocked — [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639), moved-entry settlement operational proof.** Current classification verification prerequisite, source Medium/P2; historical money defect P1 retained separately. source: codex. First seenSeptember19–20; last reconciledOctober3; owner Richard; baseline above. Source fixes remain in main; controlled Stripe TEST replay/readback remains owner-deferred until afterOctober10. Both callers, one/two-hop settlement, exactly-once root payment, authoritative/offline/report readback and negative controls remain the closure contract. No payment operation or new financial defect asserted.

**Blocked — [MYK9-947](https://linear.app/myk9-platform/issue/MYK9-947), PR watcher attempt ordering proof.** Source Medium; source: codex. First seenOctober2; last reconciledOctober3; owner Richard; baseline above. PR2680/b9fef672b fixes current-attempt ordering. Current focused fixtures pass. Latest owner comment retains the real no-merge draft→ready/rerun observation on main. That external transition was not triggered by this audit; existing issue owns the prerequisite. Do not equate fixture success or merge with that missing proof.

**Resolved — [MYK9-937](https://linear.app/myk9-platform/issue/MYK9-937), deploy-picker tests exceeding default timeout.** Test/harness classification, source Medium; source: codex. First seenOctober2; last reconciledOctober3; baseline above. PR2672 retained exact50/>50, pin, first-parent and API-error assertions with faster fixtures. Current focused picker tests pass within the normal budget; actual Quality CI job110992270967 also passed. No timeout override used.

**Resolved — [MYK9-938](https://linear.app/myk9-platform/issue/MYK9-938), trial tombstones lost during sync.** Source Medium; source: codex. First seenOctober2; last reconciledOctober3; baseline above. PR2672 preserves tombstones through mapper/replication and protects dirty rows. Current tombstone controls pass. Recorded owner acceptance replaces the separate browser gate with focused proof. No resolution inferred solely from code.

**Resolved — [MYK9-940](https://linear.app/myk9-platform/issue/MYK9-940), judge assignment failures reported as successful save.** Source Medium; source: codex. First seenOctober2; last reconciledOctober3; baseline above. PR2672 propagates assignment errors through class editor; current rendered classJudgeSave controls pass. Recorded owner acceptance substitutes the focused proof for the browser criterion.

**Resolved — [MYK9-648](https://linear.app/myk9-platform/issue/MYK9-648), previous-show premium state proof.** Source Medium; source: codex. First recordedSeptember19; last reconciledOctober3; baseline above. Owner's October2 comment explicitly replaces the browser A→B criterion with PR2400 real HeaderActions/PremiumDownloadCard deferred/failing-B rendered proof. Existing source fixes2355/2362 and mutation-checked tests satisfy that revised contract. No shared publish/unpublish operation performed.

## P3

**Blocked — [MYK9-950](https://linear.app/myk9-platform/issue/MYK9-950), generated-types drift formatting diagnostics.** Harness classification, source Low; source: codex. First seenOctober2; last reconciledOctober3; owner Richard; baseline above. PR2684/b8e3c4aef and2688/d138ffc05 normalize quoted keys/layout/object wrapping. Current detector controls pass. Read actual [PR2693 CI job111129207159](https://github.com/rbeezley/myk9-platform/actions/runs/37097121768/job/111129207159):0 missing/extra objects,160 changed lines. Displayed80-line sample contains Json→NonNullable<Json>; the log explicitly truncates the remainder. This supports removal of the false object list but cannot establish that every remaining delta is substantive. Full generated comparison/classification remains the existing closure gate. Report-only job success is not no-drift proof. Updated canonical issue with the exact evidence and limitation; no duplicate formatting issue.

**Resolved — [MYK9-936](https://linear.app/myk9-platform/issue/MYK9-936), legacy wizard schedule resume.** Source Low; source: codex. First seenOctober2; last reconciledOctober3; baseline above. PR2672 migrates old persisted schedule shape; current hydration controls pass. Recorded follow-up includes actual legacy-draft browser resume at584bfd341 and owner acceptance of focused proof. No application data migrated during this audit.

## Verification and limitations

- 36 focused files /447 tests passed: app batches8/82,11/140,13/161 and QA-tool batch4/64. All exited0. Covered auth, tombstones, wizard hydration, cart pricing/recovery, dog access, show-home model/rendering, class checklist/setup/save, closeout, redirects, admin lists, migration source contracts, watcher, deploy picker, types drift and SQL test registration.
- Browser probe used real component/CSS with synthetic counts. Own session `ncr-20261003-probe` closed and verified; own Vite server stopped. Temporary probe files removed. No application code change remains.
- SQL behavioral controls were not rerun locally: no local container database. Existing actual migration-chain CI and owner's applied actor evidence are attributed explicitly. Source-contract tests do not substitute for actor proof.
- No full app suite, deployed authenticated walkthrough, Stripe operation, database mutation, frontend/edge deployment, PR creation, push or issue closure performed.
- Bootstrap needed network escalation after restricted install failed; successful bootstrap rebuilt shared packages. Initial local server/cache sandbox limitations were resolved with scoped approval. They were environment limits, not product findings.
- QA logs live in the retained worktree `.logs`; complete actionable contracts and sanitized findings are in Linear. No secrets or customer records exported.
- Linear created: MYK9-965. Updated evidence: MYK9-834,947,950. Existing states/owner deferrals preserved; no issue closed by this run.
- Shared cursor and automation memory stamped to the same reviewed SHA/window end. Audit docs remain local and uncommitted; no repository publication requested.

## Reviewed commit inventory

- `6d8301ca6` fix(rbac): only a site admin or the person deletes a person; no dog delete for show staff (MYK9-934) (#2668)
- `6e38d748f` docs(plan): Overview schedule as the secretary's hub
- `a07686449` chore: remove seven dead files left by the CRUD and UI phases (#2669)
- `5e95707aa` docs(plan): revise Overview schedule hub against current main
- `b5d3a104f` feat(dogs): non-owner secretary note + header Actions more icon (MYK9-935, MYK9-932) (#2670)
- `04e0a6124` feat(schedule): Overview schedule as the secretary's launcher (MYK9-942) (#2673)
- `fc32b8471` fix(qa): repair nightly authorization, replication and workflow regressions (#2672)
- `e57bdd383` docs(plan): replace next-step chips with a per-class checklist (MYK9-948, MYK9-943)
- `7b0f1a8a7` fix(security): create_dog_with_registrations fails closed with no people row (MYK9-946) (#2674)
- `584bfd341` chore(types): regenerate delete_preview RPC type (MYK9-949) (#2675)
- `4eb1ce707` test(dogs): pin today's scored run vs tomorrow's upcoming on a running show (MYK9-869) (#2676)
- `75a1bf9fa` feat(show-day): per-class checklist in the focused-class panel (MYK9-948) (#2677)
- `59f130c21` feat(schedule): per-class entry breakdown with a pending link (MYK9-943) (#2678)
- `5a5b2b4dd` docs(plan): secretary show home — one page for Overview, Show Day and Setup
- `7240ee083` docs(plan): show home ships before the test show; collapsible trials (owner, 2026-10-02)
- `c52798e06` docs(plan): Phase 1 decisions — closeout to Results step 3, packet stays in Tools → Show day
- `841ba7afe` feat(admin): list toolkit on health, permissions, deleted items and help (MYK9-814 part 2) (#2679)
- `b9fef672b` fix(qa): watcher judges each check by its current attempt (MYK9-947) (#2680)
- `7de94fb8f` feat(admin): unknown list counts and Support on the list toolkit (MYK9-814 part 3) (#2682)
- `6286fe265` fix(admin): Help and Permissions fit a 375px phone (MYK9-960) (#2683)
- `b8e3c4aef` fix(qa): types drift check normalizes quoted keys and layout (MYK9-950) (#2684)
- `d0c6aba61` fix(dogs): let co-owners write dog registrations (MYK9-941) (#2686)
- `9a94a66d8` feat(show-day): slim Tools to two groups; move closeout, add-entries and delay script home (MYK9-954) (#2681)
- `29a4dc0aa` chore(list-toolkit): delete retired list controls, add import guard (MYK9-817) (#2687)
- `d138ffc05` fix(qa): types drift diff ignores source object wrapping (MYK9-950) (#2688)
- `11e4dbab8` feat(show-home): the secretary's Overview becomes the show home — All days, quiet mode, collapsible trials (MYK9-955) (#2690)
- `15fe5658b` feat(show-home): fold Setup into the show home — trial actions, Edit class, Select classes (MYK9-956) (#2691)
- `53854eaa5` fix(entries): junior handler price in the wizard, and tell exhibitors when cart recovery drops entries (MYK9-838, MYK9-873) (#2685)
- `a7f7ad820` feat(show-home): four tabs — delete Setup and Show Day (MYK9-957) (#2692)
- `e95bb1ea6` chore(show-home): remove dead Show Map props and features.showMap (MYK9-962) (#2693)
