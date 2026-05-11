# Show Structure Mind Map Plan

**Date:** 2026-05-11  
**Status:** Draft  
**Owner:** myK9Show  

## Goal

Add a collapsible **Show Map** view for the show hierarchy:

```text
Show -> Trials -> Classes -> Entries
```

The view should help secretaries, club admins, and site admins understand a show's structure at a glance without replacing the existing Trials, Classes, and Entries operational views.

The experience should support the Trial Secretary intent of **"That was easy"** and the Site Admin intent of **"The platform is healthy"** from `docs/INTENT.md`. It should feel calm, legible, and useful, not flashy.

## Current State

- Show management UI lives in `apps/myk9show/src/pages/ShowDetailsPage.tsx`.
- Show detail tabs currently include:
  - `Overview`
  - `Trials`
  - `Classes`
  - authenticated-only `Entries`
  - authenticated-only `My Stats`
  - `Results`
- Trial cards/table live in `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx`.
- Class cards/table live in `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`.
- `ShowDetailsPage.tsx` already derives:
  - `associatedTrials`
  - `showClasses`
  - `trialStats`
  - `showEntries` from `useEntriesByShowQuery`
- Entry data comes from `apps/myk9show/src/hooks/queries/useEntriesDatabase.ts`.
- Class data can be queried by trial through `apps/myk9show/src/hooks/queries/useClassesDatabase.ts`.
- `apps/myk9show/package.json` does not currently include React Flow or D3. It does include `mermaid`, but Mermaid is not a fit for an interactive collapsible runtime view.
- [ADDED] Verified local references before implementation planning:
  - `@myk9/core` is already used in myK9Show for class status and check-in helpers.
  - `SyncableTrialClass` is a local myK9Show store type from `apps/myk9show/src/store/trial-store-types.ts`.
  - `getEntriesByShow` is implemented in `apps/myk9show/src/services/database/entries/reads.ts` and maps replicated rows through `mapReplicatedEntryToDbRow`.
  - `apps/myk9show/src/config/features.ts` is the preferred first-pass home for the local feature flag.
  - logging patterns use `logger` from `apps/myk9show/src/services/LoggingService.ts` when logging is needed.

## Product Decision

Build this as a new optional tab on the show detail page:

```text
Overview | Trials | Classes | Entries | My Stats | Results | Map
```

Use the UI label **Map**, not "Mind Map." "Map" is shorter, calmer, and easier to scan in a tab bar.

[EXPANDED] Place `Map` as the rightmost staff-only tab so adding/removing the feature does not shift the existing Trials, Classes, Entries, My Stats, or Results positions for users who already rely on them.

Initial scope:

- show root node
- expandable trial nodes
- expandable class nodes
- optional entry preview nodes under a class
- count badges on collapsed nodes
- [ADDED] status and progress indicators for trials, classes, and entries
- click-through from nodes to existing detail pages
- pan and zoom controls
- accessible list fallback for users who prefer reduced motion or cannot use the graph comfortably
- [ADDED] staff/admin-only visibility for the first release, using the same authorization posture as the existing show management tabs

## [ADDED] Non-Goals For V1

- editing inside the map
- drag-to-reorganize
- dependency lines beyond parent-child hierarchy
- live collaboration cursors
- exporting the map as an image/PDF
- exhibitor-facing/public map
- Supabase realtime subscriptions or a new freshness model
- check-in filtering in the toolbar; V1 shows check-in badges, but filtering by check-in waits for feedback

[ADDED] Rollout posture:

- Ship behind a local feature flag, `features.showMap`, in `apps/myk9show/src/config/features.ts` until the dependency, rendering, and large-show behavior are verified.
- Keep the existing Trials, Classes, Entries, and Results tabs as the operational source of truth.
- Rollback should be possible by disabling the tab without changing data or removing any database fields, because the first version is read-only and adds no schema changes.

## [ADDED] Security And Permissions

