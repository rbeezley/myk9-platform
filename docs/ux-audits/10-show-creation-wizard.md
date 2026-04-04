# UX Audit: Show Creation Wizard

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of ShowCreationWizardPage.tsx and wizard utilities
**Role context:** Secretary — "That was easy"

---

## Pass 1: Mental Model Alignment

Does the wizard match how a secretary actually thinks about setting up a show?

| #   | Finding                                                                                   | Severity | Notes                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Wizard steps follow a logical secretary mental model: Details > Trials > Classes > Review | OK       | The 4-step progression mirrors how a secretary actually plans: decide the show basics, then schedule trials, then pick classes, then review.                                                                                                                                      |
| 1.2 | No "Clone from Previous Show" feature                                                     | High     | INTENT.md explicitly says "Smart defaults, clone from previous shows, minimal required fields." A secretary running their 4th show this year should be able to pick a past show and start with all its settings pre-filled. This is the single largest gap vs. the stated intent. |
| 1.3 | Organization defaults to "AKC"                                                            | OK       | Good smart default in `wizardStore.ts` line 104. Most users are AKC clubs.                                                                                                                                                                                                        |
| 1.4 | Trial type auto-derives from organization                                                 | OK       | `DEFAULT_TRIAL_TYPE` map in wizardStore.ts (lines 6-10) sets sensible defaults like AKC -> "Scent Work".                                                                                                                                                                          |
| 1.5 | No concept of "show series" or "cluster"                                                  | Low      | Many clubs run multi-day clusters where 3-4 shows share venue/officials but are distinct events. Not blocking, but cloning would partially solve this.                                                                                                                            |

---

## Pass 2: Information Architecture

Are fields grouped logically? Is anything in the wrong step?

| #   | Finding                                                                                           | Severity | Notes                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 | Step 0 (Show Details) has 4 visual sections: Basic Info, Club, Officials, Judges                  | OK       | Logical grouping with clear card-based separation.                                                                                                                                                                                                                                                                                                                             |
| 2.2 | Judges are assigned at show level (Step 0) then mapped to classes (Step 2) — this is correct flow | OK       | Matches the real-world process: you know your judges before you assign them to classes.                                                                                                                                                                                                                                                                                        |
| 2.3 | Entry period dates are in Basic Info section alongside show dates                                 | OK       | Makes sense — secretary fills all dates together.                                                                                                                                                                                                                                                                                                                              |
| 2.4 | Event Number validation inconsistency                                                             | Medium   | `showCreationWizardValidation.ts` line 65 requires event number (`if (!trial.eventNumber?.trim())`), but `TrialConfigurationStep.tsx` line 90 comments "Event number is optional — assigned by the sanctioning org, may not be known yet" and the tooltip says "Can be added later." The validation blocks the user from proceeding without it, contradicting the UI guidance. |
| 2.5 | Fee fields lack smart defaults                                                                    | Medium   | `preEntryFee` and `dayOfShowFee` both default to 0. A secretary who always charges $30/$35 has to type these every time. Should default to common values (e.g., $30/$35) or remember last-used values.                                                                                                                                                                         |
| 2.6 | Starting Armband Number defaults to 100                                                           | OK       | Sensible default. Tooltip explains the field well.                                                                                                                                                                                                                                                                                                                             |

---

## Pass 3: Affordances and Interaction

Are controls discoverable and efficient?

