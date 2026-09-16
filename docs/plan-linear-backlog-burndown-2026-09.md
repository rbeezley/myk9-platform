# Linear backlog burndown — 2026-09-15/16

> **Status:** Active

Orchestrated clearance of every MyK9-platform issue in Todo or In Progress on 2026-09-15 (UTC). Each issue ends merged, PR-ready-but-blocked on an owner decision, or re-filed/split/closed with a comment. Codex is out of tokens until 2026-09-19 05:01 UTC, so `independent`-floor PRs merge under the owner override (`Deferred re-review: MYK9-544`) with two or more adversarial Claude lenses standing in.

## Ground rules

- Orchestrator (Fable) plans, briefs, judges reviews, merges, updates Linear. Sub-agents implement and review. Opus for data flow / RLS / replication / scoring / money; Sonnet for mechanical work. At most 3 sub-agents at once.
- One PR per issue, branch `myk9-<n>-<slug>`, so the merge flips the issue to Done. Batches fan by **file set**, not by logical PR; a batch finishes (merged or explicitly blocked) before the next starts.
- Review: `pnpm qa:review-tier --base origin/main` on every PR. `adversarial` and `independent` floors get 2+ opus lenses told to find bugs. Convergence rule: second finding on the same path across rounds, or a finding about code the previous fix introduced, stops the patching and posts a restructure proposal.
- A merge is not a deploy. Migrations and edge functions are collected under **Needs deploy** for Richard; their issues stay short of Done.

## Triage decisions (before any code)

| Issue                        | Decision                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MYK9-544, MYK9-559, MYK9-501 | Labeled `Codex`; skipped (other harness).                                                                                                                                                                                           |
| MYK9-520 (In Progress)       | Blocked on the next Dependabot PR (Monday 2026-09-21 06:00 UTC). Code merged in #2232; operator setup done. Comment; leave In Progress.                                                                                             |
| MYK9-524 (In Progress)       | Blocked on the 2026-09-16 secretary walk report (UKC week). Code merged in #2241. Comment; leave In Progress.                                                                                                                       |
| MYK9-546 (Urgent)            | Shared Vercel settings: read-only investigation only, then a blocked comment naming the alias fix for Richard.                                                                                                                      |
| MYK9-576                     | Superseded: the deferred review it placeholds ran early as MYK9-595/596. PR #2267 becomes a row in MYK9-544's ledger; 576 closed as duplicate of 544.                                                                               |
| MYK9-570                     | Feature, money path, new surface area; four product decisions unanswered. Blocked comment naming them; not built.                                                                                                                   |
| MYK9-587                     | Decided: option 1 (leave as is; the dog page is the single-dog surface, the bulk bar the multi-dog one). Closed; the comment fix lands in MYK9-588.                                                                                 |
| MYK9-588                     | Option 1 consequence: delete `DogListRow.tsx` and the row half of the `dogActions` catalog.                                                                                                                                         |
| MYK9-594                     | Option 2: `DogStatusRow` renders read-only without a handler.                                                                                                                                                                       |
| MYK9-539                     | Folded into MYK9-538's PR (the issue itself says so). Closed when 538 merges.                                                                                                                                                       |
| MYK9-555                     | Covered by MYK9-560's PR via the `if: failure()` workflow step (560 item 3 says the two overlap). Closed when 560 merges.                                                                                                           |
| MYK9-596                     | Split: 596 keeps the SQL side (items 1, 2, 3, 8, 9); a new child issue takes the client side (items 4, 5, 6, 7, 10) because it shares `DogDialogs.tsx` with MYK9-595.                                                               |
| MYK9-563                     | Split: 563 keeps items 2, 3, 5, 6, 7 (all in `entries/search.ts`, the four hooks, two receipt components). Children: MYK9-601 (item 1, offline-durable `personId`, High) and MYK9-602 (item 4, `useShowEntriesForUser` divergence). |
| MYK9-565                     | Assumption stated on the issue: one header CTA plus a mobile-only bottom repeat, identical copy. Reversible; Richard can override.                                                                                                  |
| MYK9-561                     | Assumption stated: exhibitors may change jump height on their own entry before entry close; `requestPull` has no caller and is deleted.                                                                                             |
| MYK9-548                     | Parent; closed when 549, 550, 551 are Done.                                                                                                                                                                                         |
| MYK9-540                     | Last; one batch of the baseline only, rest re-justified on the issue.                                                                                                                                                               |

## Batches

Priority order: secretary/show-day reliability, scoring, offline/replication, class status, run order; then dependency order; then everything else. Migrations that register a behavioural SQL test (`scripts/qa/run-behavioral-sql-tests.{sh,test.ts}`) never share a batch, because they edit the same two files. `seed-demo.sql` PRs are serialized: 566, then 538, then 562.