- The first release should render the `Map` tab only for authenticated staff/admin users who already have show-management visibility.
- Do not expose the staff map on public Heritage or Headline landing pages.
- Do not add new direct Supabase calls inside graph components. Data should flow from existing typed hooks and derived show-page data.
- Do not expose extra exhibitor/person data in entry nodes. Entry labels should use operational labels only, such as armband and dog name, after verifying those fields are already appropriate in staff views.
- Treat unknown or missing hrefs as non-navigable nodes rather than guessing routes.
- [ADDED] The explicit tab guard should be `features.showMap && canManageShow`. The tab and tab content should both use the same guard so direct tab URLs cannot expose the staff map.

## Recommended Technical Approach

Use `@xyflow/react` (React Flow) for the interactive graph.

Reasons:

- it already provides pan, zoom, fit view, keyboard support, node selection, and custom nodes
- it fits React component composition better than hand-rolled SVG
- it lets us keep hierarchy transformation separate from rendering
- it avoids turning this into a custom graph engine project

Alternatives considered:

- **D3 tree layout:** good for pure hierarchy layout, but we would still need to build React interaction and accessibility wiring.
- **Mermaid:** already installed, but generated diagrams are not suitable for rich expand/collapse and click-through behavior.
- **Custom SVG/canvas:** too much surface area for a first production version.

## UX Behavior

### Default View

- Show the show node centered on load.
- Show trial nodes expanded by default.
- Keep class and entry levels collapsed by default.
- Display quiet counts on collapsed nodes:
  - `4 trials`
  - `18 classes`
  - `142 entries`
- Use existing show, trial, class, and entry terminology.

### [ADDED] Status And Progress

- Show status at every level where reliable data exists:
  - trial node: scheduled, in progress, completed
  - class node: not started, in progress, completed, finalized, or needs attention
  - entry node run/scoring status: pending, in ring, complete/scored, absent/scratch, or conflict
  - entry node check-in status: not checked in, checked in, called to gate, at gate, or no-show when those states exist in current data
- Treat entry run/scoring status and check-in status as separate lanes, because a dog can be checked in but still pending, or complete while retaining its check-in history.
- Entry nodes should show both labels when both are known, for example:
  - `Checked in · Pending`
  - `At gate · Complete`
  - `Not checked in · Pending`
- Add compact progress text to trial and class nodes:
  - `3/8 classes complete`
  - `12/18 entries complete`
- Add a thin progress bar to trial and class nodes when totals are known.
- Keep colors restrained:
  - neutral for scheduled/not started
  - blue or primary accent for in progress
  - green for complete
  - muted gray for absent/scratch
  - warning/destructive only for conflicts or attention-needed states
- Collapsed nodes should still summarize child status, for example:
  - `2 in progress`
  - `4 need attention`
  - `12/18 complete`
- Add an optional status filter once status rollups are stable:
  - `All`
  - `In progress`
  - `Needs attention`
  - `Complete`
- [ADDED] Treat unknown or unmapped status values conservatively:
  - hide the badge when a status is truly unavailable
  - show `Needs attention` only when existing data explicitly supports an issue/conflict state
  - do not infer completion from check-in status
- [ADDED] Apply a documented display precedence when multiple states appear to conflict:
  - attention/conflict first
  - scratch/absent/no-show before pending or complete
  - complete/scored before in-ring
  - in-ring before pending
  - check-in status remains independent and should not override run/scoring status

### Expanding

- Clicking a node's expand control toggles only that branch.
- Clicking the main body of a node opens the relevant detail route:
  - show: current show page
  - trial: `/shows/:showId/trials/:trialId`
  - class: `/shows/:showId/trials/:trialId/classes/:classId`
  - entry: entry detail or management route if one exists; otherwise no click-through until verified
- Expansion should animate only enough to show state change. No decorative motion.

### Large Shows

- Render entry nodes only for expanded classes.
- Cap initially visible entries per class, with a `View all entries` affordance if needed.
- Keep labels short:
  - class node: `Interior Novice A`
  - entry node: `#12 Bella`
- Avoid loading thousands of graph nodes at once.

### Controls

- Use icon buttons with tooltips:
  - fit view
  - zoom in
  - zoom out
  - collapse all
  - expand trials
