# Codex daily commit review — 2026-10-12

source: codex. Review complete through `4ea223bc69d7646cc6cfbda653c88ec502b0e4fd`.

Reviewed 16 commits / 161 changed files from `7021fe423f8bbf715fcec40de6eee8aa5e43868d` exclusive through the baseline above inclusive. Window: 2026-10-11T10:15:37Z–2026-10-12T10:10:37Z. The shared cursor, not the scheduler timestamp or private memory, supplied the start. No gap or 24-hour fallback. Refreshed origin/main twice; it matched local main and stayed unchanged.

No new P0/P1 regression was confirmed. Two historical P2 defects explicitly encountered in the new Quick Create plan remain reproducible and were filed automatically. One carried P2 now has passing deployed closure proof. No application code changed.

| Lifecycle | Count |
| --------- | ----: |
| new       |     2 |
| unchanged |     3 |
| resolved  |     1 |
| duplicate |     0 |
| rejected  |     2 |
| blocked   |     4 |

Ten canonical records: all P2. Four unresolved product/UX records and five verification prerequisites; one resolved UX record. Existing canonical reuse is counted under unchanged/blocked, not again as duplicate. Linear created 2 (MYK9-1111/1112), modified 3 existing (MYK9-1085/1011/1023), closed 0. MYK9-1111 received a same-run source-link correction. No confirmed actionable finding awaits filing.

## P2 — new historical findings

### MYK9-1111 / NCR-2026-10-12-01 — duplicate person selection is dropped