| Batch | Issue                                          | Model  | File set (disjoint within the batch)                                                                                                     |
| ----- | ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | MYK9-547 AKC Detective → SWDC                  | opus   | `packages/secretary/src/results/formatters/AKCScentWorkFormatter*`, `useAKCSubmissionData.ts`                                            |
| 1     | MYK9-595 force-delete redirect                 | opus   | `DogDetailPage.tsx`, `useDogStoreCompat`, `DogDialogs.tsx`                                                                               |
| 1     | MYK9-567 handler name eats spaces              | opus   | `RegistrationWorkflow/HandlerSelectionDialog.tsx`, `InlineHandlerSection.tsx`, `HandlerAssignmentStep.tsx` (find the real control first) |
| 2     | MYK9-585 34 nullable-club RLS policies         | opus   | new migration, `supabase/tests/*`, `nullClubShowAuthorizationContract.test.ts`, SQL test registration                                    |
| 2     | MYK9-596 force_delete_dog SQL side             | opus   | new migration, `supabase/tests/force_delete_dog_test.sql` (extend, no new registration)                                                  |
| 2     | MYK9-566 load-fixture names                    | sonnet | `supabase/seed-demo.sql` § 17b, `src/test/load/loadFixture.ts`, e2e specs that read the names                                            |
| 3     | MYK9-561 exhibitor jump-height RPC             | opus   | new migration + test registration, `entries/writes.ts`, `entries/lifecycle.ts`, `EntryEditDialog.tsx`                                    |
| 3     | MYK9-549 subscribeToPush timeout               | sonnet | `packages/notifications/src/push.ts` + test                                                                                              |
| 3     | MYK9-564 trial day-of-week label               | opus   | `RegistrationWorkflow/ClassSelectionStep*`                                                                                               |
| 4     | MYK9-538 (+539) seed paid-stray guard function | opus   | new migration + test registration, `seed-demo.sql` § 0, seed contract test                                                               |
| 4     | MYK9-596-client (new child)                    | opus   | `DogDialogs.tsx`, `DeleteDogDialog*`, `blockedDogDelete.ts`, `dogs/reads.ts`, `ForceDeleteOverride.tsx`, `BlockedDogDeleteDialog*`       |
| 4     | MYK9-568 "opens" badge copy                    | sonnet | `utils/entryStatusUtils.ts`, `EntryStatusBadge*`                                                                                         |
| 5     | MYK9-583 withdraw RPC null type                | opus   | `ReplicatedEntriesTable.ts` (RPC seam only), types overlay                                                                               |
| 5     | MYK9-590 indeterminate checkbox                | sonnet | `components/ui/checkbox/checkbox.tsx` + test                                                                                             |
| 5     | MYK9-591 dead data-state selectors             | sonnet | `ThemeSelector.tsx`, `pipeline/components/ChecklistItem.tsx`                                                                             |
| 6     | MYK9-575 structural replica insert guard       | opus   | `packages/replication` / `ReplicatedEntriesTable.set`, `read-shape.ts`                                                                   |
| 6     | MYK9-592 dogs-table tap target                 | sonnet | `dogs/browse/DogsTableView.tsx` + test                                                                                                   |
| 6     | MYK9-588 (+587) DogListRow dead code           | sonnet | `dogs/common/DogListRow.tsx` (delete), `dogActions.tsx`                                                                                  |
| 7     | MYK9-563 account-entries follow-ups            | opus   | `entries/search.ts` → `userEntriesRead.ts`, four hooks, `OrdersReceiptsList.tsx`, `MyEntriesDialogs.tsx`                                 |
| 7     | MYK9-550 redaction order                       | sonnet | `packages/core/src/utils/redaction*`                                                                                                     |
| 7     | MYK9-551 packages dead code                    | sonnet | `packages/ringside`, `packages/scoring-ui`, `packages/replication` (listed symbols)                                                      |
| 8     | MYK9-537 filterAccessibleDogs                  | opus   | `DogSelectionStepEnhanced.helpers*`, `DogSelectionStepEnhanced.tsx`                                                                      |
| 8     | MYK9-594 read-only status row                  | sonnet | `DogStatusRow*`, `UserDetailsTabs.tsx`                                                                                                   |
| 8     | MYK9-589 dead phase2 spec                      | sonnet | `src/test/e2e/phase2-show-management-workflow.spec.ts`, helper                                                                           |
| 9     | MYK9-569 registry marker on dog card           | opus   | `DogSelectionStep.tsx` / dog card in the entry flow                                                                                      |
| 9     | MYK9-552 view comment vs body                  | opus   | new migration for `view_public_entry_results`                                                                                            |
| 9     | MYK9-562 seed comments/messages                | sonnet | `supabase/seed-demo.sql` § 0                                                                                                             |
| 10    | MYK9-582 withdrawn row marker                  | sonnet | `MyEntriesPage/modules/*`, `EntryStatusLine.tsx`                                                                                         |
| 10    | MYK9-560 (+555) review-gate follow-ups         | opus   | `scripts/qa/review-gate.ts`, `.test.ts`, `.github/workflows/review-gate.yml`                                                             |
| 10    | MYK9-554 db-push sweep pagination              | sonnet | `.claude/skills/db-push/SKILL.md`, `scripts/qa/inflight.ts` docstring                                                                    |
| 11    | MYK9-578 notifier SIGPIPE flake                | opus   | `scripts/qa/scheduled-failure-notifier*`, `src/test/ci/scheduledFailureNotifier.behaviour.test.ts`                                       |
| 11    | MYK9-565 three entry CTAs                      | sonnet | public show detail page components                                                                                                       |
| 11    | MYK9-543 phone-width wizard helper             | opus   | `src/test/e2e/registration/*` helper, two specs                                                                                          |
| 12    | MYK9-541 smoke auth flake                      | opus   | `.github/workflows/ci.yml` concurrency, `signInAsExhibitor`                                                                              |
| 12    | MYK9-545 staging e2e fixture drift             | opus   | `src/test/e2e/registration/*` (8 specs)                                                                                                  |
| 12    | MYK9-581 entry_carts 409                       | opus   | cart write path (find via staging capture)                                                                                               |
| 13    | MYK9-540 typecheck baseline batch              | sonnet | one file cluster under `scripts/qa/` + baseline                                                                                          |