- Keep touch targets at least 44px.
- Include a compact search field for node lookup after the first version is stable.

### Empty And Error States

- No trials: show a quiet empty state with the existing "New Trial" action for users who can manage the show.
- No classes under a trial: keep the trial node visible and show `0 classes`.
- No entries under a class: keep the class node visible and show `0 entries`.
- Data load failure: reuse the calm page error style, e.g. "We couldn't load this map. Try again."

## Data Model

Create a local view model that is independent of React Flow:

```typescript
type ShowMapNodeType = 'show' | 'trial' | 'class' | 'entry';

interface ShowMapNode {
  id: string;
  type: ShowMapNodeType;
  label: string;
  subtitle?: string;
  count?: number;
  status?: string;
  statusLabel?: string;
  checkInStatus?: string;
  checkInStatusLabel?: string;
  progress?: {
    completed: number;
    total: number;
    label: string;
  };
  attentionCount?: number;
  href?: string;
  parentId?: string;
  childrenCount: number;
}

interface ShowMapTree {
  root: ShowMapNode;
  nodesById: Record<string, ShowMapNode>;
  childIdsByParentId: Record<string, string[]>;
}
```

The React Flow adapter should consume `ShowMapTree` plus expanded node IDs and produce graph nodes/edges. Keep this adapter pure and unit-tested.

## File Plan

Prefer a focused feature folder:

```text
apps/myk9show/src/features/show-map/
  ShowMapTab.tsx
  ShowMapCanvas.tsx
  ShowMapNode.tsx
  ShowMapToolbar.tsx
  ShowMapListFallback.tsx
  showMapTypes.ts
  showMapTree.ts
  showMapLayout.ts
  showMapStatus.ts
  showMapRoutes.ts
  __tests__/
    showMapTree.test.ts
    showMapLayout.test.ts
    showMapStatus.test.ts
    ShowMapTab.test.tsx
```

Then wire `ShowMapTab` into `apps/myk9show/src/pages/ShowDetailsPage.tsx`.

Keep every file under 500 lines. Extract helpers before the canvas or tab component grows bulky.

## [ADDED] Known Fields

Phase 0 must complete this section before implementation. Current verified starting points:

- `ShowDetailsPage.tsx` currently passes `actualCurrentShow`, `associatedTrials`, `showClasses`, `showEntries`, and `canManageShow`.
- `showClasses` currently includes class `id`, `trialId`, `name`, `element`, `level`, `section`, `status`, `entryCount`, `scoredCount`, and trial display fields.
- The existing show entries table documents `getEntriesByShow` rows with `id`, `entry_status`, `handler`, `armband`, `payment_status`, `dog`, and `class`.
- Check-in/gate fields still need to be verified from the actual `getEntriesByShow` row shape or adjacent entry-management data before showing check-in badges.
- Entry click-through remains unresolved until Phase 0 confirms the canonical entry route.

## Implementation Phases

### [ADDED] Phase 0: Field And Dependency Discovery

1. Confirm the exact class, trial, and entry types used by `ShowDetailsPage.tsx` at implementation time.
2. Confirm the actual fields returned by `useEntriesByShowQuery` / `getEntriesByShow`, especially:
   - class id field used to attach entries to classes
   - dog display fields
   - armband/run-order fields
   - entry run/scoring status fields
   - check-in/gate status fields
   - absent/scratch/no-show fields
   - conflict/attention fields
3. Confirm existing helper imports before writing `showMapStatus.ts`:
   - class display/status helpers from `@myk9/core`
   - check-in status helpers from `@myk9/core`
   - any existing entry status helper from myK9Show utilities
4. Confirm the canonical route, if any, for entry detail/management click-through.
5. Add a short `Known Fields` subsection to this plan before Phase 2 implementation begins, listing the verified field names and helpers.

Acceptance criteria:

- no map transformer or status helper is written against guessed property names
- `Known Fields` lists the verified entry/class/trial fields used by the map
- unresolved fields are marked as unavailable and omitted from V1 display rather than inferred

### Phase 1: Design Spike And Dependency Decision

