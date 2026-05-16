# Plan — Show-Map Node Attributes + Unified Attention

**Date:** 2026-05-16
**Status:** Awaiting product decision on attention semantics (see Phase 2 §1)
**Scope:** First concrete PR(s) coming out of the 2026-05-16 show-day workflow brainstorm.

**[ADDED] Cross-reference to OPEN-TODOS:** This plan executes the following items from the 2026-05-16 brainstorm section in `OPEN-TODOS.md`:
- "PREREQ: Add `data-node-id` + `data-node-type` attributes to show-map rows" (Phase 1)
- "Unify attention computation across dashboard + show-map" (Phase 2)
- Partially advances "Show-map tree extensions" by establishing the shared priority-function pattern referenced by the smart Recommended menu and the Next Best Action card.

**[ADDED] Sequencing note vs. earlier commitment:** In conversation I initially proposed shipping both phases in a single PR. After the code survey revealed Phase 2 needs a product decision on attention semantics (Phase 2 §1), I'm recommending Option A (two PRs) below so Phase 1 can ship while §1 is debated. This is a deliberate change from the earlier framing.

## Why this work, why first

Two findings from the 2026-05-16 live walk and code survey:

1. **`ShowMapStructureTable` rows have no semantic node attributes.** Rows render as plain `<li>` + grid `<div>` with no `data-node-id`, `data-node-type`, or `role="treeitem"`. This blocks all of the planned show-map extensions (inline row actions, smart Recommended menu, scriptable Playwright selectors, accessibility on the tree).
2. **Two independent attention-computation sites already disagree on the same data.** The dashboard's "Needs Attention" strip lists "81 entries pending review" for the Heritage show, while the show-map tree's "Need Attention" tile shows `0` for the same show. Neither implementation is buggy in isolation; they measure *different things*. Shipping the smart Recommended menu and the Next Best Action card on top of this without first unifying the function would produce surfaces #4 and #5 of divergent attention.

Both must land before any further show-map extension work begins. Splitting into two phases below; either can ship as a separate PR or both can ship together.

---

## Phase 1 — `data-node-id` + `data-node-type` attributes

### Scope

`apps/myk9show/src/features/show-map/ShowMapStructureTable.tsx` — add `data-node-id` and `data-node-type` to the outer row `<div>` of every rendered node type.

### Node types currently rendered

From `ShowMapStructureTable.tsx` and `showMapTree.ts`:

| Type | Current outer element | Notes |
|---|---|---|
| `show` | not rendered as a row (root only; surfaces in summary tiles + tree root metadata) | No-op for this phase |
| `trial` | `<li class="overflow-hidden rounded-md border bg-card">` containing `<div class="grid ...">` | Tag the inner grid `<div>` |
| `class` | `<li>` containing `<div class="grid ...">` | Tag the inner grid `<div>` |
| `entry` | `<li>` containing `<div class="grid ...">` | Tag the inner grid `<div>` |
| `more` | rendered through the generic `<li>` path | Tag the inner grid `<div>` |

### Implementation

Add two attributes to each `<div class="grid ...">` row element:

```tsx
<div
  data-node-id={node.id}
  data-node-type={node.type}
  className="grid ..."
>
```

Three rendering branches in `ShowMapStructureTable.tsx` need the attributes:

- The `entry` branch at line 138 (`<div class="grid min-h-[72px] ... pl-16 ...">`)
- The `trial` branch at line 216 (`<div class="grid min-h-16 ...">`)
- The generic branch at line 229 (`<div class="grid min-h-14 ...">`) — covers `class` and `more` types

**[EXPANDED] ARIA roles on the same edit.** While we're modifying these row elements, add proper ARIA semantics:
- The outermost `<ul>` (line 242) gets `role="tree"`.
- Trial/class/entry/more outer `<li>` elements get `role="treeitem"` and `aria-level={depth + 1}` (depth is already a parameter to `renderNode`).
- Rows with children get `aria-expanded={isExpanded}`.
- The inner child `<ul>` (lines 221, 234) gets `role="group"`.

This is the same set of files and lines the data attrs touch; doing it together is one extra line per row at no additional review cost. Earlier brainstorm specifically called out accessibility as a benefit of semantic node attributes — this delivers it.

