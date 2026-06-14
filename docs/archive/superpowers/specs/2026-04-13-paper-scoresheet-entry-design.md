# Paper Scoresheet Entry — Design Spec

**Date:** 2026-04-13
**Status:** Approved — ready for implementation planning

---

## Problem

When clubs don't use myK9Q at ringside, the secretary enters scores from paper sheets in myK9Show. The current flow was designed for judges running dogs live (with a stopwatch), not for bulk paper entry. Key friction:

- A live timer occupies most of the screen; the secretary already has the time on paper.
- A confirmation dialog fires on every save — one extra click per dog across an entire class.
- The secretary navigates away from the class list for every dog and back again.
- There is no way to enter results for the majority of dogs (usually Q) without clicking Q individually for each one.

---

## Solution

Replace the current one-dog-at-a-time scoring flow in myK9Show with a purpose-built **Paper Scoresheet Entry** page. The existing scoresheets in `packages/scoring-ui` (with live timer, confirmation dialog) are left completely untouched — they remain the ringside experience in myK9Q.

---

## Route

`/scoring/classes/:classId/entries`

This is the same route currently used by `ScoringEntryListPage`. That component is replaced with the new `PaperScoresheetPage`. The individual scoresheet route `/scoring/classes/:classId/entries/:entryId` remains in place and is still reachable by direct link, but is no longer the primary entry point from the class list.

---

## Page Structure

### Session Toolbar

A bar above the main content, set once per class (component state — resets when a new class is opened):

- **Pre-fill** — `None` (default) / `Q` / `NQ`. When Q or NQ is selected, every dog opens with that result pre-highlighted and (for Q) the time field ready. Nothing is saved until the secretary clicks Save or Save & Next. The secretary can override to any other result before saving.
- **Record time for** — `Q only` (default) / `All runs`. In "Q only" mode, NQ/ABS/EX dogs save immediately on result click with no time prompt. In "All runs" mode, a time field appears for every result, marked optional — leave blank to skip.

### Mode Toggle

A toggle in the page header switches between **Split Panel** (default) and **Sequential**. The preference is stored in `localStorage` keyed by user ID and persists across sessions.

---

## Split Panel Mode (default)

Two columns side-by-side. The table column is always visible.

### Left — Class Entry List

Compact table rows showing: armband badge, dog name, handler name, result badge (once scored). Completed rows are dimmed. The active row is highlighted with a border. Clicking any row selects it and opens the right panel. Completed rows can be re-selected to review or correct.

### Right — Entry Panel

Opens when a row is selected. Contains:

1. **Dog info header** — armband badge, dog name, handler name, class element/level
2. **Result buttons** — Q, NQ, ABS, EX as large, full-width buttons. Result is selected first.
   - **NQ / ABS / EX** in "Q only" time mode: clicking the result button auto-saves immediately and advances to the next unscored dog. No Save button needed. **Exception:** if a pre-fill is active, the result is pre-highlighted but not yet saved — Save and Save & Next buttons appear so the secretary can confirm or override before anything is committed.
   - **Q**: selecting Q reveals the time field and fault counter below (no auto-save).
   - **NQ / ABS / EX** in "All runs" time mode: reveals the time field (optional), then requires Save or Save & Next.
3. **Time field** — monospace `M:SS.HH` format. Auto-focused when revealed. Tab or Enter moves to faults.
4. **Faults counter** — appears only when Q is selected. Optional +/− stepper, defaults to 0.
5. **Save** — saves the current entry, closes the panel, returns focus to the table.
6. **Save & Next** — saves the current entry, closes the panel, and auto-selects the next unscored dog in run order (opening the panel immediately).

When the pre-fill is active (Q or NQ set), the corresponding result button is pre-highlighted with a dashed border and a "pre-filled · click to confirm" label. The secretary can override to any other result before saving.

---

## Sequential Mode

Full-width single-dog view. The class list is hidden.

- **Progress bar** at the top — "5 of 12 scored" with prev/next arrows to jump between dogs.
- **Dog info** — large armband badge, dog name, handler.
- **Result buttons, time field, faults counter** — same logic as the Entry Panel above.
- **Save** and **Save & Next** buttons at the bottom.
- The same session toolbar (Pre-fill, Record time for) applies and persists when switching between modes.

