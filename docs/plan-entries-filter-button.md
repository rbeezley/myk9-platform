# Entries Filter Button (one Filter button, searchable multi-select)

> **Status:** Active

> **Progress (2026-10-08):** Phases 1–6 merged for the Entries tab: #2809, #2811, #2817, #2822 (2026-10-08). Not deployed until a Deploy myK9Show run. Still open: the "After Oct 10" migration of the other lists.

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
- **Applied filters** read as plain sentences with an ×: "Class: Interior Novice B, Exterior Excellent ×". Row hidden when nothing is applied. **Clear all** appears only then, or when the page says something outside the fields (the search text) also narrows the list.
- **Add Entry** is the only primary button. **More** stays secondary.
- Targets 44px. On phones the menu is a near-full-width popover (22rem or the screen width minus 2rem), not a bottom sheet; a true sheet is added only if the Oct 10 observation shows the popover is hard to use. `F` goes through the app's shared `useKeyboardShortcuts`, so it is ignored while typing or while a dialog is open, and it only opens (Escape closes).

Filters are **page-specific**: each page declares its fields (`ListMenuFilterField[]`, the single-select, date-range and multi-select kinds), the menu shows only those. No global filter list.

## Data model change (`list-toolkit/types.ts`)

Add `ListMultiOptionsFilterField` (`kind: 'multiOptions'`, `values: string[]`, `onChange(values: string[])`, same `options` with `count`). Keep `ListOptionsFilterField` (single) so nothing else breaks. `isFieldActive`, the sentence builder and `ListResultLine`'s "filtered" test learn the new kind.

## Entries wiring

- **Trial / Class:** URL params become comma lists (`trial=a,b`, `class=c,d`); a single value stays valid, so every existing link works. Class options are the union of the selected trials' classes (all classes when no trial is picked, grouped by trial). Today `onScopeChange(trialId, classId)` clears the class when the trial changes; with lists, a class whose trial is deselected is dropped.
- **Queues (Show:):** the four registration queues become checkable (`queue=needs-review,payment-due`; Needs review plus Payment due is a useful union). Waitlist, Pulls and Move-ups stay single choices: they are different lists with different rows, so "Needs review and Waitlist" cannot be one list. Picking one of those clears the queue checks. Exact queue rules are under "Settled before Phase 2" below.
- **Registry filter** (`registration` key in the cockpit state) is a focused-form key, not a filter; unchanged.
- Density stays gone (removed 2026-10-07).

## Decisions (recommendations adopted unless the owner says otherwise)

1. **Queues as checkboxes inside "Show:"** (above) versus keeping Show: single-select and multi-select only for Trial and Class. Recommendation: checkboxes, because the owner's example was combining queues, and the result stays one select.
2. **Counts in the menu** are computed from the current queue and search, so they shrink as you filter (Linear behavior). Alternative: counts from the whole show. Recommendation: whole-show counts, so a value never reads "0" because of another filter; it is cheaper and steadier.
3. **Search icon-collapse on desktop.** Recommendation: collapsed to an icon only below 1024px; a visible field above.

## Settled before Phase 2 (found in the Phase 1 design review)

These are rules, not options; Phase 2-4 build to them.

