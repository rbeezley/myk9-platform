# Phase 0 — PR F: Generic scoresheets → `@myk9/ringside`

**Status:** Discovery complete; awaiting direction decision before implementation.
**Author:** Claude (session lucid-dubinsky-ef01de, 2026-05-28)
**Predecessors:** PRs #416/#417/#418 (Phase 0 EntryList move + cleanup, all merged to `main`).
**Parent plan:** [`docs/plans/phase-0-ringside-package.md`](phase-0-ringside-package.md) line 161.

---

## TL;DR

PR F's original premise — "move the generic scoresheets into `@myk9/ringside`" — is **substantially outdated**. The discovery pass found that the entire **presentational scoresheet layer already lives in `@myk9/scoring-ui`** (extracted in "sprint-25", commit `4904d1ba`). What remains in `apps/myk9q/src/pages/scoresheets/` is **thin host glue** plus **dead code**.

Therefore the work that actually has value in Phase 0 is:

1. **Delete confirmed-dead generic components** (no importers anywhere).
2. **Record the decision** that scoresheet UI is already shared, so the page-level glue stays host-side (consistent with parent-plan §3, which designates the replication *orchestration* layer as host-app territory).

A literal "move the 6 page wrappers + router into ringside" is possible but is argued below to be premature and high-cost-for-low-value at this phase.

---

## Discovery findings

### Finding 1 — the presentational layer is already in `@myk9/scoring-ui`

`packages/scoring-ui/src/index.ts` already exports every live scoresheet UI:

| Org | Component (in `@myk9/scoring-ui`) |
|---|---|
| AKC | `AKCScentWorkLiveScoresheet`, `AKCFastCatLiveScoresheet`, `AKCNationalsLiveScoresheet` |
| UKC | `UKCNoseworkLiveScoresheet`, `UKCRallyLiveScoresheet`, `UKCObedienceLiveScoresheet` |
| ASCA | `ASCAScentDetectionLiveScoresheet` |

Plus `buildResolvedClassRules` and the `ScoresheetEntry` / `ScoresheetClassInfo` / `ScoreData` / `ResolvedClassRules` types.

### Finding 2 — the `apps/myk9q` scoresheet "pages" are host glue

All 6 live page wrappers (`AKCFastCatScoresheet`, `AKCScentWorkScoresheet`, `ASCAScentDetectionScoresheet`, `UKCNoseworkScoresheet`, `UKCRallyScoresheet`, `UKCObedienceScoresheet`) are ~115–122 LOC each and structurally identical:

```
parse route params (useParams)
  → useEntryNavigation()       // load entry/class/rules
  → useOptimisticScoring()     // submit score
  → useClassCompletion()       // celebration modal
  → assemble ScoresheetEntry / ScoresheetClassInfo
  → render <XxxLiveScoresheet ... onSubmit onBack />   // the shared UI
```

Their host dependencies: `useEntryNavigation`, `useOptimisticScoring`, `useClassCompletion`, `markInRing` (entryService), `ScoresheetLoader` (LoadingSpinner), `logger`, and (4 of 6) `useSettingsStore`.

### Finding 3 — `useEntryNavigation` is bound to host replication *orchestration*

`hooks/useEntryNavigation.ts` + `useEntryNavigationHelpers.ts` (335 + 498 LOC) import:

- `ensureReplicationManager` (`utils/replicationHelper`)
- `Replicated{Entries,Classes,Trials}Table` types (`services/replication/tables/`)
- `initializeAreas` (`services/scoresheets/areaInitialization`)
- `markInRing` (`services/entryService`), `useAuth`, `useScoringStore`/`useEntryStore`, `logger`

Parent-plan §3 is explicit: **"Treat `services/replication/` as host-app territory, do not move into ringside."** So `useEntryNavigation` **cannot** move to ringside as-is — it would have to be injected. myK9Show's future `/at-show` route will need its *own* orchestration layer (a Phase 1 question, per parent-plan §3 + §5).