[Canonical Linear contract](https://linear.app/myk9-platform/issue/MYK9-1111). Product UX/recovery; source Medium, high confidence. First documented October 11 in plan F3; first focused reproduction and last seen October 12; first nightly run. Owner Richard Beezley. Baseline as above. Secretary Add Entry → Quick Create / Add Person Only, viewport-independent source/component failure.

[CreateExhibitorDialog.tsx:216](https://github.com/rbeezley/myk9-platform/blob/4ea223bc69d7646cc6cfbda653c88ec502b0e4fd/apps/myk9show/src/components/shows/RegistrationWorkflow/CreateExhibitorDialog.tsx#L216) calls optional `onDuplicateSelected` then closes. Both [QuickCreateFlow.tsx:198](https://github.com/rbeezley/myk9-platform/blob/4ea223bc69d7646cc6cfbda653c88ec502b0e4fd/apps/myk9show/src/components/shows/RegistrationWorkflow/QuickCreateFlow.tsx#L198) and DogSelectionStepEnhanced.tsx:397 omit it.

Executed real-component proof: seed synthetic Molly Mailbox/molly@example.test; fill matching name/email; Next: Contact → Use This Person. No create call occurs, but the flow returns to Add Person. The assertion that Add First Dog is available fails with null. Expected: select the existing identity and proceed. Impact: lost selection, unnecessary exit/search and duplicate-creation risk; no database deletion alleged.

Next/closure: wire both existing hosts, retain the existing ID and proper offline dependencies, do not mark it newly created. Passing host tests for online/offline, no create calls, Add Anyway/non-match controls and a secretary browser replay. Full execution contract is in Linear. #2915 preserves this pre-existing behavior; it did not introduce it.

### MYK9-1112 / NCR-2026-10-12-02 — Edit opens a blank create form

[Canonical Linear contract](https://linear.app/myk9-platform/issue/MYK9-1112). Product UX/recovery; source Medium, high confidence. First documented October 11 in plan F6; focused proof/last seen October 12; first nightly run. Owner Richard Beezley. Secretary batch Quick Create, all viewports.

[QuickCreateFlow.tsx:97](https://github.com/rbeezley/myk9-platform/blob/4ea223bc69d7646cc6cfbda653c88ec502b0e4fd/apps/myk9show/src/components/shows/RegistrationWorkflow/QuickCreateFlow.tsx#L97) removes the saved dog from flowState immediately, then opens AddDogPanel without the existing dog's ID/data. Person Edit Details similarly opens CreateExhibitorDialog rather than an editor. Source confirms selection cannot be restored by cancel; persisted rows are not deleted.

Executed proof: real flow adds person, adds Ziggy, clicks dog Edit; expecting Call Name='Ziggy' fails with empty input. Expected: edit the same record, retain selection on cancel/failure. Impact: re-entry, selection loss and duplicate risk, not demonstrated stored-data loss. Next: use/link the canonical editor or remove misleading edit controls. Closure requires identity-preserving edit/cancel/failure/success controls, no create API for existing IDs, and secretary browser proof. Full contract in Linear. This is an older unfiled defect, not attributed to the conversion commit.

Dedup for both: archived-inclusive searches by workflow, file, callback, action and symptom; exact MYK9-1081, MYK9-931 and MYK9-1085 read; current implementation, preceding version and merged PR #2915 compared. MYK9-1081 deliberately excludes these behavior repairs in its linked plan, so completed conversion work was not reopened.

## P2 — unchanged and blocked

All rows use current baseline `4ea223bc69d7646cc6cfbda653c88ec502b0e4fd`, last seen October 12, source codex. Existing evidence contracts remain authoritative; no new runtime failure is alleged for verification-only records.

| Canonical / lifecycle                                                    | First seen; source; owner                                      | Current evidence and next exact proof                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MYK9-1097](https://linear.app/myk9-platform/issue/MYK9-1097), unchanged | Oct11; Medium; Richard; second nightly                         | ClassActualStartEditor.tsx:35 catches failed clear, but its non-edit branch :49 omits the alert. Unchanged source; prior failing real-component proof stands, five existing controls pass again. Show visible failure, preserve time and prove retry with rendered failure→feedback→success.                                                                                                                                                                                 |
| [MYK9-834](https://linear.app/myk9-platform/issue/MYK9-834), unchanged   | Sep26; Medium; Richard; carried                                | useAuth.ts:175 / useRehydrateRingsideGrant.ts:142 identity repair stands. Latest issue/comments still lack deployed refocus→expiry→offline reload→durable score→reconnect upload with identity/revocation controls. Keep In Review.                                                                                                                                                                                                                                          |
| [MYK9-1085](https://linear.app/myk9-platform/issue/MYK9-1085), unchanged | Oct9; Medium; assignment gap retained                          | Existing overlay audit owns remaining Add Dog panel/dialog registration stack. AddDogPanelContent.tsx:237 mounts a second SlideOverPanel when !inline; #2915 only fixes inline. Added self-contained F1 source evidence, acceptance and signed-in 375/768/desktop proof gate. Existing inline behavior passes; no fresh browser geometry claim.                                                                                                                              |
| [MYK9-1011](https://linear.app/myk9-platform/issue/MYK9-1011), blocked   | Oct4, residual Oct11; Medium; Richard; second residual nightly | #2904 fixes performanceStatsEngine.ts:86, class QualificationCell.tsx:88 and AskQ toolDefinitions.ts:64. Current engine/chart/editor/exact-filter tests pass. Oct11 comments record frontend and AskQ deployment. Remaining: browser DQ/reason persist/reload/chart, live AskQ DQ-filter fixture, authoritative AKC electronic mapping plus generated-file proof. Updated Linear; do not refile repaired reader defects or allege the export code is wrong without evidence. |
| [MYK9-992](https://linear.app/myk9-platform/issue/MYK9-992), blocked     | Sep28; Medium; Richard; seventh daily reconciliation           | MyEntryRow.tsx:87 retains position/pending line; #2902 extracted/reordered the prior implementation. Current queue/ordering tests pass. Still need authorized secretary/judge/cold-exhibitor null/gapped-order comparison with SQL/replica, state-only controls and cleanup.                                                                                                                                                                                                 |
| [MYK9-1021](https://linear.app/myk9-platform/issue/MYK9-1021), blocked   | Oct6; Medium; Richard; sixth daily reconciliation              | offerStep.ts:64 and 20261007012700 notice migration unchanged. Applied/CI proof stands; human notice gate open. Need authorized mail-in head + free spot, one actionable secretary notice, repeat-zero/no online skip, row/build proof and cleanup.                                                                                                                                                                                                                          |
| [MYK9-639](https://linear.app/myk9-platform/issue/MYK9-639), blocked     | Sep17 (audit Sep19); Medium, historical High; Richard          | paymentReconciliationLoader.ts:161 unchanged. Owner-deferred controlled Stripe TEST proof remains unrecorded; Oct11 hold supplies no authorization. Need approved one-/two-hop, both callers, root paid once, ledger/report/offline readback and negative controls.                                                                                                                                                                                                          |

## P2 — newly resolved

[MYK9-1023](https://linear.app/myk9-platform/issue/MYK9-1023), source High historical / current P2, first October 6, last October 12, owner Richard. The October 12 show-day walkthrough comment at 08:29 UTC records build `49692674c`: server 65s/v6 stays unchanged while offline correction to58s displays on-device/pending wording; reconnect performs successful ringside updates, SQL becomes58s/v8 and panel then says Score saved. This satisfies the previously missing deployed local/server distinction proof. Fresh `quickAdvancePanel.saveState` controls pass. Audit lifecycle is resolved, but Linear remains In Review because this run does not exercise separate issue-closing approval. Added this reconciliation directly to Linear. MYK9-1106 correction latency and MYK9-1110 punctuation are separate.

## Subsequent fixes and rejected candidates

- #2904 repaired yesterday's DQ downstream code failure; full MYK9-1011 closure remains blocked as above.
- #2903 added combined max-time targeting, #2905 added per-area persistence/timing, #2907 added offline range/gate behavior, #2909 supplied rule warning/ASCA behavior, and #2911 aligned empty-area defaults with the scoresheet. Reviewed the latest combined implementation rather than reporting superseded intermediate gaps.
- Rejected ordinary-account NULL authorization-bypass hypothesis: the missing show claim is explicitly `IS NOT NULL`, making the claim conjunction false; no demonstrated ordinary-account bypass. Behavioral SQL includes manager/assigned judge/unassigned/steward/cross-show/revoked cases, though not executed here.
- Rejected stale plan F7: #2915 adds actual Edit/Remove registration accessible names and tests pass. Do not file already-repaired work.
- Plan F2/F4/F5 are design/refactor options without a newly demonstrated defect; F9 is unmeasured geometry. F8 is already explicitly classified outside the active nightly set in the E2E map; the stateful suite is deliberately isolated/manual/weekly. No blanket promotion to shared staging or invented product finding.

## Checks and limits

Isolated worktree `/private/tmp/myk9-ncr-20261012`, branch `codex/ncr-review-20261012`; bootstrap dependencies and12 cached package builds passed. Initial restricted-network install was stopped, then approved bootstrap succeeded. No test runner hung.

- Changed app:37 files/329 tests.
- Scoring UI:6 files/73 tests.
- Ringside:2 files/8 tests.
- Replication mutation executor:1 file/25 tests.
- Root behavioral-SQL registration and AskQ exact-filter:2 files/10 tests.
- Carried actual-start/score-save controls:2 files/12 tests.
- Total:50 files/457 existing tests passed, shuffled seed20261012.
- Additional real Quick Create diagnostic run:2 controls passed;2 deliberate new expectations failed, proving MYK9-1111/1112. Diagnostic source and log retained under `.logs/QuickCreate.proof.test.tsx` and `.logs/quick-create-proof.log`; temporary test removed from app source. It exercised type-correct synthetic person/dog shapes, with no live data.
- `git diff --check 7021fe423 HEAD` passed. No app changes remain.
- No full app suite/typecheck/lint, browser/mobile screenshot walk, live SQL/behavioral SQL execution, production auth/score/notification/Stripe/AskQ replay or external AKC-format verification performed. Existing walkthrough evidence is attributed, not represented as this audit's own live action.
- No commit/push/PR/merge/deploy/database/fixture/payment/notification operations. Only review documentation, shared cursor and automation memory changed. Retain worktree for proof logs. Linear is the work queue.

## Commit inventory, oldest first

- `bd1001a7d` — feat(ringside): judge write path for classes; ringside status and max time reach the server (MYK9-1096, MYK9-1086) (#2901)
- `6a424796b` — feat(at-show): one run-ordered list of your dogs today, linked from My Shows on show day (MYK9-1046) (#2902)
- `869866e9c` — feat(ringside): Set Max Time from combined A/B lists (MYK9-1086) (#2903)
- `6daa0f1b3` — docs(plan): ringside max time and requirements, modelled on myK9Q (MYK9-1098..1103)
- `f34cab08a` — docs(qa): record Codex daily commit review 2026-10-11
- `3219b51da` — fix(results): DQ reaches dog statistics, the class results editor and AskQ (MYK9-1011) (#2904)
- `23fcec0b9` — feat(ringside): a max time per area for multi-area classes (MYK9-1098) (#2905)
- `f277f6852` — feat(ringside): max time before the first dog; range, quick picks, rulebook times in Set Max Time (MYK9-1099, MYK9-1101) (#2907)
- `b4f508201` — fix(dogs): registration Add/Edit is a mode inside the Manage panel, not a second slide-out (MYK9-1089) (#2906)
- `f11882560` — feat(ringside): Requirements from the shared cards, offline, led by the class max time (MYK9-1100) (#2908)
- `3b86996cc` — feat(ringside): 30-second warning from the class rule; ASCA times each area (MYK9-1102, MYK9-1103) (#2909)
- `c121efe74` — chore: regenerate database types; archive the ringside max time plan (#2910)
- `70495de23` — fix(ringside): Set Max Time starts an empty area at area 1's time; neutral hint (#2911)
- `49692674c` — fix(scoring): no em dashes in scoresheet text; "1 entry" in Requirements (#2914)
- `f206d00b7` — docs(plan): Quick Create as one slide-out hosting Person, Dog(s) and Review (MYK9-1081)
- `4ea223bc6` — refactor(registration): Quick Create is one slide-out hosting Person, Dog(s) and Review (MYK9-1081) (#2915)