| #    | Finding                                                                                  | Severity | Notes                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | SearchablePopover for clubs, officials, and judges                                       | OK       | Good pattern — type-to-search with inline create. Secretary does not need to leave the wizard.                                                                                                                                                                                                                                   |
| 3.2  | Auto-select club when user has exactly one                                               | OK       | `ShowDetailsStep.tsx` lines 91-94. Eliminates a tap for single-club secretaries.                                                                                                                                                                                                                                                 |
| 3.3  | Trial date defaults are smart — 2 trials per day, starting at 8 AM                       | OK       | `handleAddTrial` in TrialConfigurationStep.tsx lines 112-138. Auto-names trials "Saturday Trial 1", "Saturday Trial 2", etc. Excellent.                                                                                                                                                                                          |
| 3.4  | Single-template auto-selection on Class step                                             | OK       | `ClassSelectionStep.tsx` lines 139-155. When only one template matches the org, it auto-selects. Removes a decision for the common case.                                                                                                                                                                                         |
| 3.5  | Single-judge auto-assignment to all classes                                              | OK       | `ClassSelectionStep.tsx` lines 189-201. When only one judge is on the show, all classes auto-assign.                                                                                                                                                                                                                             |
| 3.6  | GripVertical icon on trials suggests drag-to-reorder but there is no drag implementation | Low      | `TrialConfigurationStep.tsx` line 205 renders `<GripVertical>` but no drag-and-drop library is wired up. The store has `reorderTrials` but nothing calls it from the UI. Misleading affordance.                                                                                                                                  |
| 3.7  | "Next" button glow pulse when step is valid                                              | Low      | `WizardNavigation.tsx` lines 76-78 adds `animate-pulse` glow. Per INTENT.md guardrail "No surprise animations — motion is purposeful." The pulse is arguably purposeful (signals readiness), but the `animate-pulse` is decorative and could be distracting for some users. A static glow or subtle color shift would be calmer. |
| 3.8  | Hover-triggered card animations (translate-y, gradient overlay)                          | Low      | Multiple cards use `hover:-translate-y-0.5` and opacity transitions. INTENT says "no animations for the sake of animations." The lift-on-hover effect is decorative — a secretary filling out a form does not benefit from cards floating upward.                                                                                |
| 3.9  | Focus management on step change                                                          | OK       | `ShowCreationWizardPage.tsx` lines 119-133. Focuses first input with 350ms delay for transition completion. Good accessibility.                                                                                                                                                                                                  |
| 3.10 | Keyboard navigation: Escape prompts save                                                 | OK       | Lines 102-117. Respects overlay layering (date pickers, dialogs).                                                                                                                                                                                                                                                                |

---

## Pass 4: Cognitive Load — Smart Defaults, Cloning, Required Fields

This is the targeted pass for the Secretary's "That was easy" intent.

### Required Fields Per Step

| Step             | Required Fields                                                                                                       | Count                  | Assessment                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Show Details | Show Name, Organization, Start Date, End Date, Location, Club, Chairman, Secretary, Entry Open Date, Entry Close Date | 10                     | **High.** 10 required fields in one step is significant. Organization defaults to AKC, club auto-selects if only one, but the rest must be filled manually every time.     |
| 1 — Trials       | Trial Name, Trial Date/Time (per trial); at least 1 trial                                                             | 2 per trial + 1 global | **Acceptable.** Smart defaults (auto-naming, auto-dating) reduce actual typing to near-zero for the common case. Event Number validation conflict inflates this (see 2.4). |
| 2 — Classes      | At least 1 class per trial                                                                                            | 0 typed fields         | **Good.** Template-based selection with checkboxes. No manual typing needed.                                                                                               |
| 3 — Review       | None (read-only)                                                                                                      | 0                      | OK                                                                                                                                                                         |

### Smart Defaults Scorecard

| Feature                                  | Present? | Quality                                                                                                                             |
| ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Organization default (AKC)               | Yes      | Good — most common org                                                                                                              |
| Trial type from org                      | Yes      | Good — maps org to discipline                                                                                                       |
| Trial date from show dates               | Yes      | Excellent — 2-per-day with 8 AM start                                                                                               |
| Trial name auto-generated                | Yes      | Excellent — "Saturday Trial 1"                                                                                                      |
| Club auto-select (single club)           | Yes      | Good                                                                                                                                |
| Fee defaults                             | Partial  | Pre-entry and day-of default to $0, which is never correct. Should be $30/$35 or last-used.                                         |
| Armband number default                   | Yes      | Good — 100                                                                                                                          |
| Template auto-select (single)            | Yes      | Good                                                                                                                                |
| Judge auto-assign (single)               | Yes      | Good                                                                                                                                |
| Secretary auto-populated to current user | **No**   | **Missing.** The logged-in user is almost always the secretary. Should auto-fill.                                                   |
| Entry dates from show dates              | **No**   | **Missing.** Entry open could default to "today" or "4 weeks before show." Entry close could default to "3 days before show start." |
| Location from club address               | **No**   | **Missing.** When a club is selected, the location field stays empty. Many shows are at the club's address.                         |

### Clone from Previous Show

| Feature                     | Present? |
| --------------------------- | -------- |
| Clone/duplicate show button | **No**   |
| "Use last show as template" | **No**   |
| Import from previous show   | **No**   |

**This is the highest-priority gap.** INTENT.md says "clone from previous shows" in the secretary's "Setting up a show" row. The wizard store has `loadDraft` which could support this, but no UI path exists for a secretary to select a previous show as a starting point.

### Cognitive Load Summary