1. **Queue semantics.** An absent `queue` param still means Needs review (today's default; old links keep working). The param holds either a list of non-All queues (`queue=needs-review,payment-due`) or exactly `all`. **All is exclusive**: choosing All clears the other checks, choosing any other check clears All. Unchecking the last box writes `queue=all`, never an empty set; Clear all also writes `all`. Legacy params map as `getQueue` does today (`payment=pending` becomes the list `payment-due`; `attention=missing_information` becomes `missing-information`; `attention=all|accepted|issues` becomes `all`). The exclusivity rules live in the Show: select component, not in the field type.
2. **State shape and its ripple.** `EntryManagementCockpitState.queue` becomes a list. Phase 4 updates every reader: `entryManagementViewId` and the view row's highlighted value (several checks read as "Needs review + Payment due"), the result line's "filtered" test (trial list, class list and queue list all count), `writeCockpitQueue` / `writeCockpitView`, and the view counts. `entryManagementFilters.ts` (legacy `queue=pulled` handling) is read and updated in the same phase.
3. **Several trials need classes for several trials.** `useEntryManagementTrialClasses` takes one trial today and returns `undefined` for "scope unknown, do not scope". With several trials it fetches per show (or per selected trial) and returns the union only when **every** selected trial has loaded; otherwise `undefined`, so a still-loading trial never hides registrations. With no trial picked, class options are all of the show's classes (a new fetch, not just a toggle).
4. **One gesture, one URL write.** Choosing or dropping a trial can drop classes whose trial is no longer selected. That is one atomic `onScopeChange(trialIds, classIds)` through `patchSearchParams`; two separate field `onChange` calls would race on stale params. The Entries field builder computes the pruning, not the toolkit. The applied-filter × calls the field's own `onChange` (`clearField`), so removing Trial must go through that same atomic write: the Trial field's `onChange` does the class pruning itself. `keepOfferedValues` must not run in the URL normalizer before the class options have loaded, or the first render erases the user's `class=`; gate it the way `registration` is gated.
5. **Class names repeat across trials.** Entries option labels carry the trial ("Trial 2 · Interior Novice B"), so menu rows and the applied sentence are unambiguous. If Phase 2 needs grouped rows, it adds an optional `group` to `ListFilterOption` then; not before.
6. **Options still loading.** The applied-filter row must not print raw ids while a field's options are loading (or offline): a field carries an optional `loading` flag, and while it is set the chip reads "Class: loading…" (never ids, and never an unfiltered-looking list) and the menu shows "Loading…".
7. **Count meaning.** In the Filter menu, `count` is "rows that match this value on its own", measured over the whole show (open decision 2's recommendation), for **Trial and Class values**; update the type comment when Phase 2 lands. The per-queue counts in Show: stay as they are today (scoped to the chosen trial and class, from `useEntryManagementCockpit`, which falls back to whole-show counts while a search is active; rule 8's union count inherits that); Waitlist, Pulls and Move-ups counts keep coming from their own sources.
8. **Several queues is a union, and counts do not add.** Queues overlap (one form can need review and have payment due, `attentionReasons` in `showRegistrationProjection.ts`), so the Show: trigger for "Needs review + Payment due" shows the number of distinct forms matching either, never the sum of the two queue counts. `buildShowRegistrationPage` and `getScopedShowRegistrationQueueCounts` take a list of queues (a `groupMatchesAnyQueue` predicate), not one.
9. **Canonical URL forms and when the normalizer may prune.** `queue` is normalized to menu order with repeats and unknown values dropped; if `all` appears with others, **All wins** (nothing is hidden by a hand-edited link). A stable order keeps the `replace` effect from rewriting the URL forever. Legacy precedence stays: a canonical `queue=` beats `payment=pending`, which beats `attention` / `entryTab`; anything unrecognized falls to Needs review. `CockpitNormalizationContext` gains "trials loaded" and "classes loaded"; `trial` / `class` ids are pruned only once the matching list has loaded. While loading, paused or offline, ids stay in the URL and are not pruned. (`trial=bogus` today yields an empty class list; after pruning it yields no scope at all, which is intended.)
10. **The classes hook returns each class with its trial.** `useEntryManagementTrialClasses` returns `{ classId, trialId, name }[]` (plus the "every selected trial loaded" flag from rule 3), because pruning (rule 4) and the trial-prefixed labels (rule 5) both need the class-to-trial map. Pruning waits until every selected trial has loaded.
11. **Page-level single-trial consumers.** `registerCommandMenuContext({ trialId })` gets a trial only when exactly one is selected. Also updated in Phase 4: `trialScopePending`, `trialClassesUnknown` and `refetchTrialClasses` (the scope-unavailable notice in `EntryManagementCockpit`), `queueTotalsDescribeWholeShow`, the cockpit `viewKey`, and the comments in `operationalViews.ts` and `entryManagementFilters.ts` that describe `queue` as one value.
12. **A class with no trial is valid.** Rule 3 makes "all of the show's classes" selectable before a trial is chosen, so `writeCockpitScope` stops deleting `class` when there is no trial (and the comment in `operationalViews.ts` that describes class as cleared together with trial is updated; the clearing itself lives in `writeCockpitScope`). Precedence: a non-empty class list narrows within the selected trials; today's `classId` override in the projection becomes that rule.
13. **Unchecking the last queue box jumps to All.** Intended, and consistent with `handleClearEntryFilters`, which already writes `all`. The result line's "filtered" test (`activeId !== 'all'`) then reads unfiltered.
14. **Naming.** The helpers are `toggleListValue` and `keepOfferedValues`. `ListFilterField` stays the narrow union `ListFilterBar` takes until the last list migrates; the end state (after `ListFilterBar` is deleted) is a single `ListFilterField` union including the multi-select kind.

## Phases

1. **Model and pure helpers** (no UI): `multiOptions` type, active/sentence helpers, comma-list parse and serialize for params, with tests (round-trip, stale ids dropped, single-value links still work).
2. **`ListFilterMenu`** (cmdk in a Popover): search, checkbox rows with counts, keyboard (`F`, arrows, Enter, Escape), near-full-width popover on phones. Tests: keyboard path, multi-pick keeps the menu open, count wording, empty search result.
3. **`ListAppliedFilters`** (sentences, ×, Clear all) and the quiet search; wire both into `ListToolbarLayout` behind a prop so other lists are unchanged.
4. **Entries wiring**: cockpit params, `entryManagementFilterFields`, `Show:` checkable queues, result line "filtered" test, deep links from other pages (Reports, the show header) re-checked.
5. **Testing phase** (a phase is not done until these pass): unit and component tests; shuffled full run (`pnpm vitest run --sequence.shuffle`); `pnpm typecheck`, ratchet; browser walk at 375, 768, 1280 with the seeded show: pick two classes, two queues, clear one chip, clear all, reload (URL restores), back button; a measured 44px check on every control with the harness in the scratchpad pattern (known-answer probes first).
6. **Review and rollout**: adversarial tier, two lenses (correctness, regressions); owner merges; deploy only on request. Before Oct 10 the Entries tab only.

## After Oct 10 (not in scope now)

Migrate the other twelve `ListFilterBar` users one page per PR, then delete `ListFilterBar`, `FilterFieldEditor` and the select-based `OptionsControl`. Update the secretary guide wording and screenshot S-07 in the same docs pass (needs `pnpm askq:prepare-docs`, a Codex review and an ask-myk9show deploy).

## Risks

- Reversal of MYK9-906: a novice may miss "Filter". Mitigation: labelled button with the word, not an icon; the applied sentences make state visible; watch a secretary on Oct 10.
- URL shape change: guarded by accepting single values and by tests on legacy links.
- Size of Phase 4: the Phase 1 design review showed it reaches the cockpit state, params normalizer, projection and counts, the classes hook, the page's single-trial consumers and the command-menu context (settled rules 1 to 14), about a dozen files. It is the riskiest part and the only one that changes how the secretary's queue is computed.
- Timing: this is a build, not a polish, and the Oct 5 freeze has passed with the Oct 10 show three days out. Recommendation: build and review it now, **merge and deploy after the show** (Oct 11 or later), so the secretary runs the show on the filters she rehearsed with. The owner can override and ship it before the show; if so it needs a full browser walk first, and nothing ships if that walk is not green.