## Testing phase

Per PR: assertion-first tests for value-sensitive fixes, colocated suite, `pnpm typecheck`, `pnpm qa:code-quality-ratchet` when lines are added to an existing file, shuffled app suite when tests change, output redirected to `.logs/` with the exit code echoed. Per batch: `bash scripts/qa/watch-pr-checks.sh <pr>` before any merge, full rollup read. Behavioural SQL tests only run in CI; a registered test has not run until its PASS notices appear in a CI log.

## Outcome ledger

Filled in as batches complete; the final report to Richard is generated from this table.

| Issue           | Batch | Outcome                                                                           | PR                | Owner action                                                              |
| --------------- | ----- | --------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| MYK9-595        | 1     | merged                                                                            | #2279 → af9a68f5e | none                                                                      |
| MYK9-547        | 1     | merged                                                                            | #2280 → 70c4977b4 | confirm `SWDC` against `electres.xsd` once                                |
| MYK9-567        | 1     | merged (owner override, ledgered on MYK9-544)                                     | #2281 → 880a20870 | none; MYK9-603 (print templates read the owner) filed from it             |
| MYK9-566        | 2     | merged; In Progress until reseed                                                  | #2282 → 0ff63ca10 | reseed staging (`seed-reset`), confirm guards; MYK9-606 filed             |
| MYK9-596        | 2     | merged; In Progress until db push                                                 | #2283 → 73231fac4 | `supabase db push` (20260916181700) + readbacks; MYK9-607, MYK9-608 filed |
| MYK9-585        | 2     | merged (owner override, ledgered on MYK9-544); In Progress until db push          | #2284 → 9f9d3ccca | `supabase db push` (20260916015300) + `pg_policies` readback              |
| MYK9-549        | 3     | merged                                                                            | #2285 → d379a1128 | none                                                                      |
| MYK9-561        | 3     | merged (owner override, ledgered on MYK9-544); In Progress until db push          | #2287 → b5675c7b3 | `supabase db push` (20260916194700) + staging replay as exhibitor         |
| MYK9-564        | 3     | merged                                                                            | #2286 → 2247db33f | none; MYK9-610 (seed trial names) filed                                   |
| MYK9-568        | 4     | merged                                                                            | #2288 → 687f4d100 | staging screenshot of the My Entries row, optional                        |
| MYK9-538 (+539) | 4     | merged (owner override, ledgered on MYK9-544); In Progress until db push + reseed | #2290 → 6511965c1 | `supabase db push` (20260916213500) BEFORE the next reseed, then reseed   |
| MYK9-600        | 4     | merged                                                                            | #2289 → 802a6d475 | none                                                                      |
| MYK9-610        | new   | filed (Backlog)                                                                   | —                 | seed § 3 trial names contradict their dates                               |
| MYK9-609        | new   | filed (Backlog)                                                                   | —                 | decide: pull-request queue has no producer                                |
| MYK9-608        | new   | filed (Backlog)                                                                   | —                 | triage: audit row and deleted_by invisible in Deleted Items               |
| MYK9-606        | new   | filed (Backlog)                                                                   | —                 | triage: load-secretary e2e users still named Load Secretary               |
| MYK9-607        | new   | filed (Backlog)                                                                   | —                 | triage: restore_dog snapshot edges                                        |
| MYK9-603        | new   | filed (Backlog)                                                                   | —                 | triage: print templates use the owner as handler                          |
| MYK9-604        | new   | filed (Backlog)                                                                   | —                 | triage: wizard writes `Unknown` class triples                             |
| MYK9-605        | new   | filed (Backlog)                                                                   | —                 | triage: MyEntriesPage focus flake                                         |