### Finding 4 — dead code (zero importers; only their own tests/JSDoc reference them)

| File | Status |
|---|---|
| `components/AreaInputs.tsx` (+ `.test.tsx`) | **dead** |
| `components/TimerDisplay.tsx` (+ `.test.tsx`) | **dead** — the live `TimerDisplay` is `@myk9/ui`'s, a different component |
| `components/ScoreConfirmationDialog.tsx` | **dead** |
| `components/NationalsPointsDisplay.tsx` (+ `.test.tsx`) | **dead** |
| `AKC/components/NationalsConfirmationDialog.tsx` | **dead** |
| `AKC/components/NationalsTimerSection.tsx` | **dead** (imports `AKCNationalsScoresheetHelpers`, but nothing imports it) |

`AKCNationalsScoresheetHelpers.ts` is **live** (used by `AKCNationalsScoresheet.tsx`, the routed Nationals page) — keep.

### Finding 5 — the AKC ScentWork router references Nationals (skip per parent plan)

`AKCScentWorkScoresheetRouter.tsx` lazy-loads both `AKCScentWorkScoresheet` and `AKCNationalsScoresheet` and branches on `showContext.showType`. Since Nationals is out of scope (parent-plan Q4: stale partial port, fresh-port later), the router can't move to ringside cleanly without slot-injecting the Nationals branch.

---

## The decision

Given Findings 1–3, there are three coherent readings of PR F:

### Option A — Minimal / delete-only (recommended)

- **Delete** the 6 dead files in Finding 4 (+ their tests). Net ≈ −1,100 LOC.
- **Document** in the parent plan that the scoresheet *presentational* surface is already shared via `@myk9/scoring-ui`; the page-level glue stays host-side because it is bound to host replication orchestration (§3). Mark PR F's Phase-0 item effectively satisfied.
- **Testing phase:** confirm `pnpm --filter @myk9/myk9q typecheck`, `pnpm lint`, and the myK9Q test suite stay green after deletions (removing dead tests reduces, not adds, coverage of live code — verify no live import path breaks). Visual smoke: score one entry via `pnpm dev:q` to prove the routes still work.

**Why recommended:** consistent with the current "consolidate, don't duplicate / deletions are a feature" phase (root `CLAUDE.md`); avoids enshrining host-bound glue into the shared package before there's a second consumer; smallest, safest diff.

### Option B — Full DI move (literal original plan)

- Move all 6 page wrappers + router into `packages/ringside/src/pages/scoresheets/` behind a slot/DI contract injecting every host hook (`useEntryNavigation`, `useOptimisticScoring`, `useClassCompletion`, `markInRing`, `ScoresheetLoader`, `navigate`, settings).
- Host shims at the `apps/myk9q` route paths own the host hooks and assemble the slot bags (EntryList #416 precedent).

**Cost/risk:** the DI contract is larger than the ~120 LOC it wraps; myK9Show **cannot consume it** until Phase 1 builds its own orchestration, so the move delivers no near-term reuse. Higher review burden, more surface to keep green.

### Option C — Router/registry only

Middle ground: extract just a scoresheet-route registry/contract. Judged not worth a PR on its own.

---

## Recommendation

**Option A.** It closes the Phase-0 scoresheet item honestly (the UI is already shared), removes real dead weight, and defers the page-glue question to Phase 1 where it actually has a second consumer. Re-evaluate a DI move (Option B) when myK9Show's `/at-show` route is on the table.

## Open question for the owner

Should the **dead Nationals-adjacent files** (`NationalsConfirmationDialog`, `NationalsTimerSection`) be deleted now (they're dead and will be superseded by the fresh prod-repo port), or left untouched until the Nationals-active sprint? Parent plan says "do not *extract* the monorepo Nationals copy" — silent on deletion. Conservative reading: leave all Nationals files; aggressive reading: delete the dead ones too.