| #   | Finding                                                      | Severity | Notes                                                                                                                          |
| --- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 4.1 | No clone-from-previous-show capability                       | High     | Most critical gap vs. INTENT. A secretary running monthly shows re-enters the same data every time.                            |
| 4.2 | 10 required fields on Step 0 with no auto-fill for 4 of them | High     | Secretary, entry open date, entry close date, and location could all be auto-derived or remembered from last show.             |
| 4.3 | Fee defaults of $0 force manual entry every time             | Medium   | Should default to organization-standard fees or last-used values.                                                              |
| 4.4 | Secretary field not auto-populated with current user         | Medium   | The person creating the show is almost always the secretary. Auto-fill with option to change.                                  |
| 4.5 | Location not populated from club address                     | Low      | Quick win: when club is selected, pre-fill location with club address. Secretary can edit if the show is at a different venue. |
| 4.6 | Wizard is persisted via Zustand persist (IndexedDB)          | OK       | `wizardStore.ts` lines 244-268. Draft survives navigation and browser close. Good resilience.                                  |

---

## Pass 5: State Coverage

How well does the wizard handle edge cases, errors, and intermediate states?

| #    | Finding                                                                               | Severity | Notes                                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | Unsaved changes dialog on close/Escape                                                | OK       | `AlertDialog` with "Keep Editing" / "Leave Wizard" options. Good.                                                                                                                                                                                                                                       |
| 5.2  | Validation banner is deferred until user clicks Next                                  | OK       | `hasAttemptedNext` flag prevents premature validation noise. Matches "calm" philosophy.                                                                                                                                                                                                                 |
| 5.3  | Validation banner is collapsible                                                      | OK       | Secretary can see the list, acknowledge it, then collapse it while fixing fields.                                                                                                                                                                                                                       |
| 5.4  | Double-submit prevention                                                              | OK       | `isSavingRef` in `useShowCreationWizardActions.ts` line 236.                                                                                                                                                                                                                                            |
| 5.5  | Empty trial state has clear CTA                                                       | OK       | Beautiful empty state with "Schedule Your Trials" heading and "Add First Trial" button.                                                                                                                                                                                                                 |
| 5.6  | Empty classes state for no-trials                                                     | OK       | Redirects user back to Trials step with "No Trials Configured" message.                                                                                                                                                                                                                                 |
| 5.7  | No loading/skeleton state for people or clubs                                         | Medium   | If `loadPeople()` or `loadClubs()` is slow, the SearchablePopovers show empty results with no indication data is loading. Secretary might think there are no people in the system.                                                                                                                      |
| 5.8  | Officials fetch failure silently swallowed                                            | Low      | `ShowCreationWizardPage.tsx` line 265: `.catch(() => {})`. In edit mode, if officials fail to load, the secretary sees empty officials with no indication something went wrong.                                                                                                                         |
| 5.9  | Sync failure after creation is handled gracefully                                     | OK       | Lines 318-325 in actions hook. Logs warning, relies on seeded React Query cache and next sync cycle.                                                                                                                                                                                                    |
| 5.10 | Review step shows "Show Configuration Complete" even when there are validation errors | Medium   | `ReviewStep.tsx` line 409 always renders the green "Show Configuration Complete" banner. It should be conditionally hidden when `errors.length > 0`. Currently, both the red error card and green success card can appear simultaneously.                                                               |
| 5.11 | Three save options on Review may overwhelm                                            | Low      | "Save as Draft", "Create Show (Unpublished)", "Create & Publish Show" — three options with subtle differences. The helper text below is good, but three buttons in a row is a lot of choices for the final step. Consider making "Create Show" primary and "Save Draft" / "Create & Publish" secondary. |

---

## Pass 6: Flow Integrity

Does the wizard guide the user smoothly from start to finish?

