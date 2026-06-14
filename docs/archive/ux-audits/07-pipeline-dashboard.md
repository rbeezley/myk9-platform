# UX Audit: Pipeline Dashboard

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of PipelineDashboard.tsx and pipeline components
**Role context:** Secretary -- "That was easy"

---

## Pass 1: Mental Model Alignment

**Question:** Does the page reflect how a trial secretary thinks about managing a show day?

| #   | Finding                                                                                                   | Severity | Notes                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Page is titled "Mission Control" -- matches the intent of a secretary's command center                    | OK       | Good brand-appropriate name. Reinforces confidence.                                                                                                                                                                           |
| 1.2 | Show > Trial > Class hierarchy matches real-world mental model                                            | OK       | Secretary thinks in terms of "which show, which trial, which classes." The selector cascade is correct.                                                                                                                       |
| 1.3 | 5-column Kanban (Not Started, Setup, In Progress, Review, Closed) maps to actual class lifecycle          | OK       | These are the real stages a class moves through on show day. Good alignment.                                                                                                                                                  |
| 1.4 | "Show Day!" contextual timing label with pulsing green dot communicates urgency appropriately             | OK       | Secretary glances at dashboard and immediately knows if it is show day. Good.                                                                                                                                                 |
| 1.5 | Show-level stats (Trials, Classes, Scored, Complete%, Qualified%) are data-oriented, not problem-oriented | Medium   | INTENT.md says secretary's page "must surface problems, not data." The stats row tells you _how much_ but not _what needs attention_. A secretary on show day wants "3 classes need review" not "67% complete."               |
| 1.6 | Trial-level stats repeat nearly the same metrics as show-level stats with different scope                 | Medium   | When only one trial is selected, the TrialContextRow shows trialCount=1 (always "1 Trial"), which is wasted space. The stats are duplicative -- secretary sees the same pattern twice with slightly different numbers.        |
| 1.7 | The class pipeline is scoped to one trial at a time                                                       | Low      | On multi-trial show days, the secretary must manually switch trials to see the full picture. A cross-trial "all classes" view would better match the mental model of overseeing the entire show day, not one trial at a time. |

---

## Pass 2: Information Architecture

**Question:** Is the most critical information visible first? Can the secretary find what needs attention without hunting?

| #   | Finding                                                                                         | Severity | Notes                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Vertical layout: Header > Show selector/stats > Trial selector/stats > Announcements > Pipeline | Medium   | The Kanban pipeline -- the secretary's primary tool -- is pushed below two stat rows and an announcements card. On a laptop screen, the pipeline may be below the fold. The most actionable content should be highest.     |
| 2.2 | Announcements card appears between context rows and the pipeline                                | Medium   | Announcements are important but not the secretary's primary task on this page. They interrupt the flow from "select trial" to "manage classes." Consider moving below the pipeline or into a collapsible/sidebar position. |
| 2.3 | Empty columns collapse to 100px width, non-empty expand to 220-350px                            | OK       | Smart use of space -- empty "Not Started" column does not dominate the view when classes have moved forward.                                                                                                               |
| 2.4 | No filtering or sorting within columns                                                          | Low      | With many classes (10+), the secretary has no way to filter by judge, element, or search by name within a column. For small shows this is fine; for large shows it could become unwieldy.                                  |
| 2.5 | Show Settings (gear icon) opens a slide-over panel with visibility and check-in settings        | OK       | Settings are appropriately tucked away and not cluttering the main view. Good use of progressive disclosure.                                                                                                               |
| 2.6 | Settings gear icon is 32x32px (`h-8 w-8`) but the inner icon is only 16x16px (`h-4 w-4`)        | Low      | Touch target meets minimum 44px recommendation only by the padding. The visible icon is small and may be hard to notice. INTENT.md says "large touch targets -- minimum 44x44px."                                          |
| 2.7 | `trialId` is passed as empty string to `ShowSettingsPanel` classes prop (`trialId: ''`)         | Low      | Comment says "acceptable for now" but this means class overrides in settings cannot be correctly scoped to a trial. Technical debt that could cause settings to apply incorrectly.                                         |