**[ADDED] Show-root tile data attributes.** For scriptability symmetry, the summary tile container in `ShowMapTab.tsx` (around lines 105-110, the `<div className="flex flex-wrap gap-3">` holding the four `<SummaryItem>` tiles) gets `data-node-id={\`show:${show.id}\`}` and `data-node-type="show"` on the outermost tile-row `<div>`. This lets show-scope tests query the show row consistently with how they'd query trial/class/entry rows.

### Test plan (Phase 1)

Add a new test file `apps/myk9show/src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx`:

1. **Renders `data-node-id` on every rendered row.** Build a small tree (1 show, 1 trial, 1 class, 1 entry). Assert `screen.getByText('Trial Name').closest('[data-node-id]')` resolves, similarly for class and entry. Match on the exact node id values returned by `buildShowMapTree`.
2. **Renders `data-node-type` matching the node's type.** Assert `data-node-type="trial"` on the trial row, `data-node-type="class"` on the class row, `data-node-type="entry"` on the entry row.
3. **The `more` synthetic node also gets the attributes.** Build a class with `entryPreviewLimit=1` and 3 entries so the "X more entries" node renders. Assert `data-node-type="more"`.
4. **[ADDED] ARIA roles render correctly.** Assert `role="tree"` on the outer list, `role="treeitem"` on trial/class/entry/more rows, `role="group"` on the nested child `<ul>`, and `aria-expanded` reflects expansion state.
5. **[ADDED] Show-root tile container exposes show-scope data attrs.** Assert the summary tile container has `data-node-id="show:<id>"` and `data-node-type="show"`.

These tests are pure DOM assertions — no Playwright, no app state.

**[ADDED] Manual verification after Phase 1 lands:** Re-run the 2026-05-16 live-walk script (`apps/myk9show/secretary-walk.mjs`) — its tree-structure probe step (line 79-92) previously found zero matching selectors; after this PR it should find non-zero counts for `[data-node-id]` and `[data-node-type]`. This is a cheap regression check.

### Why this can ship alone

No semantic decisions. No data migration. No call-site changes. Purely additive — every existing test still passes; no consumer relies on the attributes being absent. Could merge same-day.

---

## Phase 2 — Unified attention function

### 1. Required product decision — what counts as "needs attention"?

**The blocker before code.** Today's two surfaces measure different things:

| Surface | Counts as attention | Source |
|---|---|---|
| Dashboard `NEEDS ATTENTION` strip | Entries with `status = 'pending_review'` (or similar pending-approval state) | `usePendingEntries()` hook |
| Show-map tree `attentionCount` | Entries where `classifyEntryRunStatus().kind === 'attention'` OR `classifyEntryCheckInStatus().kind === 'attention'` — i.e., `entry_status ∈ {conflict, failed, rejected}` or `check_in_status === 'conflict'` | `hasEntryAttention()` in `showMapStatus.ts:138` |

These two definitions are non-overlapping in normal data. Pending-review entries are in `pending` status which `classifyEntryRunStatus` explicitly buckets as `kind: 'neutral'` (line 92). Conflict/failed/rejected entries presumably don't go through `usePendingEntries`'s filter.

**Recommended definition** (subject to user confirmation):

> An entity *needs attention* if **any** of the following are true:
> 1. The entity (or any descendant) has `entry_status ∈ {pending_review, pending, submitted}` *and* the secretary owns the approval step.
> 2. The entity (or any descendant) has `entry_status ∈ {conflict, failed, rejected}`.
> 3. The entity (or any descendant) has `check_in_status === 'conflict'`.
> 4. *(Future, parked for now)* The entity has a scoring discrepancy, an unsigned judge's catalog, or an AKC submission failure.

Rationale: pending-review is the single highest-frequency secretary task. Treating it as attention is what makes the Show List "Need Attention" tile useful day-to-day. Conflict/failed/rejected are rarer but more urgent — they should not be dropped.

**Open question for user**: should the dashboard's strip continue to list pending-review entries *separately* from conflict entries (different copy: "N entries pending review" vs "M entries with conflicts"), or unify into a single "N items need your attention" row? Recommend keeping the per-reason copy variation — it's more actionable — but compute the *count* from one function.

### 2. Function shape

New module: `apps/myk9show/src/features/show-map/attention.ts`