| #    | Finding                                                                 | Severity | Notes                                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1  | Step navigation restricts forward jumps to completed+1                  | OK       | `goToStep` in wizardStore.ts lines 141-148. Prevents skipping steps.                                                                                                                                                                                                                     |
| 6.2  | Back navigation is unrestricted                                         | OK       | Can always go back.                                                                                                                                                                                                                                                                      |
| 6.3  | Review step has "Edit" buttons that jump to specific steps              | OK       | `setCurrentStep(0)`, `setCurrentStep(1)`, `setCurrentStep(2)` — quick correction without re-traversing.                                                                                                                                                                                  |
| 6.4  | Save Draft available on every step (via navigation bar)                 | OK       | `onSaveDraft={isDirty ? handleSaveProgress : undefined}` — only shown when there are changes.                                                                                                                                                                                            |
| 6.5  | Navigation hidden on Review step, replaced by in-step actions           | OK       | Lines 536-548 of the page component. Review step owns its own action buttons.                                                                                                                                                                                                            |
| 6.6  | Edit mode supports three sub-modes (add-trials, add-classes, edit-show) | OK       | URL params drive which step the wizard opens to and which data is pre-loaded.                                                                                                                                                                                                            |
| 6.7  | No breadcrumb within wizard steps connects to the progress indicator    | Low      | The sidebar progress indicator is the only orientation. On narrow viewports (mobile), the sidebar collapses to stack above content, making it less visible. The "Step X of Y" text in the navigation bar helps, but it is at the very bottom.                                            |
| 6.8  | Pre-selected club from navigation (`?clubId=`)                          | OK       | Lines 88-94. When navigating from a club page, the club is auto-selected. Good contextual awareness.                                                                                                                                                                                     |
| 6.9  | `resetWizard` on fresh create prevents stale drafts                     | OK       | Lines 79-85. Ensures a new wizard session starts clean.                                                                                                                                                                                                                                  |
| 6.10 | No confirmation before "Create & Publish"                               | Medium   | Publishing makes the show visible for entries immediately. INTENT says avoid confirmation dialogs for routine actions, but publishing is not routine — it has real consequences (exhibitors can enter). A brief confirmation or at least a distinct visual treatment would be warranted. |

---

## Priority Summary

### High Severity

| #   | Finding                                          | Recommendation                                                                                                                        |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2 | No clone-from-previous-show                      | Add "Start from existing show" option at wizard entry. Load all data from a selected past show into the wizard store via `loadDraft`. |
| 4.2 | 10 required fields on Step 0 with weak auto-fill | Auto-populate secretary (current user), entry dates (derived from show dates), and location (from club address).                      |

### Medium Severity

| #    | Finding                                            | Recommendation                                                                                                                   |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2.4  | Event Number validation contradicts UI guidance    | Remove event number from required validation in `showCreationWizardValidation.ts` line 65. Keep it optional as the tooltip says. |
| 4.3  | Fee defaults of $0                                 | Default to $30/$35 or last-used values from the secretary's most recent show.                                                    |
| 4.4  | Secretary not auto-populated                       | On wizard init (non-edit mode), auto-fill `show.officials.secretary` with the current user's person ID.                          |
| 5.7  | No loading state for people/clubs in popovers      | Add a loading indicator to SearchablePopover when data is being fetched.                                                         |
| 5.10 | Green "Complete" banner shown alongside red errors | Conditionally render the success banner only when `errors.length === 0`.                                                         |
| 6.10 | No confirmation before publish                     | Add a brief confirmation or visual distinction for the "Create & Publish" action to prevent accidental public shows.             |

### Low Severity

| #    | Finding                                       | Recommendation                                                                                                     |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 3.6  | GripVertical icon with no drag implementation | Either implement drag-to-reorder or remove the GripVertical icon to avoid a misleading affordance.                 |
| 3.7  | Pulsing glow on Next button                   | Replace `animate-pulse` with a static visual indicator (e.g., solid glow or color change).                         |
| 3.8  | Decorative hover animations on form cards     | Remove `hover:-translate-y-0.5` and gradient overlay transitions from form sections.                               |
| 4.5  | Location not populated from club              | When club is selected and location is empty, pre-fill with club address.                                           |
| 5.8  | Officials fetch failure silently swallowed    | Show a subtle "Could not load existing officials" note in edit mode if the fetch fails.                            |
| 5.11 | Three final action buttons                    | Consider a primary/secondary hierarchy: "Create Show" as primary, "Save Draft" and "Publish" as secondary options. |
| 6.7  | Progress indicator less visible on mobile     | Add a compact step indicator near the top of the content area on mobile viewports.                                 |

---

## INTENT Alignment Score

| INTENT Moment          | Target Feeling                           | Current Alignment                                                                                                                                                                   | Gap                                                                                  |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Setting up a show      | "The software already knows what I need" | **Partial.** Good smart defaults for trials, trial types, single-template/judge auto-select. But no clone feature, no secretary auto-fill, no fee memory, no entry date derivation. | Clone from previous show, auto-populate secretary, derive entry dates, remember fees |
| Night before the trial | N/A for this page                        | —                                                                                                                                                                                   | —                                                                                    |

**Overall:** The wizard has a solid structural foundation with good step decomposition, smart trial defaults, and template-based class selection. The biggest miss is the absence of show cloning, which INTENT.md explicitly calls out. The second-biggest miss is the number of fields in Step 0 that could be auto-derived but are not. Addressing these two gaps would move the wizard much closer to "That was easy."