1. Confirm `@xyflow/react` bundle impact and React 19 compatibility.
2. Add `@xyflow/react` to `apps/myk9show/package.json` only after the spike confirms compatibility.
3. [EXPANDED] Lazy-load the map implementation with `React.lazy` or the existing route/component lazy-loading pattern so the graph dependency does not affect users who never open the tab.
4. Build a tiny local prototype with static nodes inside the app to validate:
   - pan and zoom
   - custom node rendering
   - expand/collapse state
   - responsive behavior on tablet width
5. Remove any spike-only code before moving to production implementation.

Acceptance criteria:

- dependency decision documented in this plan
- lazy-loading is implemented as a hard requirement before the tab is wired into `ShowDetailsPage.tsx`
- added map chunk is at or below the existing per-chunk gzip budget from `apps/myk9show/src/config/performanceBudget.ts`; if React Flow exceeds it, document the overage and keep the map chunk lazy-loaded before proceeding
- no permanent prototype route or placeholder UI remains
- TypeScript compiles after dependency install
- rollback path is documented before the dependency is used in production UI

### Phase 2: Tree View Model

1. Create `showMapTypes.ts`.
2. Create `showMapTree.ts` to transform existing `ShowDetailsPage` data into `ShowMapTree`.
3. Verify property names against actual interfaces and query results before mapping:
   - show fields from `Show`
   - trial fields from `Trial`
   - class fields from `SyncableTrialClass` / `showClasses`
   - entry fields returned by `getEntriesByShow`
4. Include count aggregation:
   - show node trial/class/entry totals
   - trial node class/entry totals
   - class node entry total
5. [ADDED] Include status/progress aggregation:
   - trial progress from child class statuses and entry completion where available
   - class progress from entry statuses/results where available
   - entry run/scoring status from verified entry/result fields
   - entry check-in status from verified check-in fields
   - attention counts for conflicts, missing required state, or other already-modeled issue states
6. [ADDED] Inherit existing `useEntriesByShowQuery` / show-page freshness behavior. Do not add Supabase realtime channels, polling, or a separate subscription model for V1.
7. Keep the transformation pure and independent of React.

Acceptance criteria:

- unit tests cover normal, empty, and partially missing data
- no guessed schema fields
- no direct Supabase calls in the map transformer
- status rollups remain stable when optional status fields are missing
- progress totals never divide by zero and hide progress bars when totals are unknown
- map status/progress refreshes only when the existing show entry/class data refreshes

### [ADDED] Phase 2.5: Status Classification Helpers

1. Create `showMapStatus.ts` for status classification and progress rollups.
2. Reuse existing status helpers where possible, such as class display/status utilities from `@myk9/core`.
3. Verify actual entry field names before classifying entry nodes.
4. [ADDED] Split entry classification into two outputs:
   - run/scoring status, such as pending, in ring, complete, absent, scratch, or needs attention
   - check-in status, such as not checked in, checked in, called to gate, at gate, or no-show when supported by current data
5. [ADDED] Define conflict/precedence rules in `showMapStatus.ts` instead of scattering them through UI components.
6. [ADDED] Return an explicit `unknown`/undefined display state for unmapped values instead of showing a misleading badge.
7. Keep status labels plain and operational:
   - `Not started`
   - `In progress`
   - `Complete`
   - `Checked in`
   - `Not checked in`
   - `Called to gate`
   - `At gate`
   - `Pending`
   - `Needs attention`
8. Avoid inventing new domain states unless they can be mapped cleanly from existing data.

Acceptance criteria:

- class status mapping matches existing class table/card behavior
- entry status mapping is backed by actual query fields or existing helpers
- entry check-in status mapping is backed by actual query fields or existing helpers
- run/scoring status and check-in status can be displayed together without overwriting each other
- precedence rules are unit-tested for conflicting or partially missing entry states
- unknown status values do not render misleading labels
- attention state is derived from existing issue/conflict/status data, not visual guesswork
- helper tests cover pending, in-progress, complete, absent/scratch, and conflict states
- helper tests cover checked in, not checked in, called to gate, at gate, and no-show when those states exist

### Phase 3: Layout Adapter

