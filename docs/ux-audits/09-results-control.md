# UX Audit: Results Control

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of ResultsControlPage and sub-components
**Role context:** Secretary -- "That was easy"

---

## Pass 1: Mental Model Alignment

**Question:** Does the page reflect how a secretary thinks about controlling results?

| #   | Finding                                                                                                         | Severity | Notes                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Three-level inheritance model (show > trial > class) matches how dog shows are organized                        | OK       | Secretaries think in terms of "whole show defaults" with exceptions per trial or class. The cascade model is correct.                                                                                                                                                                                                                       |
| 1.2 | Preset names (Open, Standard, Review) use plain language, not technical terminology                             | OK       | Good. Matches INTENT.md: "use dog show terminology, not technical terminology."                                                                                                                                                                                                                                                             |
| 1.3 | Results visibility and self check-in are on the same page but in separate cards                                 | Low      | These are conceptually different concerns. A secretary would think "Who can see results?" and "Can exhibitors check in?" as separate tasks. The page groups them sensibly, but the page title "Results Control" does not suggest check-in lives here. A secretary looking for check-in settings may not think to look at "Results Control." |
| 1.4 | "Release Results" as a concept is correct -- secretaries do manually release results after review               | OK       | Matches the real-world workflow where results are held until the secretary is satisfied they are correct.                                                                                                                                                                                                                                   |
| 1.5 | The inheritance label shows "Inheriting from show" or "Inheriting from trial" -- uses software cascade language | Medium   | Secretaries do not think in terms of "inheritance." They think "using the default" or "same as the show." Consider "Using show default" / "Using trial default" instead of "Inheriting from show/trial."                                                                                                                                    |

---

## Pass 2: Information Architecture

**Question:** Is the hierarchy clear? Can the secretary find what they need without hunting?

| #   | Finding                                                                                                                                   | Severity | Notes                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Page structure: Header > Results Visibility card (Presets + Trial Overrides + Class Overrides) > Self Check-In card > Bulk Operations Bar | OK       | Top-down from broadest (show) to narrowest (class) is logical.                                                                                                                                                                                                                                                                                                                   |
| 2.2 | Class Overrides are nested inside collapsibles grouped by trial                                                                           | OK       | Good for shows with many classes. Prevents overwhelming the secretary.                                                                                                                                                                                                                                                                                                           |
| 2.3 | Self Check-In section duplicates the trial/class override pattern from the visibility section                                             | Medium   | The SelfCheckinSection has its own Trial Overrides and Class Overrides sub-sections that mirror the visibility section's structure. This means a secretary managing a single trial's settings must interact with two separate accordion sections -- one for visibility, one for check-in. Consider consolidating per-trial settings into a single trial card with both concerns. |
| 2.4 | The Self Check-In card header has a UserCheck icon, but SelfCheckinSection renders its own internal Card with another UserCheck icon      | Low      | Double icon and double card nesting. The outer Card (in index.tsx) wraps the inner Card (in SelfCheckinSection line 105). This creates visual nesting that adds clutter.                                                                                                                                                                                                         |
| 2.5 | Advanced per-field timing is hidden behind an "Advanced" collapsible                                                                      | OK       | Good progressive disclosure. Most secretaries will use presets; power users can drill in.                                                                                                                                                                                                                                                                                        |
| 2.6 | No breadcrumb or back navigation visible in the page                                                                                      | Low      | Secretary arriving here may not know how to get back. Relies on app-level navigation (sidebar, etc.), which is likely sufficient but worth verifying.                                                                                                                                                                                                                            |

---

## Pass 3: Affordance Clarity

**Question:** Can the secretary tell what is clickable, what the controls do, and what will happen?

| #   | Finding                                                                                                           | Severity | Notes                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Preset cards are clickable and apply immediately on click -- no confirmation                                      | OK       | Matches INTENT.md anti-pattern avoidance: "no confirmation dialogs for routine actions." Good.                                                                                                                                                                                                          |
| 3.2 | Preset cards use `ring-2 ring-primary` to indicate active state                                                   | OK       | Clear visual distinction between active and inactive presets.                                                                                                                                                                                                                                           |
| 3.3 | Reset buttons (RotateCcw icon) use `title` attribute for tooltip but no visible label                             | Medium   | An icon-only button with a `title` tooltip does not work on touch devices. INTENT.md guardrail: "No hover-only interactions." The reset button's purpose is only discoverable via hover tooltip. Consider adding an `aria-label` (done) and either a visible "Reset" label or a more recognizable icon. |
| 3.4 | Collapsible trial headers in ClassOverrides use a `Button variant="ghost"` but no chevron/arrow indicator         | Medium   | Nothing visually signals that trial rows are expandable. The CollapsibleTrigger is a ghost button showing trial name and class count, but without a caret or expand icon, it looks like a static label. Secretary may not discover the class-level controls.                                            |
| 3.5 | The "Apply Preset" dropdown in BulkOperationsBar has no label explaining what it does beyond the placeholder text | Low      | Placeholder "Apply Preset" is reasonable, but on a busy show day the secretary may not immediately connect "Apply Preset" to "change visibility for selected classes."                                                                                                                                  |
| 3.6 | Select dropdowns for trial/class overrides show "Inherit" as placeholder when no override is set                  | OK       | Good affordance -- "Inherit" communicates that no explicit choice has been made.                                                                                                                                                                                                                        |
| 3.7 | BulkOperationsBar appears only when classes are selected, as a sticky bottom bar                                  | OK       | Good pattern. The bar does not waste space when not needed and is always accessible when it is.                                                                                                                                                                                                         |
| 3.8 | "Release Results" button is disabled when no selected classes use `manual_release` timing                         | OK       | Correct behavior. However, there is no tooltip or explanation for why it is disabled. A secretary tapping a disabled button gets no feedback.                                                                                                                                                           |

