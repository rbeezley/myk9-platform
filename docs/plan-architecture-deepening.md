# Architecture Deepening Plan

Status: proposed (2026-05-30). Output of the `improve-codebase-architecture` skill.

## Framing

The myK9 codebase has already built its deep seams — `entries/lifecycle.ts`, the
`health-records/umbrella.ts`, the edge-function HTTP envelope, and the
`syncReplicatedTable()` workflow. The friction now is **adoption lag and a few
remaining depth gaps**, not missing abstractions. Every phase below either routes
callers through a seam that already exists, closes one genuine depth gap, or
deletes zero-leverage surface.

Vocabulary follows two sources deliberately:
- **Domain** terms (Entry, Class, Show, the entity data-access modules, the
  Replicated Table Sync workflow) from [`CONTEXT.md`](../CONTEXT.md).
- **Architecture** terms (module, interface, seam, adapter, depth, leverage,
  locality, deletion test) from the skill's `LANGUAGE.md`.

Phases are ordered by leverage-per-risk. They are independent enough to ship in
any order, but the listed order front-loads the highest payback. Each phase is a
separate worktree + PR (see [`CLAUDE.md`](../CLAUDE.md) worktree workflow). **No
phase is complete until its tests are written and passing and
`pnpm typecheck` is green.**

---

## Phase 1 — Collapse hand-rolled Replicated Table Sync adapters onto `syncReplicatedTable()`

### Goal
Route every replicated table's `sync()` through the existing
[`syncReplicatedTable()`](../packages/replication/src/syncReplicatedTable.ts) seam,
so each adapter declares only its remote query + field mapping and the package
owns the choreography (last-sync metadata, empty-cache detection, dirty-row
preservation, conflict timing, metadata write-back).

### Friction (deletion test)
~23 adapters each inline the same ~110-line loop. Delete one adapter's inlined
loop today and the same bug reappears in 22 siblings — the signal that the loop
belongs behind one seam. `ReplicatedEntriesTable` (both apps) already proves the
migration; this phase finishes it. Continues the in-flight
[`plan-replication-sync-workflow.md`](plan-replication-sync-workflow.md).

### Files
**myK9Show adapters to migrate (8):**
`ReplicatedArmbandsTable`, `ReplicatedClassesTable`, `ReplicatedClubsTable`,
`ReplicatedDogsTable`, `ReplicatedJudgeAssignmentsTable`, `ReplicatedShowsTable`,
`ReplicatedTrialsTable`, `ReplicatedWaitlistEntriesTable`
(under `apps/myk9show/src/services/replication/`).

**myK9Q adapters to migrate (15):**
`ReplicatedAnnouncementReadsTable`, `ReplicatedAnnouncementsTable`,
`ReplicatedAuditLogViewTable`, `ReplicatedClassRequirementsTable`,
`ReplicatedClassVisibilityOverridesTable`, `ReplicatedClassesTable`,
`ReplicatedEventStatisticsTable`, `ReplicatedNationalsRankingsTable`,
`ReplicatedPushNotificationConfigTable`, `ReplicatedPushSubscriptionsTable`,
`ReplicatedShowVisibilityDefaultsTable`, `ReplicatedShowsTable`,
`ReplicatedStatsViewTable`, `ReplicatedTrialVisibilityOverridesTable`,
`ReplicatedTrialsTable`
(under `apps/myk9q/src/services/replication/tables/`).

Seam: `packages/replication/src/syncReplicatedTable.ts` (+ the
`SyncReplicatedTableAdapter` interface). Reference precedent:
`ReplicatedEntriesTable.ts` in both apps.

### Steps
1. Read `ReplicatedEntriesTable` in both apps as the canonical adapter shape.
2. Classify each adapter:
   - **Read-only view tables** (`ReplicatedAuditLogViewTable`,
     `ReplicatedStatsViewTable`, `ReplicatedEventStatisticsTable`,
     `ReplicatedNationalsRankingsTable`) — no client writes, so they need no
     `resolveConflict`/`mergeDirtyRow`; migrate first, lowest risk.
   - **Mutable tables** (Shows, Trials, Classes, Armbands, Waitlist, etc.) —
     preserve each adapter's current `resolveConflict` policy verbatim when
     passing it to `syncReplicatedTable()`. Do **not** "improve" conflict policy
     in this phase; behavior-preserving only.
