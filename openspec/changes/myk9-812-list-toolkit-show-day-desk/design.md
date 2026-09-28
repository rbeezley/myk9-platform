## Context

MYK9-810 built and proved the list toolkit (`apps/myk9show/src/components/list-toolkit/`: `ListViewTabs`, `ListFilterBar`, `ListResultLine`, `FloatingBulkBar`, plus the `useBulkSelection` hook and `ListFilterField`/`ListView` types) on `/admin/users`, then rolled it onto Entry Management in #2540 (MYK9-795, merged 2026-09-26 as `05e74fdb8`). MYK9-812 is the next batch: four show-day desk surfaces that each still run a bespoke version of the same three things the kit already solves — a filter-pill row, a search box, or a bulk-action bar. Per MYK9-810 rule 8 and this issue's own text, the views and bulk actions must be **drafted and approved by the owner before any surface is built**. This document is that draft. See proposal.md for why now.

Everything below was read from the four files on `origin/main` at `05e74fdb8` (the Entry Management merge commit — also the reference implementation for how the kit gets adopted):

- People roster: `apps/myk9show/src/features/show-desk-people-roster/ShowDeskPeopleRoster.tsx` (415 lines)
- Cockpit schedule: `apps/myk9show/src/features/show-map/cockpit/SecretaryCockpitSchedule.tsx` (276 lines) + `useSecretaryCockpitUrlState.ts` (31 lines)
- Self check-in tool: `apps/myk9show/src/features/show-workbench/SelfCheckinTool.tsx` (222 lines)
- Results Control: `apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx` (351 lines), `OverrideTree.tsx` (425 lines), `BulkOperationsBar.tsx` (275 lines)

## Goals / Non-Goals

**Goals:**

- Get every surface's view/filter/bulk mapping approved before the four build PRs start, per MYK9-810 rule 8.
- Reuse the kit's existing components and `useBulkSelection` hook exactly as built — no forks, no new kit components, unless a real gap turns up (none did; see Decisions).
- Preserve every existing scenario in `show-desk-people-roster`'s spec and the offline/replication behavior on all four surfaces (MYK9-812's "Must hold").
- Surface, rather than silently inherit, the two pre-existing online-only data paths this batch's surfaces touch (self check-in overrides, results visibility overrides) so the owner decides whether they need their own follow-up.

**Non-Goals:**

- No new kit component and no change to `apps/myk9show/src/components/list-toolkit/`.
- No cross-exhibitor bulk selection on the People roster (see the added `show-desk-people-roster` requirement in specs/).
- No new filter/search capability on the Cockpit schedule, Self check-in tool, or Results Control page beyond what already exists today (per CLAUDE.md "add nothing new unless it removes a duplicate").
- No fix to the self-check-in / results-visibility online-only override path in this batch — named as a gap, not closed here.
- No implementation. This change ships zero application code; the four follow-on PRs implement against this design once approved.

## Decisions

