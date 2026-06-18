# Plan: Lane 2.2 — Entry Management checkbox multi-select (bulk editing)

> **Status:** Active

**Lane:** 2 (Secretary Operational UX), step 2. Depends on Lane 2.1 (shared row-action menu,
[#825](https://github.com/rbeezley/myk9-platform/pull/825), merged) so the per-row interaction
pattern isn't touched twice.

## Goal

Let a secretary select many entries at once on the **Entry Management** Table view and apply a bulk
action (Approve / Waitlist / Reject / Mark Checked-In) in one step — the "approve 20 entries"
time-to-task baseline. Consolidation-first: **reuse** the existing selection hook, bulk mutations,
and bulk-bar pattern. No new mutation machinery.

## Scope decisions (confirmed 2026-06-18)

- **Surface: Table view only.** Checkboxes + select-all + sticky bulk bar land on the flat
  `EntriesTableView`. The List view (grouped `EnrollmentCard`s) keeps its existing per-group bulk
  buttons — same handlers, different selection source, so not a duplication.
- **No bulk Withdraw/Delete in v1.** Withdrawal can involve per-entry refund decisions
  (`RefundEntryDialog`); a bulk path would bypass that. Stays per-entry.

## What already exists (reuse, don't rebuild)

- `useBulkSelection<T>` (`hooks/useBulkSelection.ts`) — Set-based selection with
  `toggleItem/toggleAll/isSelected/isAllSelected/isPartiallySelected/clearSelection/selectedItems`.
  Currently unused by Entry Management.
- Bulk mutations already wired into `RegistrationView` as props: `onBulkStatusChange(entryIds, status)`
  (→ `bulkUpdateEntryStatus`), `onBulkCheckIn(entryIds)` (→ replicated check-in).
- `Checkbox` themed primitive (`components/ui/checkbox`).
- Bulk-bar precedent: `ResultsControlPage/BulkOperationsBar.tsx` (sticky bottom bar, count +
  Select All + Clear + actions, clears on success).
- `EntryStatus` enum (`types/show-registration-types.ts`).

## Design

Selection is **lifted into `RegistrationView`** (not `DataTable`'s internal `rowSelection`, which has
no external reset and only does page-scoped select-all). `useBulkSelection` keys off `filteredEntries`
so select-all spans the full filtered set across pages, and the bar can clear it after an action.

1. **`RegistrationView`** — `const selection = useBulkSelection({ items: filteredEntries, getItemId: e => e.id })`.
   - Wrap the tab `onValueChange` to `selection.clearSelection()` before `setSelectedTab` (no
     `useEffect` setState — repo lints against `react-hooks/set-state-in-effect`).
   - Render `<EntryBulkActionsBar>` only when `entryViewMode === 'table'` and
     `selection.selectedItems.length > 0`.
2. **`EntriesTableView`** — accept an optional `selection` prop; when present, prepend a leading
   `_select` column: header = themed `Checkbox` bound to `isAllSelected`/`isPartiallySelected`/
   `toggleAll`; cell = `Checkbox` bound to `isSelected(entry)`/`toggleItem(entry)` with
   `stopPropagation` so row-click (if any) doesn't fire.
3. **`EntryBulkActionsBar`** (new, modeled on `BulkOperationsBar`) — props: `selectedEntries`,
   `onBulkStatusChange`, `onBulkCheckIn`, `onClear`. Actions: Approve, Waitlist, Reject,
   Mark Checked-In, plus Clear. Each action operates on the **eligible** subset (see below), shows a
   toast with the affected count, then calls `onClear()`.
4. **Eligibility helper** (pure, testable) — `getEligibleForBulkAction(entries, action)`:
   - Approve/Waitlist/Reject: exclude `completed`, `scratched`, `moved`, `withdrawn`,
     `move-up-requested` (don't clobber scored/closed entries); Approve/Reject/Waitlist target
     pending/waitlist/accepted as appropriate.
   - Check-In: entries that have at least one class.
   - Disable a bar action when its eligible subset is empty.

## Files

- **New:** `components/entries/management/EntryBulkActionsBar.tsx`
- **New:** `components/entries/management/bulkActionEligibility.ts` (pure helper)
- **Edit:** `components/entries/management/EntriesTableView.tsx` (optional select column)
- **Edit:** `components/entries/management/RegistrationView.tsx` (lift selection, render bar, clear on tab change)

## Testing (required)

- `bulkActionEligibility.test.ts` — assertion-first: each action returns the correct eligible subset
  given a mixed-status entry list (esp. that `completed`/`move-up-requested` are excluded from
  status changes).
- `EntryBulkActionsBar.test.tsx` — renders nothing when empty; renders count when selected; clicking
  Approve calls `onBulkStatusChange` with the eligible ids + `accepted` then `onClear`; an action is
  disabled when no eligible entries; Check-In calls `onBulkCheckIn`.
- `EntriesTableView` selection test — select-column header toggles all; row checkbox toggles one;
  checkbox click does not trigger row click.
- `pnpm typecheck` + `pnpm lint` + affected tests green before "done".

## Out of scope / follow-ups

- List-view (grouped) multi-select.
- Bulk Withdraw/refund.
- `common/ThreeDotMenu` consolidation (carried from Lane 2.1).