3. Migrate one adapter per commit. For each: replace the inlined `sync()` loop
   with a `syncReplicatedTable(this, adapter, scope, options)` call, moving the
   remote query + field mapping behind the adapter interface.
4. Watch the string|number id boundary noted in memory
   `project_ringside_id_string_migration` — myK9Q's deep DB-write layer stays
   numeric; do not "re-fix" those coercions.

### Tests
- Reuse/extend `ReplicatedEntriesTable.test.ts` as the template per migrated
  adapter: assert dirty-row preservation (a pending local mutation survives a
  server snapshot), empty-cache full-sync path, and incremental-sync path.
- Field-mapping unit test per adapter: given a remote row, the adapter maps it to
  the expected local shape (snake_case ↔ camelCase divergence between apps is
  expected and must be asserted, not "fixed").
- Run `cd apps/myk9q && pnpm test` and `cd apps/myk9show && pnpm test` for the
  replication suites after each adapter.
- **[ADDED] Offline-path check.** Unit tests mock IndexedDB; the workflow exists
  to protect the *real* offline path. Before merging the mutable-table batch, run
  a manual offline smoke (DevTools offline → mutate a row → reload → confirm the
  local mutation survives a subsequent sync) or extend the existing Playwright
  E2E (`pnpm test:e2e`) for one representative mutable table. Read-only view
  tables can skip this.

### Acceptance
- All 23 adapters delegate to `syncReplicatedTable()`; no inlined sync loop
  remains except the package workflow itself.
- `grep -rL syncReplicatedTable` over the adapter files returns only genuinely
  non-syncing helpers.
- Replication suites + `pnpm typecheck` green in both apps.
- **[ADDED]** After each adapter PR merges to `main`, verify the corresponding
  staging app (myK9Q and/or myK9Show — both auto-deploy from `main`) loads and
  syncs without console/replication errors. A migrated adapter that typechecks
  can still mis-map a field at runtime.

### Risk / notes
Medium. Conflict-resolution regressions are the real hazard — mitigate by
behavior-preserving migration (pass existing policy, change nothing) and the
dirty-row assertion in every adapter test. Ship per-adapter PRs, not one
mega-PR, so a regression bisects to one table.

---

## Phase 2 — Give each entity data-access module ownership of its cache-invalidation contract

### Goal
Make "what becomes stale when I write entity X" part of the entity module's
**interface**, instead of knowledge re-derived in callers. Today `queryKeys`
appears in 65 files and `invalidateQueries` in 83.

### Friction (deletion test)
The canonical entity modules own reads/writes but the invalidation ripple lives
in 83 caller files. Change a write's downstream effects and you must re-audit all
83 — complexity spread horizontally, the opposite of the locality the entity
modules exist to provide. Deleting any one caller's invalidation list does not
concentrate the logic; it just silently drops invalidations.

### Files
- [`apps/myk9show/src/services/database/queryClient.ts`](../apps/myk9show/src/services/database/queryClient.ts)
  (80+ `queryKeys` definitions) — the key factory.
- The 83 `invalidateQueries` call sites (hooks under `hooks/`, `hooks/queries/`).
- Entity write modules: `entries/writes.ts` + `entries/lifecycle.ts`,
  `shows/writes.ts`, `classes/`, etc.

### Steps
1. Inventory: for each entity, list which query keys its writes currently force
   callers to invalidate (grep `invalidateQueries` grouped by entity). Produce a
   table: write op → canonical key-set it should invalidate.
2. Decide the interface shape in the **grilling conversation** before coding.
   Two candidate shapes to weigh (do not pre-commit here):
   - a per-entity `entryInvalidationKeys(change)` helper co-located with writes
     that returns the canonical key-set, callers pass it to their own
     `queryClient.invalidateQueries`; or
   - a thin `invalidateAfter<EntityChange>` helper the module owns end-to-end.
3. Migrate one entity at a time (start with `entries/`, the highest-traffic and
   the one with the lifecycle seam already in place). Re-point its callers.
4. Leave admin/online-only entities (per
   [`plan-data-access-module-drift.md`](plan-data-access-module-drift.md)
   dispositions) untouched if they are flagged as intentional exceptions.

### Tests
- **Assertion-first** (per `CLAUDE.md`): for each migrated write, write
  `expect(invalidateQueries).toHaveBeenCalledWith(<canonical key-set>)` red
  first, then route through the module to make it green. This is the
  value-sensitive-bug discipline — a specific key set going to a specific place.
