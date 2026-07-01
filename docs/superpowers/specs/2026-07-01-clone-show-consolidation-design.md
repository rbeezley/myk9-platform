# Clone Show Consolidation Design

Date: 2026-07-01
Status: Draft for user review

## Problem

Clone Show currently has two surfaces:

- The Show Creation Wizard, where `CloneFromShowCombobox` lets a secretary pick a past show and prefill Step 1.
- The older Calendar Page `ShowCloneDialog`, which has its own select-review-complete flow and then navigates to `/shows`.

This duplicates the secretary setup workflow. It also risks different clone behavior between two paths. The product direction is to consolidate, not add parallel surfaces.

## Decision

The Show Creation Wizard is the only Clone Show workflow.

A secretary should pick a previous show, use it to prefill the wizard, then step through the wizard to change or confirm each field before creating the new show. Cloning is a starting point, not a silent create action.

## Scope

In scope:

- Remove the old Calendar Page clone dialog entry point.
- Remove `ShowCloneDialog` and its helper components if no imports remain.
- Keep `CloneFromShowCombobox` in `ShowDetailsStep` as the canonical clone control.
- Verify that cloning prefills expected non-date fields.
- Verify that dates stay blank so the secretary must confirm the new schedule.
- Verify that the wizard can continue after cloning and that the resulting show appears in the normal secretary workflow.
- Update E2E coverage so the clone path is tested beyond button presence.

Out of scope:

- Adding a new clone page, sheet, or modal.
- Creating a separate "clone mode" route unless manual QA shows the existing wizard affordance is too easy to miss.
- Reworking the full show creation wizard.

## User Experience

The secretary starts at `/secretary/create-show/wizard`.

At the top of Step 1, the wizard offers "Select a past show to clone." After selection:

- The wizard fills show name, organization, location, club, fees, armband start, payment method settings, and judges where available.
- Show dates and entry period dates remain blank.
- The selected source show is visibly acknowledged.
- "Start fresh" clears the cloned values and returns to a blank setup.
- The secretary proceeds through the normal wizard steps to review trials, classes, judges, and final details before creating the new show.

This supports the secretary intent: "The software already knows what I need," while keeping the secretary in control.

## Architecture

`CloneFromShowCombobox` remains a small wizard-step component. It reads clone candidates from the existing shows query, filters them to the user's clubs, and writes selected values into `useWizardStore`.

The implementation should not introduce a second clone state machine. Any future shortcut should navigate to the wizard, not open a separate clone UI.

The Calendar Page should keep its browse and new-show actions, but not a Clone Show dialog. If a clone affordance remains on that page, it should link to `/secretary/create-show/wizard` and rely on the wizard clone control.

## Data Rules

Clone should copy:

- Show name
- Organization or registry
- Location
- Club
- Pre-entry and day-of-show fees
- Starting armband number
- Accepted payment methods
- Assigned judges when available

Clone should not copy:

- Show start date
- Show end date
- Entry open date
- Entry close date

Trials and classes need browser verification. If they are not copied today, the implementation plan should either add that behavior in the wizard path or narrow the todo wording so "Clone Show" does not imply full trial/class duplication.

## Error Handling

If no prior shows exist, hide the clone control and let the wizard read as a normal new-show form.

If shows fail to load, the wizard should still allow fresh show creation. Any error should be plain English and should not block manual entry.

If a cloned judge or related person cannot be resolved, keep the flow usable and show a safe fallback label rather than failing the whole clone.

## Testing

Add or update focused coverage:

- Component or store-level test: selecting a source show writes the expected fields and leaves all date fields blank.
- E2E test: secretary opens the wizard, selects a past show, sees fields prefilled, sees date fields blank, and can continue to the next step.
- Cleanup assertion: the old Calendar Page clone dialog is not present, or any remaining clone shortcut routes into the wizard.

Manual QA should confirm a representative cloned show appears in the secretary workflow without creating a duplicate clone surface.
