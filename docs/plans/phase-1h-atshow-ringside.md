# Phase 1h — At-Show ringside flow (myK9Q-faithful mobile ClassList + live scoresheet)

Status: **IN PROGRESS.**
Predecessor: Phase 1a (`/at-show/:showId/class/:classId` EntryList mount, merged PR #425).
Worktree: `worktree-phase-1h-atshow-ringside`.

### Progress log
- **1h-0 card tier — MERGED (PR #426, squash `5214e8b5`).** Ported myK9Q DogCard /
  armband / status-badge / section-badge / result-badge + tokens into
  `@myk9/ringside`, scoped under `.ringside-root`; myK9Show `/at-show` consumes
  the package `DogCard`. Browser-verified vs reference screens.
- **1h-0 chrome — IN PROGRESS (local commit on branch, becomes PR #2).** Header
  done: sticky bar + absolute-centered class title + trial meta ported (scoped);
  `HamburgerMenu` slot → compact ← icon; `FilterTriggerButton` slot → sliders
  ICON opening the Search & Sort slide-out (owner feedback). TabBar tabs already
  self-styled via `@myk9/ui`.
- **Combined Section A/B list — DONE (PR #427, w/ header chrome).** `AtShowCombinedEntryListPage`
  mounts `CombinedEntryListPage`; All/Section A/Section B tabs; 3 integration tests.
- **Live scoresheet — DONE (on the #427 branch; pushed in a follow-up commit).**
  `useAtShowScoresheet` (load + submit, mirrors ScoresheetPage; offline-safe —
  replication tables + `useOptimisticScoring`) + `AtShowScoresheetPage` (renders
  `@myk9/scoring-ui` `LiveScoresheet` via `getScoresheetComponent(key,'live')` —
  the myK9Q-style stopwatch; mobile chrome; back → at-show entry list). Route
  `/at-show/:showId/class/:classId/score/:entryId` (closes the 1a `buildScoreSheetRoute`
  404). 3 integration tests. Additive — does NOT refactor the secretary
  `ScoresheetPage` (D1 hook-sharing deferred to avoid touching a live surface).

### Popover data — BLOCKED on an offline-first decision (owner)
The ClassDetailsPopover's Results (`visibilityPreset`) + Check-in (`selfCheckin`)
real values come from `useSelfCheckinEnabled` / `useVisibleResultFields` /
`useVisibilitySettings`, which read via **direct Supabase, NOT the replication
layer** — so they don't work offline on the judge's phone. Wiring them into the
offline-first at-show surface conflicts with the offline-first principle. DECISION
NEEDED: (a) accept online-only popover values w/ graceful offline fallback, (b)
add `visibility_preset`/`self_checkin` to the replication layer (offline-safe,
larger), or (c) keep stubbed. Popover LOOK port is independent and can proceed.

### Chrome batch — remaining for PR #2 (owner: batch, don't drip element-by-element)
- **ClassDetailsPopover** (the header info-ⓘ hover dialog): port myK9Q's look —
  "Class Details" header + X, icon rows (Status / Entries / Judge / Max Time /
  Results / Check-in / Class ID) with teal value badges. Source:
  `apps/myk9q/.../dialogs/ClassDetailsPopover.tsx` (+ its `.popover-row` /
  `.popover-badge` CSS). Keep the positioning shell host-owned (Base UI), style
  the content to match. **+ WIRE REAL DATA (owner-approved):** the Results
  (`visibilityPreset`) + Check-in (`selfCheckin`) values are 1a spike-stubs;
  real values live in `class_visibility_overrides` + the `useSelfCheckinEnabled`
  query + `services/database/visibility`. The shim should enrich `classInfo`'s
  popover data via those existing hooks (not the replicated class row).
- **SyncIndicator / CompactOfflineIndicator** slots: style to match myK9Q.
- **Actions menu** (⋮ dropdown — Refresh / Check-In / Results / Scoresheets;
  Set Run Order hidden since run-order is out of scope at-show): style to match.

## Headline requirement (owner, 2026-05-28)

The at-show flow is the **judge's mobile timer**, and it must **look AND function like myK9Q**, which works well for judges today. That means:
- Simple tappable **class cards** → entry list → **live scoresheet with a built-in stopwatch** (start/stop, results, faults).
- **Pixel/feel parity with myK9Q**, achieved by porting myK9Q's ringside look into the shared `@myk9/ringside` package (owner-chosen path) — one source of visual truth for both apps and future hosts.

## What we learned (scope-shaping investigation, 2026-05-28)

1. **Function is already shared.** The at-show EntryList (1a) IS `@myk9/ringside`'s `EntryListPage`. myK9Show's `ScoresheetPage` already renders the same `@myk9/scoring-ui` **`LiveScoresheet`** (stopwatch) via `getScoresheetComponent(key,'live')`. So behavior parity is largely free.
2. **The LOOK is NOT shared.** myK9Q's ringside visual design lives in ~2,500 lines of **myK9Q app CSS** (`DogCard.css` 498L, `shared-components.css` 704L, `apple-design-system.css` 487L tokens, `micro-animations.css`, `touch-feedback.css`, `index.css`). The `@myk9/ringside` package ships an essentially **empty** stylesheet (Tailwind directives, preflight off). The ringside components emit myK9Q's semantic class names (`entry-list-container`, `grid-responsive`, `status-badge`, `dog-card`) but **nothing styles them in myK9Show**. The 1a slot shims render myK9Show shadcn/Tailwind — functional, but a different look.
3. **DogCard is a host slot, not a package component** — deliberately, from the 1a slot-injection design. Visual parity means the card look must move into the shared layer.
4. **Ringside `ClassList` is NOT an extracted page** (only helpers + 3 hooks + `ClassListData` types). We will NOT do the full extraction; we build a lean mobile card page reusing the types/helpers.
5. **myK9Q is sunsetting** (see `project_myk9q_sunset_coverage`), so re-homing its ringside look into the package is the forward-looking move; myK9Q keeps its own copy until sunset (no forced myK9Q refactor in this phase).

## Goal flow (all flag-gated + staff-guarded, reusing 1a)

```
/at-show/:showId                              AtShowClassListPage   ← mobile class cards (grouped by trial)
  → /at-show/:showId/class/:classId           AtShowEntryListPage   ← 1a (shipped); restyled by 1h-0
    → .../class/:classId/score/:entryId        AtShowScoresheetPage  ← live stopwatch (reused engine)
```
The scoresheet route already matches 1a's `buildScoreSheetRoute` — no re-point, just register.

## Architecture decisions (locked unless owner overrides)

- **D1 — Share the scoresheet engine.** Extract `ScoresheetPage`'s data-load + submit logic into `useAtShowScoresheet` returning `{ entry, classInfo, rules, sportType, trialDate, trialNumber, isLoading, error, submit, isSyncing, hasSyncError }`. Refactor the existing secretary `ScoresheetPage` to consume it (DRY). The at-show page consumes the same hook with mobile chrome + at-show nav.
- **D2 — Reuse the `LiveScoresheet` registry** (`getScoresheetComponent(key,'live')` + `buildResolvedClassRules` + `toScoresheet*` mappers + `useOptimisticScoring`). No new scoring logic.
- **D3 — Lean mobile ClassList, not full ringside extraction.** `AtShowClassListPage` + `atShowClassListAdapter` (`getTrialsByShow` → `getClassesByTrial` → ringside `ClassEntry`). Cards grouped by trial; tap → EntryList.
- **D4 — At-show owns its nav chain** (ClassList → EntryList → scoresheet → back), all under `/at-show/*`.
- **D5 — Flag + staff guard reuse** via `AtShowRoutes()`.
- **D6 — Mobile-first**, modeled on myK9Q ringside.
- **D7 — Visual parity by porting myK9Q's ringside look into `@myk9/ringside` (owner-chosen).**
  - Port the ringside-relevant **subset** of myK9Q CSS into the package's shipped stylesheet: `DogCard.css`, the EntryList/ClassList/status-badge rules from `shared-components.css`, `grid-responsive`, stagger from `micro-animations.css`, `touch-feedback.css`.
  - Port the **design tokens** those rules reference (from `apple-design-system.css` + `index.css` `:root`), **namespaced and scoped** under a ringside root wrapper so they cannot override myK9Show's theme/ThemeContext variables. Preflight is already off in the package config, so the global reset won't leak.
  - **Scope** all ported CSS under a single ancestor class (e.g. `.ringside-root`) that the at-show shells add, so package CSS applies ONLY inside the at-show surfaces in myK9Show (no bleed into the rest of the app).
  - **Promote the purely-visual primitives** (DogCard, status badge, result badges) into `@myk9/ringside` as styled components carrying these classes, so both apps render identical cards. Keep genuinely host-coupled primitives (HamburgerMenu/back-nav, offline/sync indicators tied to host network state) as slots, but style them to match.
  - Net effect: mounting the 1a EntryList + new ClassList/scoresheet inside `.ringside-root` yields a myK9Q-faithful look from shared code.

## Combined entry list — Novice Scent Work Section A/B (owner, 2026-05-28)

Required. AKC Scent Work Novice runs Section A and Section B together but places
them separately (A vs A, B vs B). The at-show flow must surface the **combined
entry list** with **All Sections / Section A / Section B** tabs (filter only —
placement separation is a scoring concern, not a UI one here).

The pieces already exist — this is wiring, not new logic:
- `CombinedEntryListPage` (exported from `@myk9/ringside`, distinct from the
  single-class page).
- `useEntryListFilters({ supportSectionFilter: true })` → `sectionFilter`
  (`'all' | 'A' | 'B'`) + `sectionCounts` (the tab badges).
- `createAtShowDataDependencies().fetchCombinedClasses(classIdA, classIdB)`.
- `noviceClassGrouping` helpers (detect the A&B pair; decide when to combine).

Work to do (lands with 1h-A/1h-B, after the 1h-0 visual layer):
- A combined host shim (`AtShowCombinedEntryListPage`) mirroring
  `AtShowEntryListPage` but using `CombinedEntryListPageProps` + section filter.
- A combined route, e.g. `/at-show/:showId/class/:classIdA/:classIdB` (mirrors
  myK9Q's `/class/:idA/:idB/entries/combined`).
- The ClassList (1h-B) detects novice A&B pairs (via `noviceClassGrouping`) and
  routes a paired class card to the combined route instead of the single one.
- Section-tab styling is part of the 1h-0 chrome port.

**Out of scope for at-show: run-order configuration.** The Trial Secretary sets
run order elsewhere in myK9Show; the at-show surface only *reads* order. The
ringside run-order dialog/preset handlers stay stubbed/omitted here.

## Phase breakdown (re-sequenced: visual layer first)

### 1h-0 — Ringside visual layer (FOUNDATIONAL; ship first)
*Why first: it restyles the already-mounted 1a EntryList, is independently verifiable, and 1h-A/1h-B inherit the look.*
1. Inventory the exact ringside-relevant CSS subset + the tokens it references (curated extraction, NOT a wholesale copy of all ~2,500 lines).
2. Add a scoped token block + component CSS to the `@myk9/ringside` shipped stylesheet, all under `.ringside-root`. Verify no token/name collision with myK9Show theme vars.
3. Promote DogCard + status/result badges into the package as styled components (replace the 1a myK9Show DogCard slot with the package component; keep host-network slots, restyled).
4. Add a `.ringside-root` wrapper to `AtShowEntryListPage` (and future at-show shells).
5. **Verify (real browser):** side-by-side screenshots of myK9Show `/at-show/...class` vs myK9Q EntryList; confirm card/list/header/badge parity and no style bleed elsewhere in myK9Show. Use playwright/preview against a seeded show with the flag on.
6. Tests: snapshot/structural tests where meaningful; the parity gate is the visual check.

### 1h-A — At-show live scoresheet (closes 1a's 404; inherits the look)
1. Extract `useAtShowScoresheet` from `ScoresheetPage` (D1); unit-test (load success/missing/error, submit payload, check-in transitions). Refactor `ScoresheetPage` onto it; keep its tests green (add characterization tests first if thin).
2. Build `AtShowScoresheetPage` (mobile chrome inside `.ringside-root`): params → hook → `getScoresheetComponent(key,'live')`; back/onSuccess → `/at-show/:showId/class/:classId`.
3. Register `/at-show/:showId/class/:classId/score/:entryId` (flag-gated).
4. Integration test: renders live scoresheet from mocked replication; submit → `submitScoreOptimistically` payload; back-nav → at-show EntryList. Visual check vs myK9Q scoresheet.

### 1h-B — At-show mobile ClassList (inherits the look)
1. `atShowClassListAdapter` + `useAtShowClassList({ showId })`; unit-test the mapping.
2. `AtShowClassListPage`: myK9Q-faithful tappable cards grouped by trial (ported card CSS), status badges via ringside helpers, empty/loading/error states; tap → EntryList.
3. Register `/at-show/:showId` (flag-gated, staff guard).
4. Integration test: renders cards; tap navigates to EntryList. Visual check vs myK9Q ClassList.

### 1h-C — Flow polish + entry point (smaller; partly owner-deferrable)
1. Confirm the back-chain end to end.
2. **Entry point (owner):** how a judge reaches `/at-show/:showId` on their phone (Show Map deep-link recommended; may pull in 1e/1f scope — deferrable).

## Testing / verification (required per CLAUDE.md)
- Unit: `useAtShowScoresheet`; `atShowClassListAdapter` mapping; pure helpers.
- Integration (vitest + testUtils, mocked `@/services/replication`): scoresheet submit + back-nav; ClassList render + tap; off-flag gates.
- **Visual parity (new):** real-browser screenshots of each at-show surface vs the myK9Q equivalent; confirm look match + no style bleed. This is the gate for 1h-0.
- Per-PR gate: `pnpm --filter @myk9/show typecheck` + eslint (0 errors) + `pnpm --filter @myk9/show test` green + Codex review.

## Open decisions for owner
1. **DogCard:** promote into `@myk9/ringside` as a styled component (recommended — true shared parity) vs keep as a myK9Show slot styled to match (more drift risk)?
2. **Scoresheet engine extraction (D1):** OK to refactor the live secretary `ScoresheetPage` to share the hook? (Recommended — DRY.)
3. **ClassList grouping:** by trial (recommended) vs flat?
4. **Entry point (1h-C):** Show Map deep-link now, or defer to 1e/1f?
5. **PR slicing:** 1h-0, 1h-A, 1h-B as three PRs (recommended — visual layer first, independently verifiable) vs combined?

## Risks / notes
- **Token collision / style bleed** is the top risk: myK9Show has its own theme vars + global styles. Mitigations: scope every ported rule under `.ringside-root`, namespace ported tokens, rely on the package's preflight-off config, and verify no bleed in the browser pass.
- **Curated extraction, not wholesale copy:** ~2,500 lines exist; only the ringside-surface subset moves. Over-porting risks dragging in myK9Q-global styling.
- **Promoting DogCard** reverses the 1a slot decision for that one primitive — justified by the owner's shared-visual-truth choice; keep host-network primitives as slots.
- **myK9Q keeps its own CSS copy** this phase (sunsetting; no forced refactor). Accept temporary duplication of the look across myK9Q-app-CSS and the package until myK9Q retires.
- Offline-first preserved: all reads/writes via replication tables + `useOptimisticScoring` (`feedback_offline_first`).
- Visual parity can't be unit-asserted — the browser verification pass is essential; budget for it.