---

## Pass 4: Cognitive Load

**Question:** How much must the secretary hold in their head to use this page effectively?

| #   | Finding                                                                                                                                           | Severity | Notes                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | The page has two major sections (Visibility and Check-In), each with three levels of overrides (show, trial, class) = 6 control surfaces          | Medium   | A show with 3 trials and 15 classes creates dozens of individually configurable controls. The presets help, but the override sections can still be overwhelming. For the "that was easy" intent, this is a lot of surface area.                                                                                 |
| 4.2 | Bulk operations require the secretary to first select classes via checkboxes, then use the bottom bar                                             | Low      | Two-step pattern (select then act) is standard but adds cognitive overhead vs. direct per-class actions which are also available. The two paths to the same outcome (individual dropdowns vs. bulk) could be confusing.                                                                                         |
| 4.3 | Advanced timing options use values like `immediate`, `class_complete`, `manual_release`                                                           | Low      | These are displayed via `TIMING_LABELS` which should map to human-readable strings. Assuming the labels are clear (e.g., "Immediately," "After class completes," "Manual release"), this is fine. Worth verifying label text.                                                                                   |
| 4.4 | No summary or dashboard view showing effective settings across all classes                                                                        | High     | After configuring overrides at multiple levels, there is no way for the secretary to see "here is what each class is actually set to" in a single glance. The secretary must mentally compute the cascade (show default + trial override + class override) per class. This directly undermines "That was easy." |
| 4.5 | Class override rows show inheritance source ("Inheriting from trial" / "Inheriting from show") which helps, but only when the collapsible is open | Low      | Good that the info exists, but it is hidden behind a collapsible.                                                                                                                                                                                                                                               |

---

## Pass 5: State Coverage

**Question:** Does the page handle empty, loading, error, and edge-case states gracefully?

| #    | Finding                                                                                                                           | Severity | Notes                                                                                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | No show selected: shows a centered icon + "Select a show to manage results" message                                               | OK       | Clear empty state with guidance.                                                                                                                                                                                                   |
| 5.2  | Loading state: Skeleton placeholders for both cards                                                                               | OK       | Good. Prevents layout shift.                                                                                                                                                                                                       |
| 5.3  | Show with zero trials: TrialOverrides returns null, ClassOverrides returns null                                                   | OK       | Graceful -- the sections simply do not render. No confusing empty tables.                                                                                                                                                          |
| 5.4  | Error state for mutations: each mutation has `onError` with toast.error                                                           | OK       | Uses plain language ("Failed to save class override"). Matches INTENT.md.                                                                                                                                                          |
| 5.5  | Error state for queries: no `isError` handling for `useShowSettings`, `useTrialOverrides`, or `useClassOverrides`                 | High     | If any of these queries fail, the page stays in loading state forever (skeleton shown while `!settings`). The secretary sees endless loading with no error message and no way to retry. On show day, this is a stressful dead end. |
| 5.6  | Mutation pending states disable the relevant buttons/selects                                                                      | OK       | Prevents double-submission. Good.                                                                                                                                                                                                  |
| 5.7  | After bulk operations succeed, selection is cleared automatically                                                                 | OK       | Good -- prevents the secretary from accidentally re-applying.                                                                                                                                                                      |
| 5.8  | `releaseResults` in BulkOperationsBar does not show a toast on success from the bar itself -- it relies on the hook's `onSuccess` | OK       | The hook (`useReleaseResults.ts`) calls `notifications.success(...)` in its own `onSuccess`. No double-toast.                                                                                                                      |
| 5.9  | BulkOperationsBar clears selection on success but does not reset the Select dropdown value                                        | Low      | After applying a preset via the bulk bar, the Select still shows the last-chosen preset label. Since the bar disappears (selection cleared, size becomes 0, bar returns null), this is a non-issue in practice.                    |
| 5.10 | No optimistic updates -- all mutations wait for server response                                                                   | Low      | Secretary sees a brief delay before the UI updates after each action. For the "that was easy" intent, optimistic updates would feel snappier, but the current approach is safe and correct.                                        |