---

## Pass 3: Affordance Clarity

**Question:** Can the secretary tell what is draggable, clickable, and actionable without guessing?

| #   | Finding                                                                                                         | Severity | Notes                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Cards are draggable between columns via `@dnd-kit`, with a GripVertical drag handle                             | OK       | Good: drag handle is explicit, not requiring discovery. The grab cursor on hover reinforces the affordance.                                                                                                                                             |
| 3.2 | Drag handle is 14x14px (`h-3.5 w-3.5`) with very low contrast (`text-muted-foreground/40`)                      | Medium   | At 40% opacity of an already muted color, the drag handle is nearly invisible. A secretary under show-day stress may not notice it. Combined with its small size, this violates the "large touch targets" and "high contrast" guardrails.               |
| 3.3 | Cards are clickable (navigate to class detail) but have no visual "click me" affordance beyond `cursor-pointer` | Low      | The hover shadow effect (`hover:shadow-md hover:-translate-y-0.5`) provides feedback but is hover-only. On tablet, there is no pre-click signal that the card is tappable. This violates "no hover-only interactions."                                  |
| 3.4 | Print dropdown is a small icon button (`Printer` icon, no label)                                                | Low      | Icon-only with no tooltip or label. Secretaries who are not icon-literate may not recognize the printer icon. Adding an aria-label (present) helps screen readers but not sighted users unfamiliar with the icon.                                       |
| 3.5 | "Review" and "Publish" buttons on cards are clear, contextual, and appropriately sized (`px-4 py-2.5`)          | OK       | Good affordance for the primary show-day actions. The two-step flow (Review then Publish) is a safe pattern.                                                                                                                                            |
| 3.6 | "Reopen" button on closed cards is an outline variant -- visually lighter than primary actions                  | OK       | Appropriate de-emphasis. Reopening is a corrective action, not the primary path. Good visual hierarchy.                                                                                                                                                 |
| 3.7 | DragOverlay has `dropAnimation={null}` -- no visual feedback on drop                                            | Low      | When the user drops a card, there is no snap-into-place animation or confirmation beyond the success toast. The card just appears in the new column. A brief animation would reinforce the action succeeded.                                            |
| 3.8 | The `DragOverlay` renders nothing (empty component) -- dragged card has no ghost/preview                        | Medium   | When dragging, the original card gets `scale-105 opacity-90` but there is no separate drag preview following the cursor. The user sees the card slightly enlarged in place but no ghost under their finger/cursor, which can make the drag feel broken. |

---

## Pass 4: Cognitive Load

**Question:** How much does the secretary need to hold in working memory? Is the dashboard calm or overwhelming?

| #   | Finding                                                                                                         | Severity | Notes                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Two stat rows (show + trial) display 10 stat chips total, with overlapping metrics                              | Medium   | 10 numbers on screen before the secretary even reaches the pipeline. INTENT.md says "batch non-urgent updates, surface only what needs immediate attention." Most of these stats are informational, not actionable. |
| 4.2 | Stat chips use 5 different icon colors (primary, blue, green, purple, emerald) with matching tinted backgrounds | Low      | The color variety is decorative, not meaningful. The colors do not encode information (blue "Classes" vs. green "Scored" is arbitrary). This adds visual noise without aiding comprehension.                        |
| 4.3 | "Qualified %" stat shows a dash when unavailable (`percentQualified: null`)                                     | Low      | A permanent dash in the UI is a minor cognitive snag -- "Is this broken? Is data missing?" Either hide the chip when null or explain why it is unavailable.                                                         |
| 4.4 | Each class card shows: name, status badge, judge, progress bar, scored count, and 1-2 action buttons            | OK       | Appropriate density per card. The information is well-layered with the most important (name + status) at top.                                                                                                       |
| 4.5 | The "Setup / Briefing / Break" column label is long and may wrap                                                | Low      | This label is accurate but wordy. Secretaries know what "Setup" means in context. The full label adds reading time on every glance.                                                                                 |
| 4.6 | Class cards in "results" column have two sub-states (Done vs. Reviewed) distinguished by accent color and label | OK       | Good progressive disclosure -- the card visually evolves as the secretary advances it through the review workflow.                                                                                                  |

