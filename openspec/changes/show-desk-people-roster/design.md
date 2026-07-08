# Design: Show Desk People Roster

## Context

The Show Desk already has a right-side Tools drawer for show-day helpers. Entry
Management already owns full entry review, payment, scratch, move-up, refund,
and roster workflows. Secretary Messages already owns staff-to-exhibitor
conversation history. The missing workflow is narrower: when a person is at the
desk, staff need to quickly answer "are you entered?", "what is your armband?",
"which dog/class?", and "can I check you in now?" without leaving Show Desk.

Duplication question: this does overlap Entry Management and Messages, but only
as a fast lookup/action gateway. Duplication is justified for display of the
minimum person-at-desk facts and direct current-day check-in; full entry edits
and conversations stay linked to the owning surfaces.

## Approach

Add a `People at show` section to the existing Show Desk Tools drawer. The tool
renders an all-exhibitors accordion roster by default, with local filters for
all exhibitors, needs check-in, and online. Rows summarize exhibitor name,
presence state, dogs/classes count, and an armband/waitlist/due badge. Expanding
a row shows actions plus one row per class entry with armband, dog, class,
ring/time when available, status, and check-in action when eligible.

The tools drawer gains an optional `wide` layout mode. Ordinary tools keep the
current compact width. The People roster requests the wide mode so the class-row
content fits without pushing staff into a separate page.

## Data And State

- Use the existing Entry Management data shape from `useEntryManagementData` /
  `getEntriesForShow` so the roster reads the same secretary entry facts as the
  canonical entries page.
- Derive roster groups client-side from visible show entries. Group by the best
  available person identity, preferring owner person id, then handler person id,
  then registration/handler/name fallback. This avoids adding a new persistent
  roster table.
- Extend the secretary entry read model only as needed for routing: owner and
  handler person ids are already present; auth user ids are needed when a
  `Message` button should create/open an existing message thread.
- Use `useShowPresence` for advisory presence. Staff see the full show presence
  roster under the existing presence visibility rules. Presence is not treated
  as authoritative attendance.
- Keep accordion expanded state local to the People roster. One exhibitor is
  expanded at a time; clicking the expanded row collapses it.

## Actions

- `Check in` and `Check in all eligible` call the existing replicated check-in
  mutation path (`updateReplicatedCheckInStatus` through the existing action
  hook or a small shared wrapper), preserving offline-first show-day behavior.
- Check-in failures keep the affected row in its previous visible state and
  surface plain retry-oriented feedback in the roster instead of implying the
  person is checked in.
- A class entry is eligible when it is active/accepted for the current show-day
  class, not already checked in, and not terminal (scratched, withdrawn, pulled,
  or otherwise inactive). Staff check-in is not gated by exhibitor self-check-in
  settings.
- `Message` calls the existing message store's `getOrCreateThread(showId,
participantAuthUserId)` and navigates to
  `/secretary/messages?showId=<showId>&threadId=<threadId>`. The secretary
  messages page must honor the `threadId` param as selected state.
- `Manage entries` deep-links to the existing Entry Management page with a
  person/exhibitor search param. Entry Management should apply that param to its
  existing search input instead of adding a duplicate person detail page.

## UI Notes

- The roster must be dense and operational, not a landing-page treatment.
- Loading, empty, no-results, and action-error states must stay inside the tool
  and preserve the rest of Show Desk.
- Use existing shadcn primitives and lucide icons where controls need icons.
- Presence dots require accessible labels such as `Online now` and
  `Not currently online`.
- Buttons and row controls must keep 44px touch targets and avoid text clipping
  at tablet/mobile widths. On narrow screens the wide drawer should become
  near/full width.
- The People roster uses plain labels: `All exhibitors`, `Needs check-in`,
  `Online`, `Message`, `Check in all eligible`, `Manage entries`.

## Tests

Focused unit/component tests should cover roster grouping/search/filtering,
check-in eligibility, action success/failure behavior, empty states, routing,
accordion toggling, drawer width mode, and secretary messages `threadId` URL
selection. A narrow visual/manual pass should verify the drawer at desktop,
tablet, and mobile widths.
