# Entries Filter Button (one Filter button, searchable multi-select)

> **Status:** Active

## Goal

The Entries tab toolbar carries a search box, a "Show:" select, two filter selects, a Clear all button, More and Add Entry. That is too much at once with no hierarchy. Replace the filter selects with one labelled **Filter** button that opens a searchable multi-select menu (Linear-style), show what is applied as plain sentences, and keep one primary button. Built as a `list-toolkit` component so every list can adopt it later; the Entries tab is the only user until after the Oct 10 show.

Guideline (owner, 2026-10-06): simplify the UI and UX.

## Duplication question

Does this duplicate an existing surface? Partly, and on purpose: it **replaces** the always-visible labelled selects in `ListFilterBar` (MYK9-906) on one page; it does not add a second filter UI beside them. `ListFilterBar` stays untouched for the twelve other lists until each migrates (after Oct 10), then it is deleted. Reuse: `cmdk` (`components/ui/command.tsx`) and `Popover` for the menu. `SearchablePopover` is single-select and closes on pick, so it cannot be the base.

This **reverses the MYK9-906 decision** (2026-10-01: every field always visible as a labelled select). The owner chose this on 2026-10-06 knowing that. Mitigation: watch a real secretary use it at the Oct 10 show before any other page moves.

## What the toolbar becomes

One row on wide screens, stacked on phones and tablets (as today):

```
Show: Needs review (2) ▾      [Search]  [Filter]            ⋯ More   + Add Entry
Trial: Trial 2 ×   Class: Interior Novice B, Exterior Excellent ×   Clear all
Showing 2 of 11 forms · 15 entries
```

- **Show:** stays a labelled select of lists with counts (unchanged wording).
- **Search:** one quiet field (icon that expands on click on phones), beside Filter, no longer above the filters.
- **Filter:** one button. Opens a menu: a search box at the top, then the page's fields (Trial, Class), each with its values and live counts. Values are checkboxes: pick several, the menu stays open. `F` opens it (when no text field is focused). Arrow keys and Enter work; Escape closes.
- **Applied filters** read as plain sentences with an ×: "Class: Interior Novice B, Exterior Excellent ×". Row hidden when nothing is applied. **Clear all** appears only then.
- **Add Entry** is the only primary button. **More** stays secondary.
- Targets 44px; the menu is a full-width sheet under 640px.

Filters are **page-specific**: each page declares its fields (`ListFilterField[]`), the menu shows only those. No global filter list.

## Data model change (`list-toolkit/types.ts`)

Add `ListMultiOptionsFilterField` (`kind: 'multiOptions'`, `values: string[]`, `onChange(values: string[])`, same `options` with `count`). Keep `ListOptionsFilterField` (single) so nothing else breaks. `isFieldActive`, the sentence builder and `ListResultLine`'s "filtered" test learn the new kind.

## Entries wiring

- **Trial / Class:** URL params become comma lists (`trial=a,b`, `class=c,d`); a single value stays valid, so every existing link works. Class options are the union of the selected trials' classes (all classes when no trial is picked, grouped by trial). Today `onScopeChange(trialId, classId)` clears the class when the trial changes; with lists, a class whose trial is deselected is dropped.
- **Queues (Show:):** the four registration queues become checkable (`queue=needs-review,payment-due`; Needs review plus Payment due is a useful union). Waitlist, Pulls and Move-ups stay single choices: they are different lists with different rows, so "Needs review and Waitlist" cannot be one list. Picking one of those clears the queue checks. "All" is the empty set.
- **Registry filter** (`registration` key in the cockpit state) is a focused-form key, not a filter; unchanged.
- Density stays gone (removed 2026-10-07).

## Open decisions (owner)

1. **Queues as checkboxes inside "Show:"** (above) versus keeping Show: single-select and multi-select only for Trial and Class. Recommendation: checkboxes, because the owner's example was combining queues, and the result stays one select.
2. **Counts in the menu** are computed from the current queue and search, so they shrink as you filter (Linear behavior). Alternative: counts from the whole show. Recommendation: whole-show counts, so a value never reads "0" because of another filter; it is cheaper and steadier.
3. **Search icon-collapse on desktop.** Recommendation: collapsed to an icon only below 1024px; a visible field above.

## Phases

1. **Model and pure helpers** (no UI): `multiOptions` type, active/sentence helpers, comma-list parse and serialize for params, with tests (round-trip, stale ids dropped, single-value links still work).
2. **`ListFilterMenu`** (cmdk in a Popover): search, checkbox rows with counts, keyboard (`F`, arrows, Enter, Escape), sheet on phones. Tests: keyboard path, multi-pick keeps the menu open, count wording, empty search result.
3. **`ListAppliedFilters`** (sentences, ×, Clear all) and the quiet search; wire both into `ListToolbarLayout` behind a prop so other lists are unchanged.
4. **Entries wiring**: cockpit params, `entryManagementFilterFields`, `Show:` checkable queues, result line "filtered" test, deep links from other pages (Reports, the show header) re-checked.
5. **Testing phase** (a phase is not done until these pass): unit and component tests; shuffled full run (`pnpm vitest run --sequence.shuffle`); `pnpm typecheck`, ratchet; browser walk at 375, 768, 1280 with the seeded show: pick two classes, two queues, clear one chip, clear all, reload (URL restores), back button; a measured 44px check on every control with the harness in the scratchpad pattern (known-answer probes first).
6. **Review and rollout**: adversarial tier, two lenses (correctness, regressions); owner merges; deploy only on request. Before Oct 10 the Entries tab only.

## After Oct 10 (not in scope now)

Migrate the other twelve `ListFilterBar` users one page per PR, then delete `ListFilterBar`, `FilterFieldEditor` and the select-based `OptionsControl`. Update the secretary guide wording and screenshot S-07 in the same docs pass (needs `pnpm askq:prepare-docs`, a Codex review and an ask-myk9show deploy).

## Risks

- Reversal of MYK9-906: a novice may miss "Filter". Mitigation: labelled button with the word, not an icon; the applied sentences make state visible; watch a secretary on Oct 10.
- URL shape change: guarded by accepting single values and by tests on legacy links.
- Timing: this is a build, not a polish, and the Oct 5 freeze has passed with the Oct 10 show three days out. Recommendation: build and review it now, **merge and deploy after the show** (Oct 11 or later), so the secretary runs the show on the filters she rehearsed with. The owner can override and ship it before the show; if so it needs a full browser walk first, and nothing ships if that walk is not green.
