# Batch 2 show-day verification

## Isolated verification and closure — 2026-10-15

**MYK9-1204 and MYK9-992 are verified and Done.** The owner explicitly requested isolated verification without changing shared data and closure if every criterion passed. This replaces the earlier shared/deployed fixture gate. The historical read-only preparation below is retained as history.

[Proof run 38815521555](https://github.com/rbeezley/myk9-platform/actions/runs/38815521555) executed and passed both actual Chromium tests with no skips or retries. Tested source/build: `58ae5c5fc5e586edb31ccdaa35349129d539bcbf`. [Synthetic screenshots and JSON](https://github.com/rbeezley/myk9-platform/actions/runs/38815521555/artifacts/12014086941) have seven-day GitHub retention; a local copy is preserved outside the worktree. [Detailed archived verification](../../openspec/changes/archive/2026-10-15-verify-batch2-show-day-reliability/verification.md) retains the failure history, exact acceptance mapping and CLI provenance.

| MYK9-992 case              | Actual SQL / browser / replica result                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NULL, checked-in, unscored | Cold exhibitor: “Position pending: running order not posted yet”; secretary/judge Checked-in. SQL NULL maps to the established optional undefined runOrder. |
| Gapped stored 31 / 101     | Cooper before Willow in secretary/judge; exhibitor “2nd up”; actual hand-placement positions 1 / 2; no raw 101.                                             |
| In ring                    | Each role's own Willow row shows In Ring, without queue position; manual placement is read-only.                                                            |
| Pulled                     | Staff Pulled; exhibitor “I won't be running this class”; no queue position or move controls.                                                                |
| Completed                  | Completed / Q retained, without queue position or move controls.                                                                                            |

Every case used fresh role contexts and SQL plus judge IndexedDB readback. SQL business/version fields remained unchanged during the UI-read comparisons. Existing surface/guide sweep and converted display/print evidence from #2727/#2824/#3047 remain part of acceptance.

**MYK9-1204:** the real judge browser stayed offline from 22:17:59.535 to 23:19:00.192 UTC, monotonic **3,660,657 ms** (61 real minutes). Persisted expiry1792106278 was past before scoring; account unchanged. Online socket positive control passed (8 frames); zero received frames during offline. Q / 61.23 seconds saved through the real UI within 15 seconds, with two durable mutations owned by the original judge. Server remained exactly the unscored baseline at version10. Reconnect refreshed the same account (expiry1792109961); scoring RPC HTTP200 without409; final SQL qualified / 61.23 / completed / version12, clean replica serverVersion12, empty target-entry queue. Cold exhibitor Q / 61.2s and secretary Qualified readback passed.

**Delivery:** [#3049](https://github.com/rbeezley/myk9-platform/pull/3049) merged as `a21694dd70a551c0d93e8b51cdfa74fdd7da47ea`, final head `905248bdb00fdd8f76b58bdd930aa1710c260ef5`. Only documentation differs from the passing source; [independent Claude review](https://github.com/rbeezley/myk9-platform/pull/3049#issuecomment-6204473116) confirmed that relationship and all recorded acceptance. [Final standard CI](https://github.com/rbeezley/myk9-platform/actions/runs/38824067757) passed; pinned-head watcher EXIT0. Both issues received full evidence comments and were verified Done after merge. An automatic non-required repeat38824067545 is preserved but was still running at closure; it is not the evidence used to close the issues.

**Other checks:** full app shuffled 2,997 files / 29,127 tests, root typecheck/lint, proof graph typecheck and exact Node22.12 discovery, 16 isolation guards and 25 artifact contracts passed. Prior preparation ran 5 files / 76 and 13 files / 217 (overlap; do not sum), queue-owner3 and canonical queue56.

**Isolation and cleanup:** all fixture/scoring writes used guarded loopback Supabase on a disposable VM, matching loopback build, runner-only credentials and blocked external application traffic. Credential scan, artifact upload and stop --no-backup passed. Owned browser contexts closed. No shared show fixture, payment, notification, migration push or deployment changed. This proves an already-loaded signed-in judge page; offline cold boot and dead-passcode identity adoption are separate scopes.

**Separate finding:** [QA-TIME-DISPLAY-001](findings.md#qa-time-display-001) remains open: secretary displays1:01.22 for stored61.23 because of fractional truncation; judge/storage retain61.23 and exhibitor intentionally shows61.2s. Queue/state parity and score persistence passed; exact centisecond display parity is not claimed. The P3 finding is report-only pending approved Linear triage. CLI2.121.0 is reconstructed from exact setup action and unchanged registry metadata, not a directly retained executable-version line; future latest-based runs may use a different infrastructure version.

## Historical read-only preparation — 2026-10-15

Date: 2026-10-15. Main baseline `7e73c5fa1848efd1d734544a0c8f89fdc10b0c7d`; served build independently read from myk9show.com as `28c1cb1acc4d086e47277052827866b01ce1f65c`.

**Outcome: preparation passed; neither issue is eligible for closure.** Owner chose **“Prepare checks without shared-data writes.”** No application fixture, score, check-in, payment, notification, class completion, reorder, migration or deployment was performed. Normal sign-ins were used for read-only browser access. The OpenSpec change `verify-batch2-show-day-reliability` remains active with the live proof tasks blocked.

## Scope and prior implementation

- [MYK9-1204](https://linear.app/myk9-platform/issue/MYK9-1204): [#3040](https://github.com/rbeezley/myk9-platform/pull/3040), merged `39da500e248da19d255d8ec5673dc25416f7140d`. Engine fix already queues under the persisted account when the live session cannot resolve; upload still requires the same authenticated account. Remaining: owner browser offline over 1 hour, score/check-in after token expiry, reconnect and verify persisted upload.
- [MYK9-992](https://linear.app/myk9-platform/issue/MYK9-992): [#2727](https://github.com/rbeezley/myk9-platform/pull/2727), merged `bf9089f1d44cba17c6e6e5b090743c20ed36d0a8`; [#2824](https://github.com/rbeezley/myk9-platform/pull/2824), merged `80f17fbc2e313d6bff8f3fdc2aea30f6d061a999`. Canonical queue helper and checked-in/null-position render fix already shipped. Existing issue comments retain the full surface/guide sweep and prior gapped-number browser evidence. Remaining: deployed null/gapped case across secretary/judge/cold exhibitor with SQL/replica readback and in-ring/pulled/completed controls.

No new product defect was reproduced in this read-only scope. Do not reimplement the merged fixes or use green tests as a substitute for the remaining acceptance evidence.

## Tests executed

All commands exited 0. No tests or application source were edited.

From `apps/myk9show`:

```bash
pnpm vitest run src/services/replication/__tests__/offlineExpiredScoreQueue.test.ts src/features/at-show/AtShowMyEntriesToday.queue.test.tsx src/features/at-show/runQueuePlacementParity.test.ts src/features/at-show/myAtShowEntryDetails.helpers.test.ts src/utils/runQueueStatusTable.test.ts
```

Result: 5 files / 76 tests. Covers expired-session queueing, same-owner upload, different-owner hold, no-owner refusal, prompt offline queueing, null/gapped display and state-only controls.

```bash
pnpm vitest run src/components/shows/tabs/WhereToBe.test.tsx src/components/shows/tabs/__tests__/DogEntriesSection.test.tsx src/components/shows/tabs/__tests__/MyEntriesTab.scheduleMessage.test.tsx src/features/_shared/__tests__/entryAccountingGrid.test.ts src/features/at-show/replicatedRunQueue.test.ts src/features/at-show/runQueuePlacementParity.test.ts src/features/emergency-trial-packet/emergencyTrialPacket.test.ts src/hooks/useShowEntriesForUser.test.ts src/lib/reports/toScoresheetModel.test.ts src/pages/ClassDetailsPage/ExhibitorClassCallout.test.tsx src/pages/ClassDetailsPage/useMyEntriesInClass.replicated.test.ts src/pages/ClassDetailsPage/useMyEntriesInClass.test.ts src/utils/runQueueStatusTable.test.ts
```

Result: 13 files / 217 tests, including the converted display/print models. Some overlap with the first run; do not sum these as a unique-test total.

From `packages/replication`:

```bash
pnpm vitest run src/MutationManager.queueOwner.test.ts
```

Result: 1 file / 3 tests, including blocked-storage fallback.

From `packages/ringside`:

```bash
pnpm vitest run src/pages/EntryList/runQueue.test.ts src/pages/EntryList/runQueue.imports.test.ts
```

Result: 2 files / 56 tests. Root `pnpm qa:dist-fresh` passed. Strict OpenSpec validation and diff/format checks passed. Broad CI remains the PR merge gate; no unrelated full local suite was repeated for this prose-only preparation.

## Deployed baseline proof

Today's existing demo show: `dededede-0000-0000-0731-47330ec0b729`; Trial 2: `dededede-0000-0000-0731-154792ee5e03`; class: `dededede-0000-0000-0731-4b5f7ece1a4e`, Container Novice A, 2026-10-15, America/Chicago, 09:00.

| Fact            | SQL                                                      | Deployed browser / replica                                                                                 |
| --------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Willow #200     | run_order 1, no-status, unscored, not in ring, version 1 | Judge “Up next”; secretary “No Status”; cold exhibitor “Scheduled 9:00 AM”, “I am not there yet”           |
| Cooper #201     | run_order 2, no-status, unscored, not in ring, version 1 | Judge “Then”; secretary “No Status”                                                                        |
| Class progress  | 2 live entries; neither scored/checked in                | Secretary 2 entered, 0/2 checked in, 0/2 scored; judge Pending 2 / Completed 0                             |
| Judge IndexedDB | Server values above                                      | Both clean, runOrder 1/2, checkInStatus no-status, isScored false, serverVersion 1; zero pending mutations |
| Ranger fixture  | No entry in today's class                                | No entry created                                                                                           |

The replica’s local recordVersion 8 is distinct from entries.version/serverVersion 1. Before/after read-only SQL compared original selected business/version fields exactly and confirmed no change, plus Ranger count 0. Existing data contains none of the required null/high-gap or terminal-state cases, so this baseline does not satisfy those closure gates.

All application mutation requests were blocked. The initial guard also blocked `ringside_claim_generation_current`; the repository migration and existing sharedStagingWriteGuard confirm it is a STABLE SELECT, so the exact read RPC was then allowed. Earlier heartbeat errors were harness-induced. Judge’s screenshot was taken during “Preparing offline copy”; it is evidence of the visible list only, not proof of offline readiness. Other preparation failures were selector/cwd assumptions, corrected before the passing reads. Existing hero preload warnings were observed; no clean-console or full offline claim is made.

All three owned sessions (`batch2-1792089158931-secretary`, `...-judge`, `...-exhibitor`) closed. No local server was started. Screenshots and logs are retained locally, not exported as attachments.

## Exact remaining procedure — blocked until separately authorized

1. Re-survey today’s fixture and its class/assignment/entry rows; the IDs above are historical evidence, not a permanent target. Never create/re-date a show to force a test. Record existing Willow/Cooper business fields and versions.
2. With explicit owner permission, create exactly one disposable unpaid Ranger entry through the existing secretary UI, record its ID immediately, and verify handler/dog/class in SQL. Take no payment or action that sends a message. If permission remains absent, stop here.
3. On that entry only, fixture setup may set stored run order NULL then 101. Compare checked-in/unscored pending and canonical position across secretary, judge and a fresh exhibitor context. SQL/replica must contain the exact fixture state; response stubs alone are not this proof. Verify in-ring/pulled/completed state-only controls and preserve original entries. User approval must cover any state reset required to return the disposable entry to an unscored baseline.
4. Preload the disposable entry and actual scoresheet as the assigned judge. Record served SHA, same account ID, session expiry and genuine offline wall-clock start without recording tokens. Keep the owned browser offline for at least 61 real minutes, and verify the token has actually expired; no clock/transport stub substitutes for the owner’s live check.
5. After expiry, check in and score through existing UI. Record local-save latency, durable IndexedDB queue owner/payload and unchanged SQL server score while offline. Never clear the judge’s storage while a pending score exists.
6. Reconnect/re-authenticate as the same judge, track every scoring RPC/status, and verify exact server score/check-in, accepted versions, a single entry and empty queue. A different-owner engine control must remain passing. Cross-check secretary and cold exhibitor values. No class completion/release.
7. Teardown only the disposable entry: delete if allowed, otherwise pull and explicitly record any residue. Compare all captured original fields, close each owned session, and preserve evidence. If a failure prevents safe upload/cleanup, preserve the local queue and report exact residue rather than claiming success.
8. Only after all criteria pass: finish required review/CI/merge/deployment gates for any correction, re-read both full issues, post evidence and move them to Done. Do not archive the active change before these gates or an explicit owner-approved acceptance replacement.

## Coordination

The standard in-flight command stopped on unrelated dirty primary README/audit-boundary files. The scoped warning-mode diagnostic completed with no overlap among 194 sources; it was not treated as a clean primary-checkout gate. Manual Linear In Progress survey and open-PR inventory found no competing work on these new report/change paths. Unrelated primary files and other worktrees were preserved.