---

## Pass 6: Flow Integrity

**Question:** Does the full workflow from opening the page to releasing results flow smoothly?

| #   | Finding                                                                                                                    | Severity | Notes                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Happy path: Open page > click a preset > done. One click for the most common operation.                                    | OK       | Nails the "that was easy" intent for the simple case.                                                                                                                                                                                                                                           |
| 6.2 | Override path: Open page > expand trial collapsible > select per-class preset. Requires discovering the collapsible first. | Medium   | See finding 3.4 -- the collapsible affordance is not obvious. The secretary may not realize they can drill into individual classes.                                                                                                                                                             |
| 6.3 | Bulk release path: Select classes > click Release Results. Two steps, reasonable.                                          | OK       | Straightforward once the secretary knows classes need to be selected first.                                                                                                                                                                                                                     |
| 6.4 | No undo for any operation                                                                                                  | Medium   | Presets apply immediately and there is no undo. If a secretary accidentally clicks "Open" (all results visible immediately) when they meant "Review," the results are instantly public. The only recovery is to click the correct preset, but any exhibitors who refreshed already saw results. |
| 6.5 | Switching shows (via external show selector) clears bulk selection                                                         | OK       | Good -- prevents stale selections from being applied to the wrong show.                                                                                                                                                                                                                         |
| 6.6 | The page has `pb-24` to accommodate the sticky BulkOperationsBar                                                           | OK       | Prevents content from being hidden behind the bar.                                                                                                                                                                                                                                              |
| 6.7 | BulkOperationsBar horizontal layout may overflow on narrow screens                                                         | Medium   | The bar contains: count label + Select All + Clear (left) and preset dropdown + Enable Check-in + Disable Check-in + Release Results (right). On mobile or narrow viewports, 7 elements in a flex row will likely overflow without wrapping, causing horizontal scroll or clipped buttons.      |
| 6.8 | No keyboard shortcuts for common operations                                                                                | Low      | Not critical, but Ctrl+A for select-all or Escape to clear selection would match the "easy" intent for keyboard users.                                                                                                                                                                          |

---

## Summary

### Severity Counts

| Severity | Count |
| -------- | ----- |
| High     | 2     |
| Medium   | 7     |
| Low      | 7     |
| OK       | 21    |

### High-Severity Findings

1. **4.4 -- No effective-settings summary view.** After configuring overrides at multiple levels, the secretary cannot see the net result per class in a single view. They must mentally compute the cascade. This directly undermines the "That was easy" target feeling. **Recommendation:** Add a "Current Settings" summary table or badge per class row showing the effective (resolved) visibility preset and check-in status.

2. **5.5 -- No query error handling.** If `useShowSettings`, `useTrialOverrides`, or `useClassOverrides` fail, the page is stuck on skeleton loading forever with no error message or retry. On show day with flaky connectivity, this is a dead end. **Recommendation:** Check `isError` on all three queries and render an error state with a retry button and plain-language message (e.g., "Could not load settings. Tap to try again.").

### Medium-Severity Findings

1. **1.5** -- "Inheriting from" is software jargon. Use "Using show default" / "Using trial default."
2. **2.3** -- Visibility and check-in overrides are separate accordion sections for the same trial/class. Consolidating per-trial settings would reduce navigation.
3. **3.3** -- Reset icon buttons rely on hover tooltip. Not accessible on touch devices.
4. **3.4** -- Collapsible trial sections have no expand/collapse chevron indicator. Secretary may not discover class-level controls.
5. **4.1** -- Six control surfaces (2 concerns x 3 levels) creates high surface area. Presets help but overrides can still overwhelm.
6. **6.2** -- Discoverability of class overrides depends on noticing the collapsible trigger (see 3.4).
7. **6.4** -- No undo for visibility changes. Accidental "Open" preset exposes results immediately with no recovery beyond re-applying a different preset.
8. **6.7** -- BulkOperationsBar does not wrap on narrow viewports. Seven inline elements will overflow.

### What Works Well

- Preset cards are a strong pattern: one click to set show-wide visibility. This is the "that was easy" moment.
- Progressive disclosure via collapsibles and the Advanced accordion keeps the default view clean.
- Skeleton loading states prevent layout shift.
- Mutation error messages use plain language.
- Bulk selection clears automatically after operations succeed, preventing accidental re-application.
- The three-level cascade (show > trial > class) correctly models how dog shows are structured.
- The BulkOperationsBar only appears when relevant (classes selected), keeping the UI clean otherwise.
