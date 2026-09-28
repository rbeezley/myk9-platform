# Proposal

## Why

The first supervised show-day walk (MYK9-732) found three conflicting views of the same entry: the exhibitor lost a known class time and score, and the secretary saw payment due after removal. Fixing those inconsistencies supports fall 2026 launch readiness, especially secretary show-day reliability.

## What Changes

- Show the stored class start time, published run position or a clear pending state, and current check-in state in the existing exhibitor show schedule (MYK9-868).
- Show a same-day preliminary score on the existing dog page, linked to its class result and withholding placement until release (MYK9-869).
- Remove soft-deleted entries from the live secretary registration queue and its payment-due work, including after a fresh load (MYK9-870).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `exhibitor-show-day-access`: show-day schedule facts and pending position.
- `exhibitor-dog-management`: same-day result visibility on the dog page.
- `entry-management-cockpit`: soft-deleted entries and empty registrations are excluded from live work.

## Impact

Changes stay in existing myK9Show show schedule, dog profile, entry read/replication, and Entry Management paths. No new page, control surface, or duplicate workflow is needed; a link to another page cannot supply the missing facts at their current decision points. Non-goals: inventing a run position from visual sort order, auto-publishing run order, changing score release rules, payment state, or historical database rows.