- Unit-test the key-set helper purely (given a change descriptor → expected
  keys).
- Regression: a caller that previously hand-assembled keys produces the same set
  through the module.

### Acceptance
- `entries/` (minimum) and ideally `shows/` + `classes/` route invalidation
  through the module; their callers no longer assemble `queryKeys.*` lists by
  hand.
- Net reduction in distinct `invalidateQueries` call sites for migrated entities.
- `pnpm typecheck` + affected hook/module tests green.

### Risk / notes
Medium. Over-invalidation (correct but slow) is acceptable interim; missed
invalidation (stale UI) is the real risk — the assertion-first tests are the
guard. Consider recording the final shape as an ADR if it sets a convention
future reviews should not re-litigate.
**[ADDED]** If the contract introduces a named concept (e.g. an
`<entity>InvalidationKeys` seam), register it in [`CONTEXT.md`](../CONTEXT.md)
under "Data Access Modules" so it has a canonical name. **[ADDED] Pre-launch
context:** both apps are pre-launch with no real users (memory
`project_prelaunch_no_users`) — do **not** keep the old hand-assembled
invalidation paths alive as a compatibility shim; migrate callers outright.

---

## Phase 3 — Lift entry-management orchestration behind a testable seam

### Goal
Move the optimistic-update → lifecycle-transition → invalidation → **rollback**
orchestration out of the React hook into a plain module whose **interface is the
workflow**, so the ordering and rollback logic become unit-testable.

### Friction
[`useEntryManagementActions.ts`](../apps/myk9show/src/hooks/useEntryManagementActions.ts)
is 722 lines orchestrating ~12 data-access calls + 6 mutation flows with
optimistic rollback; its test asserts only 2 leaf calls.
[`useEntryManagementData.ts`](../apps/myk9show/src/hooks/useEntryManagementData.ts)
(350 lines) has no test at all. The interface is the test surface — and you can't
test *past* a hook — so the real bugs (rollback ordering, conditional refetch,
which queries invalidate) sit in untestable wiring. Classic "extracted leaves are
tested, bugs hide in the orchestration" shape.

### Files
- `apps/myk9show/src/hooks/useEntryManagementActions.ts`
- `apps/myk9show/src/hooks/useEntryManagementData.ts`
- `apps/myk9show/src/hooks/__tests__/useEntryManagementActions.test.ts` (currently
  2 cases)
- Composes (does not replace): `entries/lifecycle.ts`, `entries/writes.ts`,
  `entries/secretary.ts`, and the Phase 2 invalidation contract.

### Steps
1. Identify the orchestration units inside the hook: status change + rollback,
   armband assign/auto-assign + reload, bulk status/check-in, comp/uncomp,
   delete, CSV export. Each is a candidate workflow function.
2. Extract orchestration into a framework-free module (e.g.
   `entries/management-actions.ts` or similar — name decided in grilling) that
   accepts the lifecycle/write functions + an invalidator as **injected
   adapters**. The hook becomes a thin binding that supplies React Query's real
   adapters.
   - **[ADDED]** The extracted module names a concept not yet in the glossary.
     Per the architecture-skill discipline, register it in
     [`CONTEXT.md`](../CONTEXT.md) (the **Entry** section or a new
     "Entry management orchestration" note) once its name is settled in grilling,
     so future reviews don't treat it as drift.
3. Keep optimistic UI state in the hook; move the *decision logic* (when to
   roll back, what to invalidate, ordering) into the module.
4. Coordinate with Phase 2: the module should consume the entity invalidation
   contract, not re-derive keys.

### Tests
- Drive the extracted module directly with fake adapters:
  - mutation fails → prior state restored → **no** invalidation fired;
  - status change succeeds → reload fires only on the conditional status (the
    untested `ACCEPTED`-only reload);
  - bulk op partial failure → correct rollback set.
- Backfill `useEntryManagementData` ordering test: shows load → initial showId
  applied → entries load; deep-link works against stale cache; cancellation
  token cleanup on unmount.
- `cd apps/myk9show && pnpm test` for the entry-management suites.

### Acceptance
- Rollback/ordering/invalidation logic lives in a module tested without React.
- The hook shrinks to binding + local UI state.
- Orchestration test coverage exists where there were only leaf assertions.

### Risk / notes
Medium-high (touches a hot secretary surface). Behavior-preserving extraction;
verify in the browser preview (secretary entries management) before merge. Honor
any `// INTENT:` comments per `docs/INTENT.md`.