---

## Data

- **Source:** `replicatedEntriesTable` and `replicatedDogsTable` — same as the existing `ScoringEntryListPage`. No new data sources.
- **Save mutation:** `replicatedEntriesTable.updateEntry()` with `result_status`, `search_time_seconds`, `total_faults`, and `checkInStatus: 'completed'`. Same mutation used by the existing score reset handler.
- **Next unscored logic:** After Save & Next, find the first entry sorted by `exhibitorOrder` (run order field) where `result_status` is `pending`. If none remain, show a completion state ("All dogs scored").

---

## Navigation — Three Entry Points

All three land on the same `PaperScoresheetPage` at `/scoring/classes/:classId/entries`.

1. **Show detail → Trial → Class detail → "Enter Scores" button** — contextual drill-down. Already navigates to this route; no routing change needed.
2. **Secretary dashboard → "Classes awaiting scoring" section** — new section listing classes where at least one entry has `check_in_status` of `checked-in` or `in-ring` and `result_status` of `pending` (i.e., dogs showed up and haven't been scored yet). One click per class goes directly to the scoring page. Avoids the drill-down when switching between classes.
3. **Entry Management → select trial → select class → "Enter Scores"** — currently renders `ScoringModeWrapper`/`ClassResultsTable` inline. Updated to navigate to `/scoring/classes/:classId/entries` instead.

---

## Components

| Component             | Location                                      | Responsibility                                             |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| `PaperScoresheetPage` | `pages/scoring/PaperScoresheetPage.tsx`       | Page shell, mode toggle, session toolbar, data loading     |
| `SplitPanelView`      | `pages/scoring/components/SplitPanelView.tsx` | Two-column layout, row selection state                     |
| `SequentialView`      | `pages/scoring/components/SequentialView.tsx` | Full-width single-dog view, prev/next navigation           |
| `EntryPanel`          | `pages/scoring/components/EntryPanel.tsx`     | Dog info, result buttons, time field, faults, save buttons |
| `SessionToolbar`      | `pages/scoring/components/SessionToolbar.tsx` | Pre-fill selector, time recording toggle                   |
| `ClassEntryRow`       | `pages/scoring/components/ClassEntryRow.tsx`  | Compact row for the left-column table                      |

`EntryPanel` is shared by both modes. `SplitPanelView` and `SequentialView` each render it with the appropriate layout wrapper.

---

## What Changes vs. What Stays

| Item                                                               | Change                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `ScoringEntryListPage`                                             | Replaced by `PaperScoresheetPage` at the same route                                    |
| `ScoresheetPage` + individual scoresheets in `packages/scoring-ui` | Untouched — myK9Q ringside flow unchanged                                              |
| `ScoringModeWrapper` in Entry Management                           | Updated to navigate to `/scoring/classes/:classId/entries` instead of rendering inline |
| Secretary dashboard                                                | New "Classes awaiting scoring" section added                                           |
| Confirmation dialog                                                | Removed from the myK9Show scoring flow entirely                                        |
| Live timer                                                         | Not present in the new page — timer lives in myK9Q only                                |

---

## Testing

- **`EntryPanel`** — result-first logic; time field hidden until Q selected (Q-only mode); time field shown for all results (all-runs mode); pre-fill pre-highlights result but does not auto-save; NQ/ABS/EX auto-saves in Q-only mode; Save and Save & Next call the correct mutation.
- **`SessionToolbar`** — pre-fill options render; selecting a pre-fill value updates the panel state; time recording toggle switches between modes.
- **Next-unscored logic** — given a list of entries with mixed result statuses, finds the correct next pending entry in run order; returns null when all are scored.
- **`SplitPanelView`** — clicking a row opens the panel; completing an entry dims the row; Save & Next advances the selection.
- **`SequentialView`** — prev/next arrows navigate between dogs; progress bar reflects scored count.
- **Entry Management navigation** — "Enter Scores" action navigates to the correct route rather than rendering inline.