---

## Pass 5: State Coverage

**Question:** What happens in empty, loading, error, and edge-case states?

| #   | Finding                                                                                              | Severity | Notes                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | No shows: centered empty state with "Create Show" CTA                                                | OK       | Clear, actionable, not alarming. Good.                                                                                                                                                                                                                                                                      |
| 5.2 | Show selected but no trials: centered empty state with "Manage Show" CTA                             | OK       | Good. Directs the secretary to the right place.                                                                                                                                                                                                                                                             |
| 5.3 | Trial selected but no classes: pipeline renders 5 empty columns with "0" badges                      | Medium   | No guidance text. The secretary sees 5 skinny grey columns with zeroes and no explanation. There should be a helpful message like "No classes in this trial yet" with a CTA to add classes.                                                                                                                 |
| 5.4 | Initial loading state: `DelightfulLoading` with "Loading mission control..."                         | OK       | Calm loading state. Good.                                                                                                                                                                                                                                                                                   |
| 5.5 | Classes loading within a trial: inline "Loading classes..." text after the "Class Pipeline" heading  | Low      | `classesLoading` is hardcoded to `false` in `useMissionControlData` (comment: "Local data is always available synchronously"). The loading indicator will never appear. Either remove the dead code or handle the case where trialStore is not yet hydrated.                                                |
| 5.6 | Drag-and-drop error state: toast notification "Failed to move [class name]"                          | OK       | Good error recovery. The card returns to its original position on mutation failure (React Query rollback).                                                                                                                                                                                                  |
| 5.7 | `is_scoring_finalized` and `is_results_reviewed` are hardcoded to `false` in `useMissionControlData` | High     | Line 94-95: both flags default to `false` because "Not tracked on TrialClass." This means the Review/Publish workflow on cards will never show the "Reviewed" state, and classes will never appear in the "closed" column via the local data path. The entire results workflow is broken at the data layer. |
| 5.8 | No error boundary around the pipeline                                                                | Low      | If a rendering error occurs in the Kanban (e.g., bad data shape), the entire dashboard crashes. An error boundary around the DndContext region would prevent a single bad card from taking down the whole page.                                                                                             |
| 5.9 | Announcement store `unreadCount` may show stale badge count if the subscription disconnects          | Low      | Minor: the unread badge persists from the store snapshot. Not harmful but could be confusing if announcements were read on another device.                                                                                                                                                                  |

---

## Pass 6: Flow Integrity

**Question:** Can the secretary complete their show-day workflow end-to-end without friction?

| #   | Finding                                                                                                              | Severity | Notes                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Primary flow: Open dashboard > see pipeline > drag class to next stage or click card for details                     | OK       | Core navigation is sound. Two paths to manage classes (drag for quick moves, click for detail) is a good dual-affordance.                                                                                                                                 |
| 6.2 | Drag to "closed" column sets `is_scoring_finalized: true` but does not enforce that results have been reviewed first | Medium   | A secretary can drag a class directly from "In Progress" to "Closed," skipping the review step entirely. There is no guard rail. The INTENT anti-pattern says avoid "multi-step wizards" but there should be a soft warning when skipping review.         |
| 6.3 | Review > Publish is a two-button workflow on the card, but there is no undo for Publish                              | Medium   | "Reopen" exists on closed cards, which is good. However, the Publish action has no confirmation. INTENT.md says avoid "confirmation dialogs for routine actions" -- but publishing results is not routine; it is a consequential, hard-to-reverse action. |
| 6.4 | Card click navigates to `/shows/{showId}/trials/{trialId}/classes/{classId}/secretary`                               | OK       | Deep-link to the class secretary view. Good for drilling into details.                                                                                                                                                                                    |
| 6.5 | No keyboard shortcut or bulk action for reviewing/publishing multiple classes                                        | Low      | On a busy show day with 15+ classes finishing around the same time, the secretary must click Review then Publish on each card individually. A "Review All" or "Publish All Reviewed" action would reduce taps.                                            |
| 6.6 | Print menu offers Run Order, Blank Score Sheet, and Results Report per class                                         | OK       | Covers the three documents a secretary needs. Results Report is correctly disabled until the class reaches results/closed stage.                                                                                                                          |
| 6.7 | Show selection persists to localStorage for cross-page continuity                                                    | OK       | Good: the secretary navigates to Entry Management and the same show is pre-selected. Reduces context-switching friction.                                                                                                                                  |
| 6.8 | No real-time update indicator beyond the "Live" badge                                                                | Low      | The pipeline uses local-first store data, which updates via sync. But there is no "last synced" timestamp or visual confirmation that data is current. On show day, the secretary needs confidence that what they see is live.                            |