---

## Phase 4 — Consolidate duplicated state directories and the twin `entryStore`

### Goal
One predictable home per state concern; remove the `entryStore` name collision.

### Friction
`apps/myk9show/src/store/` (52 stores) **and** `stores/` (5) both exist; `context/`
**and** `contexts/` both exist. No rule says which a new module belongs in — the
seam's *location* is ambiguous, which hurts AI-navigability. Two modules named
`entryStore.ts` export different `Entry` types (`store/entryStore.ts` →
`SyncableShowEntry`, the show-entry domain store with 55 call sites;
`stores/entryStore.ts` → a checkout `Entry`, reachable only via `stores/index.ts`).
Autocomplete offers two incompatible `entryStore`s — an active import footgun.

### Files
- `apps/myk9show/src/store/` ↔ `apps/myk9show/src/stores/`
- `apps/myk9show/src/context/` ↔ `apps/myk9show/src/contexts/`
- Collision: `store/entryStore.ts` vs `stores/entryStore.ts`
  (+ `stores/index.ts` re-export).

### Steps
1. Pick the surviving directory per concern (recommend the higher-population
   `store/` and `context/` as canonical; confirm in grilling). Document the rule
   so future stores have one home.
2. Rename the checkout store to its actual concern — it neighbors `cartStore`, so
   `cart`/`submission`-flavored naming removes the `Entry` collision.
3. Move files, update import paths (mechanical), delete emptied directories.
4. Re-point `stores/index.ts` consumers.

### Tests
- This is a move/rename refactor: `pnpm typecheck` is the primary gate (no
  dangling imports).
- Run existing store tests; add none unless a rename changes a public type.
- Smoke-verify the scoring/checkout surface that consumed `stores/*` in preview.

### Acceptance
- One `store/` and one `context/` directory; the duplicates are gone.
- Exactly one module named `entryStore`; `grep entryStore` returns one answer.
- `pnpm typecheck` green in myK9Show.

### Risk / notes
Low (near-zero behavior change; the `/stores/entryStore` twin has effectively no
direct callers). Pure locality/navigability win.

---

## Phase 5 — Delete zero-leverage data-access modules

### Goal
Shrink the true surface a codebase-walking agent must read and rule out.

### Friction (deletion test, literally)
Deleting these concentrates no complexity anywhere because nothing calls them —
~1,900 lines of dead surface.

### Files (verified zero live importers, 2026-05-30)
- [`batchOperations.ts`](../apps/myk9show/src/services/database/batchOperations.ts)
  (413L, 0 importers)
- [`connection-pool.ts`](../apps/myk9show/src/services/database/connection-pool.ts)
  (431L, 0 importers)
- `apps/myk9show/src/services/database/queries/search-*-queries.ts` cluster
  (~1,050L; reachable only through an unused barrel — confirm the
  `searchQueries.ts` barrel and `useSearchDatabase` consumer first).

**Explicitly excluded** (verified live, do NOT delete): `show-incidents.ts`
(4 importers in `features/show-workbench/`), `shows/reads.postgrest.ts`
(delegated to from `shows/reads.ts`).

### Steps
1. Re-run the liveness grep immediately before deletion (call sites rot in both
   directions).
2. For the `queries/` search cluster: confirm whether `useSearchDatabase` uses
   the barrel at all; if the barrel is dead too, remove it; if live, delete only
   the orphaned members and keep the barrel honest.
3. Delete with `git rm` (per memory `feedback_git_rm_vs_rm`).
4. `grep -rn <symbol> --include="*.md"` before pushing (per
   `feedback_grep_docs_before_deletion`) — remove stale doc references.

### Tests
- `pnpm typecheck` + `pnpm build` must stay green (proves nothing imported them).
- Full test suite run; no test should reference the deleted modules.

### Acceptance
- Files removed; typecheck/build/tests green; no doc references dangling.

### Risk / notes
Low, contingent on the re-verified grep. If any importer appears, drop that file
from the phase rather than forcing the delete.

---

## Phase 6 — Normalize `judges/reads.ts` to flat named functions (ADR-008)

### Goal
Bring the largest remaining Shape-Y holdout into line with
[ADR-008](adr/008-entity-module-export-shape.md).

### Friction
[`judges/reads.ts`](../apps/myk9show/src/services/database/judges/reads.ts) (728L)
exposes 5 nested query objects (`judgeQualificationQueries.create()`, …). ADR-008
mandates flat named functions and lists `judges/` as pending. This is recorded
convention, not a new proposal — included for completeness and sequencing.