1. Create `showMapLayout.ts`.
2. Convert visible tree nodes into React Flow nodes and edges.
3. Keep layout deterministic:
   - show at root
   - trials ordered the same way as `associatedTrials`
   - classes ordered by trial, element, then level
   - entries ordered by armband/run order when available, otherwise stable label order
4. Support collapsed nodes by omitting descendants from visible graph output.
5. Add layout spacing constants so the graph can be tuned without changing logic.

Acceptance criteria:

- unit tests prove collapsed branches omit descendants
- ordering is stable
- layout output is deterministic for the same input

### Phase 4: Read-Only Map UI

1. Create `ShowMapNode.tsx` for custom node rendering.
2. Create `ShowMapCanvas.tsx` around React Flow.
3. Create `ShowMapToolbar.tsx`.
4. Add keyboard and pointer behavior:
   - expand/collapse via button
   - navigate via node body
   - fit view
   - zoom controls
   - collapse all
   - [ADDED] on touch viewports, preserve normal vertical page scroll; restrict canvas drag/pan behavior so one-finger scroll does not get trapped by the graph
   - [ADDED] keep pinch/zoom scoped to the canvas container and verify it does not block browser-level accessibility zoom
5. Use calm visual styling:
   - restrained colors
   - high contrast text
   - visible focus states
   - no hover-only controls
6. [ADDED] Wrap the graph canvas in a defensive error boundary or render guard so a graph rendering failure falls back to `ShowMapListFallback` instead of breaking the whole show page.
7. [ADDED] Render status/progress on nodes:
   - status badge
   - separate check-in badge on entry nodes when known
   - optional progress bar for trial/class nodes
   - complete/total text when totals are known
   - attention badge only when attention count is greater than zero

Acceptance criteria:

- map is usable with mouse, keyboard, and touch
- touch users can scroll the page without the graph capturing every one-finger gesture
- controls are 44px minimum
- node text does not overflow on mobile or desktop
- reduced-motion users do not get unnecessary animation
- graph render failure shows the fallback hierarchy and a calm retry/reload message
- status badges and progress text remain readable at mobile and tablet widths
- entry nodes can show two compact badges without wrapping awkwardly or hiding the label
- attention indicators do not obscure node labels or expand controls

### Phase 5: Show Details Integration

1. Add a `Map` tab definition in `ShowDetailsPage.tsx`.
2. Pass existing derived data into `ShowMapTab`:
   - `actualCurrentShow`
   - `associatedTrials`
   - `showClasses`
   - `showEntries`
   - `canManageShow`
3. Keep the existing Trials and Classes tabs unchanged.
4. Add a calm empty state when a show has no trials.
5. [EXPANDED] Gate tab visibility:
   - first pass requirement: show `Map` only to authenticated staff/admin users
   - later option: a simpler public schedule map if exhibitors find it useful
6. [ADDED] Gate the tab behind `features.showMap` from `apps/myk9show/src/config/features.ts` for easy rollback.

Acceptance criteria:

- existing tab URL behavior still works
- staff can open the map from the show page
- public landing pages are not affected
- no change to entry registration flows
- disabling the feature flag removes the tab without affecting other tabs
- tab and content guard use `features.showMap && canManageShow`
- non-staff users cannot access the staff map through direct tab URLs

### Phase 6: Entry-Level Detail

1. Inventory actual entry fields returned by `useEntriesByShowQuery`.
2. Decide safe entry label fields:
   - preferred: armband + dog call name
   - fallback: dog name
   - final fallback: entry number/id suffix
3. Add entry nodes only under expanded class nodes.
4. Add a visible cap for large classes, such as first 25 entries plus a count marker.
5. Add click-through only after verifying the canonical entry management/detail route.
6. [ADDED] Add a deterministic "more entries" marker when entries are capped so users understand the class has additional entries without rendering every node.
7. [ADDED] Avoid fetching per-class entry data from inside node renderers; use existing show-level entry data or a single typed query path to avoid N+1 behavior.
8. [ADDED] Show entry run/scoring status on each visible entry node when backed by verified fields:
   - `Pending`
   - `In ring`
   - `Complete`
   - `Absent`
   - `Scratch`
   - `Needs attention`