- **One PR per surface, not one PR for the batch** (MYK9-810 rule 2; `opsx-orchestrate` skill's "ship that batch before dispatching the next"). Each surface's blast radius and offline-test burden differ enough that a single combined PR would cost more review rounds than four small ones (per `docs/PLAYBOOK.md` #2210 precedent).
- **The People roster gets no `FloatingBulkBar`.** The issue's own surface list only asks for its search+3 pills to move onto the kit; its existing per-exhibitor `Check in all eligible` action is not a list-toolkit bulk action (it is not selection-driven, and it never spanned exhibitors). Adding selection here would be new surface area the issue didn't request — captured as its own `ADDED` spec requirement so a future change can't reintroduce it silently.
- **The Cockpit schedule gets no `ListFilterBar`/`ListResultLine`.** It has no search today and is a trial-grouped, collapsible schedule rather than a flat counted list; "N of M" reads oddly against grouped rows. Only its 4 filter pills become `ListViewTabs`.
- **Self check-in and Results Control get `FloatingBulkBar` only** (no view tabs) — neither has a filter/view concept today, only a class tree and a bulk bar. This is the cleanest 1:1 mapping: bespoke bottom bar → kit bottom bar, nothing else changes. This is narrower than the informal table in the owner's 2026-09-26 MYK9-812 comment, which listed "Enabled, Disabled" and "By trial" under Self check-in's and Results Control's "Views and filters" column — read literally, that would mean `ListViewTabs` on both. The narrower reading is a scope choice, not a data-availability one: an "Enabled/Disabled" filter on Self check-in would in fact be cheap to add — `SelfCheckinTool.tsx` already loads `settings`/`trialOverrides`/`classOverrides` and `OverrideTree.tsx` already calls `resolveClassCheckin(...)` (`overrideTreeUtils.ts`) to compute each class's effective enabled/disabled state, so a view tab could re-filter that already-loaded result the same way the People roster's view-tab counts do (§1, "pure client-side re-filters"). This design leaves it out because MYK9-812's own issue text never asks for it for this surface (only "search+3 pills → kit" for the People roster and Cockpit schedule) and CLAUDE.md's "add nothing new unless it removes a duplicate" rule — not because the data isn't there. "By trial" for Results Control is different: `OverrideTree` already groups by trial today, so that word in the table describes existing structure, not a new filter to build. The owner's later, explicit 2026-09-27 sign-off approved this narrower, scope-driven reading with no request to add either view — but the two documents were never reconciled in writing before that approval, so this line records the reconciliation, and its real reason, for anyone reading the earlier comment later.
- **`OverrideTree`'s per-trial "select all" checkbox is not replaced by a single global header checkbox.** Both Self check-in and Results Control already select through the shared `useBulkSelection` hook (confirmed by reading the code — `SelfCheckinTool.tsx:118-123`, `ResultsControlPage/index.tsx:60`), so the underlying selection contract is already uniform with the rest of `bulk-selection-actions`; only the trigger shape (per-trial vs. one global header checkbox) differs because the data is inherently trial-grouped, exactly like the Cockpit schedule. The `bulk-selection-actions` spec delta documents this as an already-satisfied variant of the requirement rather than inventing a new global control.

## Risks / Trade-offs

- [Self check-in / Results-visibility overrides are online-only today, and this batch reskins their bulk bar without changing that] → Each surface section below states the fact plainly; the owner decided (2026-09-27) to file one follow-up, MYK9-849, covering both surfaces rather than filing twice. Not fixing it silently is the important part — the risk is someone reading a future PR's green "offline" test for the _schedule_ half of the page and assuming the _settings_ half is covered too.
- [Four sequential PRs against a kit that Entry Management is the only other adopter of] → If Entry Management's own kit adoption needs a follow-up fix mid-batch, re-check each surface's mapping against the fixed kit before starting that surface's PR.
- [MYK9-842 lands in the same file the People roster PR touches] → Sequencing below; re-read `ShowDeskPeopleRoster.tsx`/`peopleRoster.ts` off `main` right before starting that PR, not off this document's snapshot.

## Migration Plan

1. Owner reviewed this change (proposal.md, design.md, the three spec deltas) and resolved every decision below (owner, 2026-09-27 — recorded in each surface's `DECIDED` block and on the MYK9-812 Linear issue).
2. **MYK9-842 merged 2026-09-27** (confirmed on `main`), which was a precondition for starting the People roster PR. It added `apps/myk9show/src/features/show-desk-people-roster/trialRingLabel.ts` (`buildTrialRingResolver`, now imported by `ShowDeskPeopleRoster.tsx` in place of a direct call) wrapping `formatTrialIdentity` (still defined in `peopleRoster.ts`) to disambiguate same-day, same-name trials, and changed `showDeskPendingSignals.ts`'s check-in-eligibility signal — the same trial-identity formatting and eligibility semantics the People roster's view-tab counts must reflect. Re-read all three files off the merged `main` (not off this document's §1 snapshot, taken before MYK9-842 landed) before starting that PR — task 0.3 in `tasks.md` covers this.
3. Build order for the remaining three surfaces (Cockpit schedule, Self check-in, Results Control) has no cross-dependency on MYK9-842 or on each other; they may proceed in any order once this proposal is approved, each as its own PR per `tasks.md`.
4. Each PR: `opsx:apply` against this change's tasks for that surface, focused + shuffled tests, `pnpm qa:review-tier`, merge, then the next surface starts from the merged `main`.

## Per-Surface Drafts

### 1. People roster — `features/show-desk-people-roster/ShowDeskPeopleRoster.tsx`

**1. Today's controls (read from `main` @ `05e74fdb8`):**

- Search: a bare `<Input>` + `<Search>` icon (lines 212-227), local `search` state, placeholder "Search name, dog, armband", feeding `filterPeopleRoster(roster, search, filter)`.
- Filters: `FILTERS` = `All exhibitors` / `Needs check-in` / `Online` (lines 34-38), rendered as three `variant={filter === option.id ? 'default' : 'outline'}` rounded `Button`s (lines 228-244). No counts shown. `filter` state is seeded once from `?rosterFilter=` on mount (line 68-71) but never written back to the URL.
- No result-count line.
- No selection/bulk bar. Each exhibitor row is an accordion; expanding it shows `Message` / `Check in all eligible` / `Manage entries` buttons and per-class-row `Check in` buttons, all scoped to that one exhibitor.

**2. Proposed kit views, filters, search, bulk actions (1:1 mapping):**

- `ListFilterBar` (fields=`[]`) supplies `searchValue`/`onSearchChange`/`searchPlaceholder="Search name, dog, armband"` in place of the bare `Input`. No filter chips — the three named states are views, not independent chips.
- `ListViewTabs` replaces the 3 pills 1:1: `views = [{id:'all', label:'All exhibitors', count}, {id:'needs-check-in', label:'Needs check-in', count}, {id:'online', label:'Online', count}]`, `activeId={filter}`, `onSelect={setFilter}`. Counts come from running `filterPeopleRoster(roster, search, viewId)` for each view over the already-loaded `roster` — no new fetch (see §4).
- Filter state moves to a small `usePeopleRosterUrlState` hook mirroring `useSecretaryCockpitUrlState`'s shape (read/write a normalized `?view=` param), so the existing one-way `rosterFilter` deep link becomes a real two-way URL contract (operational-views spec delta).
- No `FloatingBulkBar` (see Decisions — explicit non-goal, pinned by the added spec requirement).
- Existing per-exhibitor actions and per-row `Check in` are unchanged.

**3. What gets deleted:**

- The bespoke search `<Input>`/`<Search>` block (lines 212-227).
- The bespoke `FILTERS` pill row and its rendering block (lines 34-38, 228-244).
- The local `search`/`filter` `useState`s (lines 60, 68-71), replaced by the kit-backed hook.

**4. Offline and replication contract that must hold:**

- `entries` prop ← `useSecretaryShowEntriesQuery` (`hooks/queries/useEntriesDatabase.ts:72-85`), which wraps `getEntriesForShow` — its own comment states the service "normalizes both replication and PostgREST rows," i.e. replication-backed with an online-read fallback, not raw always-online. Unchanged.
- `classes` prop ← `useShowDeskScheduleRead()` → `useTrialStore` (`trials`/`trialClasses`, gated on `trialsHasConfirmedSnapshot`/`trialClassesHasConfirmedSnapshot`) via `ShowWorkbenchShowDeskPage.tsx`. Unchanged — the same replicated store the Cockpit schedule reads.
- `present` (the `Online` view) ← `useShowPresenceRoster()`, explicitly advisory today (existing spec scenario: "does not imply presence is authoritative"). The kit's `ListViewTabs` count must not be worded or styled to imply otherwise.
- Check-in mutation ← `updateReplicatedCheckInStatus` (replicated path), dispatched through the existing bounded `dispatchBulk` pool. Untouched by this change.
- View-tab counts must be pure client-side re-filters of the already-loaded `roster` array (per the added "count derivation remains covered" spec scenario) — no new query, no new loading state.

**5. DECIDED (owner, 2026-09-27):**

- Add a `ListResultLine` ("N of M exhibitors") below the tabs, for consistency with the rest of the kit.
- Make the `view` URL param two-way, matching the `operational-views` extension in this proposal.
- Leave free-text `search` local-only — not moved into the URL.

### 2. Cockpit schedule — `features/show-map/cockpit/SecretaryCockpitSchedule.tsx` + `useSecretaryCockpitUrlState.ts`

**1. Today's controls:**

- `FILTERS` = `All` / `In progress` / `Needs attention` / `Needs closeout` (lines 18-23), rendered as 4 `rounded-full` `Button`s (lines 88-102), driven by the `filter: CockpitFilter` prop / `onFilterChange` callback.
- Filter state is **already** two-way URL state via `useSecretaryCockpitUrlState` → `normalizeCockpitUrlState`/`writeCockpitUrlState` (`cockpitRoutes.ts`) — this surface is already ahead of the other three on URL-addressability.
- No search box.
- "Jump to now" ghost button (conditional on a now-marker existing) — unrelated to filtering, unaffected.
- No selection, no bulk bar. Per-row `ClassStatusControl`/`ExpectedStartControl` are direct single-row actions, not bulk.

**2. Proposed kit views, filters, search, bulk actions:**

- `ListViewTabs` replaces the 4 `Button` pills 1:1: `views = [{id:'all', label:'All', count}, {id:'in-progress', label:'In progress', count}, {id:'needs-attention', label:'Needs attention', count}, {id:'needs-closeout', label:'Needs closeout', count}]`, `activeId={filter}`, `onSelect={onFilterChange}` — the callback contract to the parent (`useSecretaryCockpitUrlState`'s `updateState`) is unchanged, only the pill markup swaps for `ListViewTabs`.
- No `ListFilterBar` (no search today; not requested).
- No `ListResultLine` (grouped/collapsible schedule, not a flat list; "N of M" would read against trial groups, not rows — see Decisions).
- No `FloatingBulkBar` (no bulk actions on this surface today; not requested).

**3. What gets deleted:**

- The bespoke `FILTERS` array and its `Button`-pill rendering block (lines 18-23, 88-102).
- Nothing else changes — "Jump to now", the trial-group `Collapsible`s, `CockpitActionLink`, and `inlineFocusedContent` all stay exactly as they are.

**4. Offline and replication contract that must hold:**

- `sourceClasses`/`sourceTrials` trace to `SecretaryCockpit.tsx`'s `snapshot` prop → `buildSecretaryCockpitSnapshot({ trials, classes, ... })` → `ShowDeskPanel.tsx`'s `trials`/`classes` props → `ShowWorkbenchShowDeskPage.tsx`'s `showTrials`/`showClasses`, which are themselves built from `useShowDeskScheduleRead()`'s replicated `useTrialStore` read — the **same replicated schedule the People roster reads**. Unchanged.
- Per-row mutations (`ClassStatusControl`, `ExpectedStartControl`) already flow through the canonical replicated class-status-override mutation (`bulk-selection-actions` spec, "Class status changes use one canonical manual-override mutation") — untouched by this change; `ListViewTabs` only changes which rows are visible, never their data.
- View-tab counts must be derived from the same in-memory `model.trialGroups`/`sourceClasses` this component already receives — no new fetch.

**5. DECIDED (owner, 2026-09-27):**

- No `ListResultLine` on this surface, per the recommended omission in Decisions.

### 3. Self check-in tool — `features/show-workbench/SelfCheckinTool.tsx`

**1. Today's controls:**

- No search, no filter pills. A single trial→class tree (`OverrideTree`, `facet="checkin"`) with per-trial "select all" checkboxes and per-class checkboxes, driven by `useBulkSelection({ items: classes, getItemId, pruneToItems: true, resetKey: showId })` (lines 118-123).
- `CheckinBulkActions` (lines 41-112): an **inline** bar in normal document flow (`rounded-md border bg-muted/30`), rendered only while `selectedClasses.size > 0`. Shows "N classes selected", a "Select all (M)" ghost button, a "Clear" ghost button, then "Enable self check-in" / "Disable self check-in" outline buttons, calling `useBulkUpdateClassOverrides().mutate({ classIds, showId, selfCheckinEnabled })`.
- A separate show-wide `ShowCheckinToggle` sits above the tree — unrelated to selection, unaffected.

**2. Proposed kit views, filters, search, bulk actions:**

- No `ListViewTabs`/`ListFilterBar` (no filter/search concept exists today; not requested — same reasoning as the Cockpit schedule).
- `FloatingBulkBar` replaces `CheckinBulkActions`'s inline bar 1:1: `count={selection.selectedIds.size}`, `noun={['class', 'classes']}`, `onClear={selection.clearSelection}`, children = the same "Enable self check-in" / "Disable self check-in" buttons wired to the same `updateClasses.mutate` call. The "Select all (M)" button becomes the bar's first child (kept — see DECIDED below).
- `OverrideTree`'s per-trial "select all" checkbox and per-class checkboxes are unchanged (Decisions: already on the shared `useBulkSelection` contract; not replaced by a single global header checkbox).

**3. What gets deleted:**

- The `CheckinBulkActions` function and its inline-bar JSX (lines 41-112) — its two mutation-calling handlers move to the `FloatingBulkBar` usage in `SelfCheckinTool`.

**4. Offline and replication contract that must hold:**

- `classes`/`trials` props trace to the same `ShowWorkbenchShowDeskPage.tsx` → `useShowDeskScheduleRead()` replicated schedule as the People roster and Cockpit schedule. Unchanged.
- `settingsQuery`/`trialOverridesQuery`/`classOverridesQuery` (`useShowSettings`/`useTrialOverrides`/`useClassOverrides`) and the bulk mutation `useBulkUpdateClassOverrides` read/write `show_visibility_settings` / `trial_visibility_overrides` / `class_visibility_overrides` **directly via `untypedSupabase`** (`hooks/queries/useShowSettingsDatabase.ts`, `hooks/mutations/useShowSettingsMutations.ts`) — **online-only today, not replication-backed.** This predates this change and this batch does not fix it; the kit adoption only changes the bar's presentation (inline → floating), never this data path. **Do not let a reviewer read "offline and replication unchanged" as "this action works offline" — it doesn't, today, either.**

**5. DECIDED (owner, 2026-09-27):**

- The self-check-in-override online-only gap is filed as MYK9-849, shared with Results Control (surface 4) rather than filed twice.
- Keep the "Select all (M)" button inside the new `FloatingBulkBar`.

### 4. Results Control — `pages/secretary/ResultsControlPage/{index.tsx,OverrideTree.tsx,BulkOperationsBar.tsx}`

**1. Today's controls:**

- No search, no filter pills. A "Results readiness" summary card, `PresetSelector` (show-wide defaults), then `OverrideTree` (`facet="visibility"`) — the same tree component and the same `useBulkSelection` pattern as Self check-in (`bulkOps = useBulkSelection({ items: showClasses, getItemId })`, cleared via `useEffect` on `showId` change).
- `BulkOperationsBar` (275 lines): a **fixed, full-width** bottom bar (`fixed bottom-0 left-0 right-0 ... shadow-lg`), visible only while `selectedClasses.size > 0`. Shows "N classes selected", "Select All (M)" / "Clear" ghost buttons, an "Apply Preset" `Select` dropdown, a `Release Results` primary button behind an `AlertDialog` confirmation, and — conditionally, when `hasReleasedClasses` — a `Hide Results` outline button behind its own `AlertDialog`. The page adds `pb-44 sm:pb-28` bottom padding so content clears the fixed bar.

**2. Proposed kit views, filters, search, bulk actions:**

- No `ListViewTabs`/`ListFilterBar` (same reasoning as Self check-in — no filter/view concept today, not requested).
- `FloatingBulkBar` replaces `BulkOperationsBar`'s fixed full-width footer 1:1: same `count`/`noun`/`onClear`, same "Select All (M)" button (kept — matching surface 3's DECIDED block, for consistency across the two bars), same "Apply Preset" `Select`, and the same two `AlertDialog`-wrapped `Release Results` / `Hide Results` buttons with unchanged eligibility gating (`hasManualReleaseClasses`, `hasReleasedClasses`) and unchanged toast/partial-failure wording.
- The page's `pb-44 sm:pb-28` spacer needs re-checking against whatever spacing convention Entry Management's `FloatingBulkBar` adoption already settled (its bar floats bottom-_centre_, not full-width, so the clearance a page needs is different) — a layout detail for the build PR, not a behavior change here.

**3. What gets deleted:**

- `BulkOperationsBar.tsx` in its entirety (275 lines) — its JSX moves inline (or into a small results-control-owned "bar contents" component) as the `FloatingBulkBar`'s children, per how Users' bulk bar keeps its own "More menu" contents page-owned today.
- The page's bespoke `pb-44 sm:pb-28` bottom-padding hack, replaced by whatever the kit's own spacing convention turns out to need.

**4. Offline and replication contract that must hold:**

- `classes`/`entries` ← `useClassStore`/`useTrialStore` directly (Zustand) — the same replicated schedule family as the other three surfaces. Unchanged.
- `settings`/`trialOverrides`/`classOverrides` (the visibility cascade) and their bulk mutation (`useBulkUpdateClassOverrides`, used by "Apply Preset") are the **same online-only `show_visibility_settings`/`*_visibility_overrides` path** as Self check-in — pre-existing, unchanged by this batch.
- `Release Results` / `Hide Results` (`useReleaseResults`/`useUnreleaseResults`) are, by contrast, **already replicated** (`replicatedClassesTable.updateClass`, per each hook's own header comment) — these two actions genuinely work offline today and must keep doing so; only "Apply Preset" carries the online-only caveat above. Get this distinction right in the build PR — the three actions in one floating bar do not share one offline story.

**5. DECIDED (owner, 2026-09-27):**

- References MYK9-849 — the same shared online-only override-path follow-up as Self check-in, filed once rather than twice.
- Keep the "Select All (M)" button, matching Self check-in, so the two adopting PRs read the same way.