### Files
- `apps/myk9show/src/services/database/judges/reads.ts` + `judges/index.ts`
- Call sites using `judge*Queries.*` (grep to enumerate).

### Steps
1. Convert each nested-object method to a flat, entity-prefixed named export per
   ADR-008's naming rules (`getJudgeQualifications`, `createJudgeAvailability`,
   …), honoring the domain-clear bare-verb exception only where ADR-008 allows.
2. Update `index.ts` to the flat re-export shape.
3. Re-point call sites.
4. Append a line to ADR-008's migration record.

### Tests
- Per ADR-008's reasoning: test assertions read as domain ops
  (`expect(getJudgeQualifications).toHaveBeenCalledWith(...)`).
- Existing judges tests must pass against the new surface.
- `pnpm typecheck` green.

### Acceptance
- No `judge*Queries` object exports remain; `index.ts` is flat Shape-X.
- ADR-008 migration record updated.

### Risk / notes
Low-medium (mechanical but wide call-site fan-out). Lowest novelty; schedule when
`judges/` is touched for another reason, per ADR-008's incremental-migration
guidance.

---

## Cross-phase testing & verification

- Each phase ends with `pnpm typecheck` (never raw `tsc` — see memory
  `feedback_use_pnpm_typecheck`) and the affected app's `pnpm test`.
- UX-touching phases (3) get a browser-preview smoke check before merge.
- Each phase = its own worktree + PR; merge from the main repo dir (memory
  `feedback_merge_from_main_worktree`).
- Phases 1, 5, 6 are independent. Phase 3 should land **after** Phase 2 so it can
  consume the invalidation contract rather than re-deriving keys. Phase 4 is
  independent but pairs naturally with Phase 3 (both touch entry state).

## [ADDED] Operational concerns

- **Auto-deploy.** Merging to `main` auto-deploys both apps to Vercel staging
  (`myk9-platform-myk9show.vercel.app`, `myk9-platform-myk9q.vercel.app`). There
  is no separate deploy step, but it means every merged phase is live on staging
  immediately — verify there, not just locally.
- **No migrations, no env vars, no secrets.** Every phase is app/package code
  only. None of these phases touch `supabase/migrations/`, edge functions, RLS,
  or environment configuration. If a phase ever appears to need one, stop — it
  has drifted out of scope.
- **Dual-app blast radius.** Phase 1 touches replication in **both** apps and
  Phase 4 touches myK9Show state only. Phase 1's per-adapter PRs should be
  verified against whichever app(s) own that adapter.

## [ADDED] Rollback & recovery

- **Per-phase revert.** Each phase is its own PR (Phase 1: one PR per adapter).
  Revert = `git revert` the squash-merge commit; no data migration to unwind
  because no phase writes schema or data.
- **Replication regressions (Phase 1) are the one stateful risk.** A bad
  conflict-policy migration can corrupt the *local* IndexedDB cache on a user's
  device, not the server. Recovery is a client cache reset (the replication layer
  rehydrates from Supabase), but the guard is the dirty-row assertion test plus
  the staging offline smoke before merge — catch it before it ships.
- **Phase 4/5 (rename/delete)** revert cleanly via `git revert`; the
  pre-deletion liveness grep is what prevents needing one.

## [ADDED] Definition of done (whole plan)

The plan is complete when: all 23 adapters route through `syncReplicatedTable()`
(P1); the chosen entity modules own their invalidation contract with
assertion-first tests (P2); entry-management rollback/ordering is tested without
React (P3); one `store/`, one `context/`, one `entryStore` remain (P4); the
verified-dead modules are gone with green build (P5); `judges/` is flat Shape-X
with ADR-008's record updated (P6). Each phase's own Acceptance section is the
gate; this is the roll-up.

## Suggested sequencing

1. **Phase 5** (delete dead code) — clears noise, lowest risk, makes later greps
   cleaner.
2. **Phase 4** (state directory consolidation) — low risk, improves navigability
   for everything after.
3. **Phase 1** (replication sync adapters) — highest leverage; independent.
4. **Phase 2** (invalidation contract) — new depth gap; prerequisite for 3.
5. **Phase 3** (entry-management orchestration) — consumes Phase 2.
6. **Phase 6** (judges ADR-008) — opportunistic.