```ts
export type AttentionReason =
  | 'pending_review'
  | 'entry_conflict'
  | 'check_in_conflict'
  // expand as new reasons are added; keep this list closed
  ;

export interface EntryLike {
  entry_status?: string | null;
  check_in_status?: string | null;
  // ... minimum fields the function reads — keep narrow
}

export function getEntryAttention(entry: EntryLike): AttentionReason | null { ... }

export function countAttention(entries: EntryLike[]): Record<AttentionReason, number> & { total: number } { ... }
```

- `getEntryAttention(entry)` returns the single highest-priority reason, or `null` if no attention.
- `countAttention(entries)` returns per-reason counts plus a `total`.
- Pure. No async, no Supabase calls. Inputs are already-fetched rows.

**[ADDED] Priority order (documented here, enforced in code).** When an entry matches more than one reason, return in this order:
1. `entry_conflict` — most actionable, most urgent (an entry has a hard problem)
2. `check_in_conflict` — actionable on show day
3. `pending_review` — frequent but rarely urgent

This ordering matters for the smart Recommended menu (lands later): the highest-priority reason becomes the recommendation; lower-priority reasons surface only if the higher one is resolved.

**[ADDED] Edge cases & error handling.**
- `getEntryAttention` on an entry with all status fields null/missing → returns `null` (no attention).
- `getEntryAttention` on an entry with an unknown status string → returns `null` (do not throw, do not classify as attention). Add a console warning in development so we notice new statuses; production is silent.
- `countAttention([])` → returns `{ pending_review: 0, entry_conflict: 0, check_in_conflict: 0, total: 0 }`. Never returns `undefined`.
- `usePendingEntries` query failure on the dashboard → strip renders empty state, NOT a wrong count. Component should distinguish "no items" from "fetch failed" (an inline retry affordance, or a quiet error icon).

**[ADDED] TypeScript: tie to canonical status enums.** `showMapStatus.ts` already imports `CLASS_STATUS`, `normalizeClassStatus`, `isCheckInStatus`, etc. from `@myk9/core`. The new module should import the *entry-status* canonical constants from the same package (or extend `@myk9/core` with an entry-status enum if one doesn't exist yet) instead of comparing to bare string literals. This prevents a future schema rename from silently breaking the function.

**[ADDED] Performance.** `getEntryAttention` is pure and constant-time per entry. `buildShowMapTree` already iterates entries to compute `attentionCount`; this change replaces the inner predicate, no new pass. Dashboard's `usePendingEntries` is already cached by React Query. No memoization needed at this scope.

### 3. Migration plan

Two callers migrate to the new function:

**3a. `ShowMapStructureTable` / `showMapTree.ts`**
- Replace `hasEntryAttention(entry)` (currently at `showMapStatus.ts:138`) with `getEntryAttention(entry) !== null`.
- `buildShowMapTree` already aggregates `attentionCount` up the tree; that aggregation stays — only the per-entry predicate changes.
- Existing tests in `showMapStatus.test.ts` and `showMapTree.test.ts` will need updates to reflect the broader definition (pending_review now counts as attention).
- **[ADDED] Delete the old `hasEntryAttention` export** from `showMapStatus.ts` after migration. Pre-launch + no compat shims (per CLAUDE.md / memory `project_prelaunch_no_users.md`) — no aliasing, no deprecation period. Any remaining call sites are updated in the same PR.
- **[ADDED] Specific failing assertions to update.** In `showMapStatus.test.ts`, any test asserting `hasEntryAttention({ entry_status: 'pending' })` returns `false` will need to flip to assert the new function returns `'pending_review'`. In `showMapTree.test.ts`, tests asserting `attentionCount === 0` for a tree of pending entries will need new expected values. Enumerate exhaustively in the PR description.

**3b. `SecretaryDashboardPage` / `AttentionNeededStrip`**
- `usePendingEntries()` continues to fetch — that's where the data comes from.
- After fetching, classify each entry via `getEntryAttention()` instead of trusting the fetch's status filter alone. This is a defensive belt — if the hook ever fetches a wider set of entries, the strip won't misreport.
- Per-show `count` in `index.tsx` line 59-64 derived from `countAttention()`.

### 4. Test plan (Phase 2)

**4a. Unit tests for the new function** — `apps/myk9show/src/features/show-map/__tests__/attention.test.ts`:
- `getEntryAttention` returns `'pending_review'` for `entry_status: 'pending_review'`.
- `getEntryAttention` returns `'entry_conflict'` for `entry_status: 'conflict'`.
- `getEntryAttention` returns `'check_in_conflict'` for `check_in_status: 'conflict'`.
- `getEntryAttention` returns `null` for `entry_status: 'accepted'`, `'completed'`, scratched, etc.
- Multi-reason rows return the highest-priority reason (priority order documented in code).
- `countAttention` aggregates correctly across a mixed list.

**4b. Divergence-prevention test** — `apps/myk9show/src/features/show-map/__tests__/attention-consistency.test.ts`:
- Given a fixed dataset (mock 100 entries spanning all relevant statuses), assert that:
  - The tree's aggregated `attentionCount` at the show root equals
  - The dashboard strip's count for the same show.
- This is the assertion-first test from the CLAUDE.md guidance — it would have caught the 81-vs-0 mismatch before the live walk did.

**4c. Update existing tests** that asserted the *old* definition. Expected churn:
- `showMapStatus.test.ts` — tests around `hasEntryAttention` need updates for the broader definition.
- `AttentionNeededStrip.test.tsx` — copy assertions may shift if the strip text format changes.

### 5. [ADDED] Visual-impact note (read before reviewing PR 2)

The Heritage fixture currently renders "0 Need Attention" on the Show List tile. After Phase 2 broadens the definition to include `pending_review`, that number jumps to ~80 for the same show. **This is the intended fix, not a regression.** Reviewers should:

- Re-run the live walk (`apps/myk9show/secretary-walk.mjs`) and confirm the tile shows a meaningful non-zero count.
- Confirm the dashboard strip count matches the show-list tile count for the same show (the divergence test asserts this, but eyeballing is cheap).
- Spot-check that tree rows now display "N need attention" badges where previously they didn't.

If the visual jump feels disorienting compared to other "Pending" UI in the app, that's a signal we may want to introduce a *severity* axis (urgent vs informational attention) — but parking that for a future iteration; the Phase 2 cut just unifies the count.

### 6. [ADDED] Rollback strategy

Phase 2 broadens a definition consumed by two surfaces. If it produces a worse UX (e.g., the Show List feels overwhelming because everything is suddenly flagged), rollback is straightforward because:

- The new `getEntryAttention` function is pure and isolated in `attention.ts`. Reverting that file restores the dashboard.
- Show-map's previous behavior is restored by changing one line in `showMapTree.ts` back to `hasEntryAttention` (which we'll restore via the rollback commit, not keep as dead code in trunk).
- No database migrations, no edge function deploys — pure frontend code. Rollback via `git revert` of the Phase 2 PR is the recovery path.

