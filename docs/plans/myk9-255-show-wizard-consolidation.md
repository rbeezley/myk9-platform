# MYK9-255 Show Wizard Consolidation Plan

## Decisions

1. Move new-club creation to the complete `/clubs` surface and return to the preserved wizard draft with the new club selected.
2. Create shows as drafts from the wizard and publish only from the show status control.
3. Keep the current Show Details / Trials / Classes / Review split.

## Duplication Check

The inline club creator duplicates `/clubs`, and publish-from-wizard duplicates `ShowStatusPill`. Draft persistence now removes the original justification for both. This change deletes the overlaps and completes the destination flows instead of adding another surface.

## Implementation

### Phase 1: Club creation handoff

- Align the `/clubs` creation affordance with the existing RLS policy for secretary, club-admin, and site-admin roles.
- Support a safe internal `returnTo` link that opens the complete club panel.
- Return to the wizard with the created club selected.
- Replace the wizard's two-field inline creator with the deep link.

### Phase 2: Single create and publish flow

- Reduce Review to one create action.
- Remove wizard publish-gate wiring and obsolete labels.
- Route the success overlay to the created show's management surface for publishing.
- Pass `show.clubId` to the show status control in both management layouts.

### Phase 3: Testing and verification

- Add red-to-green page tests for club creation authorization, deep-link opening, and safe return.
- Add red-to-green component tests for the single Review action.
- Add red-to-green shell tests for `clubId` publish wiring.
- Run focused Vitest files, app typecheck, lint for touched files if supported, and the full app unit suite once.
- Review the final diff with the repository code-review workflow.

## Non-goals

- Rebalancing wizard steps.
- Changing club RLS; migration 160 already authorizes the intended roles.
- Changing payment-account eligibility rules.
- Redesigning the club-management panel.