9. [ADDED] Show entry check-in status as a separate badge when backed by verified fields:
   - `Not checked in`
   - `Checked in`
   - `Called to gate`
   - `At gate`
   - `No-show`

Acceptance criteria:

- large classes do not freeze the browser
- entry labels are useful without exposing unnecessary personal data
- no guessed entry route
- expanding many classes does not trigger one network request per class
- entry run/scoring labels match existing entry/scoring terminology
- entry check-in labels match existing check-in/gate terminology
- check-in status does not overwrite or replace completion/scoring status
- capped entries still contribute to parent progress totals

### [ADDED] Phase 6.5: Status Filtering And Highlighting

1. Add a compact status filter to the map toolbar after status rollups are implemented.
2. Support:
   - `All`
   - `In progress`
   - `Needs attention`
   - `Complete`
3. [ADDED] Do not ship a check-in filter in V1. Revisit these future options only after the run/scoring status filter ships and users confirm that check-in filtering would help rather than cluttering the toolbar:
   - `All check-in`
   - `Not checked in`
   - `Checked in`
   - `Called to gate`
   - `At gate`
4. Filtering should preserve hierarchy context:
   - keep ancestors visible when a descendant matches
   - dim non-matching siblings rather than making the graph feel empty, unless a full hide behavior tests better
5. Provide a clear reset control.

Acceptance criteria:

- filtering to `Needs attention` keeps the show/trial/class path visible
- filtering to `In progress` shows in-progress classes and relevant parent trials
- V1 ships check-in badges without check-in filtering
- if check-in filtering is later enabled, it does not hide parent trial/class context
- reset returns to the previous expanded/collapsed state
- filter state does not change underlying data or existing tab filters

### Phase 7: Accessibility And Fallback

1. Create `ShowMapListFallback.tsx`.
2. Offer the fallback when:
   - reduced motion is enabled and graph interaction feels uncomfortable
   - graph dependency fails to render
   - screen-reader users need a linear hierarchy
3. Use native disclosure controls or existing collapsible UI.
4. Keep the fallback data source identical to the graph.
5. [ADDED] Include the same status labels, progress text, and attention counts in the list fallback.
6. [ADDED] Include both entry run/scoring status and check-in status in the list fallback when known.

Acceptance criteria:

- hierarchy can be navigated without canvas/SVG interaction
- expand/collapse state is understandable to assistive technology
- fallback links match graph node links
- fallback conveys status without relying on color alone

### Phase 8: Polish And Observability

1. Add loading skeletons consistent with existing show tabs.
2. [EXPANDED] Do not add product telemetry in V1. Use `logger` from `apps/myk9show/src/services/LoggingService.ts` only for recoverable map-render errors or dependency-load failures that are already being handled by fallback UI.
3. Tune node sizes and spacing from real show data.
4. Add visual QA across:
   - small mobile width
   - tablet landscape
   - desktop
   - large show with many trials/classes
5. Update relevant tracking docs after implementation.
6. [ADDED] Verify the feature flag/rollback path before release by disabling the flag and confirming the show page still renders normally.
7. [ADDED] Document any new dependency in the implementation notes or tracking doc, including why React Flow was selected.

Acceptance criteria:

- no overlapping node text
- no clipped toolbar controls
- large shows remain responsive
- implementation docs/tracking are up to date
- rollback path is verified without code deletion
- no new product analytics event is introduced for V1

## Testing Phase

Do not consider implementation complete until tests are written and passing.

Unit tests:

- `buildShowMapTree` creates the correct show -> trial -> class -> entry hierarchy
- empty show produces a root node and no child branches
- trial/class/entry counts aggregate correctly
- trial/class/entry status labels derive from verified fields
- entry check-in status labels derive from verified fields
- entry run/scoring status and check-in status are classified independently
- entry status combinations render correctly for checked-in plus pending, checked-in plus complete, not-checked-in plus pending, absent/scratch, and no-show when supported
- conflicting status precedence is deterministic and documented in `showMapStatus.ts`
- unknown entry/run/check-in status values hide or fall back safely instead of showing incorrect labels
- class progress rolls up completed vs pending entries correctly
- trial progress rolls up completed vs pending classes correctly
- attention counts aggregate from descendants correctly
- labels fall back safely when optional names are missing
- class ordering follows element + level ordering
- layout omits descendants of collapsed nodes
- layout output is stable across repeated calls
- status filters keep matching descendants and required ancestors visible