No feature flag is needed for a pre-launch app with no real users (per `memory/project_prelaunch_no_users.md`). If we were post-launch, we'd ship behind a flag with a gradual rollout.

### 7. Out of scope for Phase 2

- The full `getRankedActions(scope, state)` function described in the brainstorm. That's a richer function that returns *ranked actions*, not just *attention reasons*. It will subsume `getEntryAttention` later, but introducing it here would bloat the PR. Phase 2 ships the narrow attention function and migrates both callers; the rank-actions function lands in a later PR when the smart Recommended menu is built.
- Adding "scoring discrepancy" / "unsigned catalog" / "AKC submission failure" as attention reasons. Parked under #4 in the recommended definition above. Add them when the corresponding features ship.

---

## PR sequencing options

**Option A (recommended): Two separate PRs.**
- PR 1: Phase 1 only. Ships same-day. Small surface, low review burden.
- PR 2: Phase 2. Needs the product decision from §1, then 1–2 days of work + test updates.

**Option B: Single combined PR.**
- Both phases together. Higher review burden, but the data-attr work lands alongside its first consumer (the unified attention function uses no row-level DOM queries today, so this is a soft coupling rather than a hard one).

Default to Option A unless you have a strong preference for B.

---

## Resolved decisions (2026-05-16)

1. **Phase 2 §1 — attention definition**: ✅ **`pending_review` counts as attention.** Unified definition is the recommended list in Phase 2 §1.
2. **Phase 2 §1 — strip copy**: ✅ **Per-reason rows.** Dashboard strip continues to render one row per reason per show (e.g., "80 entries pending review — Heritage" + "3 entries with conflicts — Heritage" as separate rows). Count comes from the unified function; copy varies per reason.
3. **PR sequencing**: ✅ **Two PRs.** Phase 1 ships immediately; Phase 2 follows.

Phase 1 implementation begins now. Phase 2 implementation begins after Phase 1 merges.