---

## Summary

### Critical Issues

| #   | Finding                                                               | Severity | Recommendation                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.7 | `is_scoring_finalized` and `is_results_reviewed` hardcoded to `false` | High     | The results pipeline (Review > Publish > Closed) is non-functional via local data. Either source these fields from the database query or propagate them through the trialStore sync. Without this fix, the Kanban's right half is decorative. |

### High-Priority Improvements

| #   | Finding                                                | Severity | Recommendation                                                                                                                                                                                      |
| --- | ------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.5 | Stats are data-oriented, not problem-oriented          | Medium   | Replace or augment stat chips with problem-surfacing indicators: "3 classes need review," "1 class has no judge assigned," "Entry close in 2 days." This aligns with "surfaces problems, not data." |
| 2.1 | Pipeline is below the fold                             | Medium   | Reorder: Header > Show/Trial selectors (compact single row) > Pipeline > Stats/Announcements below. The Kanban is the workstation; stats are reference.                                             |
| 3.2 | Drag handle nearly invisible                           | Medium   | Increase opacity to at least `text-muted-foreground/60` and consider increasing icon size to `h-4 w-4`.                                                                                             |
| 3.8 | No drag preview/ghost                                  | Medium   | Render a `DragOverlay` child that mirrors the dragged card at reduced opacity so the user sees what they are moving.                                                                                |
| 4.1 | 10 stat chips create cognitive overload                | Medium   | Reduce to 3-4 key metrics per row, or collapse into a single context row with show + trial selectors side by side.                                                                                  |
| 5.3 | Empty pipeline (no classes) has no helpful guidance    | Medium   | Add an empty state inside the pipeline area: "No classes yet. Add classes to this trial to see them here."                                                                                          |
| 6.2 | No guard when skipping review stage via drag           | Medium   | When dragging to "closed" from a non-"results" column, show a brief inline confirmation or auto-set the results-reviewed flag.                                                                      |
| 6.3 | Publish has no confirmation for a consequential action | Medium   | Add a lightweight confirmation (inline "Are you sure?" expansion, not a modal) for Publish, since it makes results visible to exhibitors.                                                           |

### Low-Priority Improvements

| #   | Finding                                           | Recommendation                                                                                      |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1.6 | Trial stats row is duplicative                    | Consider hiding the trial stat row when there is only one trial, or merging both rows into one.     |
| 2.4 | No filtering within columns                       | Add a search/filter for large shows (10+ classes per column).                                       |
| 3.3 | Card tap affordance is hover-only                 | Add a subtle right-chevron or "View" indicator visible without hover, especially on tablet.         |
| 3.4 | Print button is icon-only                         | Add a tooltip or consider a text label on wider screens.                                            |
| 4.3 | Qualified% shows dash when null                   | Hide the chip entirely when `percentQualified` is null.                                             |
| 5.5 | Dead loading code (`classesLoading` always false) | Remove the loading indicator code or implement proper hydration detection.                          |
| 5.8 | No error boundary around pipeline                 | Wrap the DndContext region in a React error boundary.                                               |
| 6.5 | No bulk review/publish                            | Add "Review All" / "Publish All Reviewed" buttons above the results column for show-day efficiency. |
| 6.8 | No "last synced" indicator                        | Add a subtle "Updated X seconds ago" or sync status indicator for show-day confidence.              |