Component tests:

- `ShowMapTab` renders the show root and trial nodes
- expanding a trial reveals class nodes
- expanding a class reveals capped entry nodes
- class nodes show `in progress` and `complete/pending` progress text when supplied
- entry nodes show run/scoring status and check-in status as separate compact badges when supplied
- status filtering highlights or filters in-progress and needs-attention nodes
- check-in filtering is not present in V1
- collapse all hides class and entry descendants
- node click navigates to verified show/trial/class routes
- empty state appears for shows with no trials
- list fallback renders equivalent hierarchy links
- staff/admin users can see the `Map` tab
- non-staff users do not see the staff `Map` tab
- graph render failure falls back to the list hierarchy

[ADDED] Browser and visual verification:

- open a real or seeded show detail page with the `Map` tab enabled
- verify pan, zoom, fit view, expand, collapse, and node navigation
- capture desktop, tablet landscape, and mobile screenshots
- verify the graph is nonblank and labels/toolbar controls do not overlap
- verify status badges and progress bars remain legible at each viewport
- verify entry nodes with two badges remain readable on mobile and tablet widths
- verify unknown or missing status data does not create scary or misleading UI
- repeat with a large seeded show or fixture that has many trials/classes/entries

Use the custom render utilities from `apps/myk9show/src/test/utils/testUtils.tsx` instead of raw Testing Library `render`.

Verification commands:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapTree.test.ts src/features/show-map/__tests__/showMapLayout.test.ts src/features/show-map/__tests__/showMapStatus.test.ts src/features/show-map/__tests__/ShowMapTab.test.tsx
pnpm typecheck
pnpm lint
pnpm dev:show
```

If the test runner hangs for more than 60 seconds, stop and report the hang instead of retrying in a loop.

## Risks And Mitigations

- **Risk:** The graph becomes cute but not useful.  
  **Mitigation:** keep the first version read-only, count-driven, and tied to existing detail routes.

- **Risk:** Large shows create too many nodes.  
  **Mitigation:** render only expanded descendants and cap visible entries per class.

- **Risk:** Entry labels expose too much personal detail.  
  **Mitigation:** use operational labels only, such as armband and dog name, and verify existing privacy expectations.

- **Risk:** React Flow adds too much bundle weight.  
  **Mitigation:** run the dependency spike before committing to the dependency; consider lazy-loading the map tab.

- **Risk:** Graph interaction is hard for some users.  
  **Mitigation:** ship a linear collapsible fallback using the same data model.

- [ADDED] **Risk:** The new dependency or graph renderer breaks the show detail page.  
  **Mitigation:** lazy-load the map, wrap graph rendering with fallback behavior, and keep the tab behind a rollback flag.

- [ADDED] **Risk:** Staff-only operational structure becomes visible to public users.  
  **Mitigation:** gate the tab with existing authenticated staff/admin checks and add tests for direct tab URL access.

- [ADDED] **Risk:** Status rollups disagree with existing trial/class/entry screens.  
  **Mitigation:** reuse existing status helpers where available, verify actual fields before mapping, and add tests for every displayed status category.

- [ADDED] **Risk:** Check-in and scoring states conflict or become stale during show-day use.  
  **Mitigation:** keep check-in and run/scoring as separate display lanes, centralize precedence rules in `showMapStatus.ts`, and avoid claiming real-time certainty beyond the existing query data refresh behavior.

## Future Enhancements

- search within the map
- filter by date or "my entries"
- deeper badges for missing judges, unscored classes, payment issues, or other specific attention categories
- export image/PDF
- public exhibitor-friendly schedule map
- admin health map across multiple shows
