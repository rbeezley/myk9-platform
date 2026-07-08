# Show Desk People Roster Design

Date: 2026-07-08

## Problem

Show presence exists, and staff already have messaging and entry-management surfaces, but the Show Desk does not yet have a fast way to answer person-at-the-table questions:

- "What is my armband number?"
- "Did I enter this class?"
- "Which dog is in Ring 1?"
- "Can you check me in?"
- "Can I message this exhibitor?"

The roster should make the show feel alive and staffed without creating another communications hub or another Entry Management page.

## Duplication Check

This does not create a new page. It extends the existing Show Desk Tools sidebar with a narrow show-day lookup/action tool.

It does not duplicate Entry Management because it only supports person lookup, direct check-in for eligible rows, and deep links to existing surfaces. Full entry editing, payment work, scratch, move-up, refund, and bulk administrative workflows remain in Entry Management or the existing Results & Check-In surfaces.

It does not duplicate Message Center because `Message` goes straight to the existing secretary conversation route for the selected exhibitor/show. The bell remains the global inbox and launcher.

## Target User

Fall-launch scope is secretary/staff only. Exhibitor-facing presence remains privacy-filtered and restrained.

## Placement

Add a `People at show` tool to the existing Show Desk Tools drawer on `/shows/:showId/show-desk`.

The normal Tools drawer can keep its current compact width for simple tools. When `People at show` is open, the drawer should use a wider tool mode, about 40-45% of desktop viewport width. On smaller tablet/mobile widths, the drawer should become near-full or full width.

## User Flow

1. Secretary opens Show Desk.
2. Secretary opens Tools.
3. Tool list includes `People at show` with a count summary such as `112 exhibitors · 9 online`.
4. Selecting `People at show` replaces the tool list with the roster view inside the same drawer.
5. Roster defaults to `All exhibitors`.
6. Staff can search by exhibitor name, dog name, or armband.
7. Staff can filter by `All exhibitors`, `Needs check-in`, or `Online`.
8. Each exhibitor row is an accordion row.
9. Clicking a collapsed row expands it.
10. Clicking the same expanded row collapses it.
11. Clicking another row collapses the current row and expands the new row.
12. Search or filter changes close the expanded row unless the selected person remains visible and still selected.

## Roster Rows

Each collapsed exhibitor row shows:

- Presence indicator dot: online when matched in the existing show presence roster, otherwise offline/unknown.
- Exhibitor/person name.
- Dog names summary.
- Class count or primary status chip.
- A useful compact indicator such as `1 due`, armband number, or `WL`.

Presence is advisory and ephemeral. The roster must still work when presence is unavailable.

## Expanded Person Row

The expanded row shows the selected exhibitor's show-day context and actions.

Actions:

- `Message`
- `Check in all eligible`
- `Manage entries`

Class rows show:

- Armband number.
- Dog name.
- Class name.
- Ring/time when available.
- Entry/check-in status or direct `Check in` action.

`Manage entries` deep-links to Entry Management filtered to that exhibitor/person. If Entry Management does not already support a clean person filter, add that filter as part of the implementation rather than making the roster duplicate full entry controls.

## Check-In Eligibility

Direct check-in is available for active accepted entries for today/current show-day classes only.

Eligible rows are:

- Accepted/active for this show.
- Scheduled for the current show-day context.
- Not already checked in.
- Not in terminal states such as withdrawn, scratched, or pulled.

Staff direct check-in does not depend on the exhibitor self-check-in toggle. That toggle controls exhibitor self-service, not staff desk operations.

`Check in all eligible` applies the same single-row check-in mutation to every eligible row for the expanded person.

## Data Sources

Roster data should derive from existing show entries grouped by exhibitor/person:

- Person/exhibitor identity.
- Auth user id when available for presence and message thread matching.
- Dog names.
- Entry/class rows.
- Armband number.
- Class, ring, and time metadata when available.
- Entry status.
- Check-in status.

Presence uses the existing show presence roster from `ShowPresenceProvider`.

Check-in uses the existing replicated check-in update path used by Entry Management.

Messaging uses the existing message store/thread flow and secretary messages route.

## Error And Empty States

Empty roster:

- Show a calm empty state: `No exhibitors found for this show.`

No search results:

- Show `No matching exhibitors` and keep the search/filter controls visible.

Presence unavailable:

- Keep rows visible and show offline/unknown dots.

Check-in failure:

- Revert the optimistic row state.
- Show plain language: `Couldn't check in this entry. Try again.`

Message failure:

- Show plain language: `Couldn't open message. Try again.`

## Implementation Notes

Prefer small, focused pieces:

- `PeopleAtShowTool` for the drawer view.
- A pure grouping helper for roster derivation.
- A pure eligibility helper for check-in actions.
- A small navigation helper for message/manage-entry destinations if needed.

Keep the tool inside the existing Show Desk Tools drawer. Do not add a new route, page, or modal.

## Testing

Unit tests:

- Roster grouping groups entries by exhibitor/person and includes dog, class, and armband data.
- Search matches exhibitor name, dog name, and armband.
- Filters handle `All exhibitors`, `Needs check-in`, and `Online`.
- Eligibility helper excludes already checked-in and terminal-state rows.
- Eligibility helper excludes non-current show-day rows.
- Accordion behavior expands, collapses the same row, and switches rows.
- Single-row check-in calls the existing replicated check-in update with the exact entry id.
- `Check in all eligible` calls the same update for exactly the eligible entry ids.
- `Message` routes to the existing secretary messages/thread flow.
- `Manage entries` routes to Entry Management with the selected exhibitor/person filter.

Focused UI coverage:

- Roster opens from Show Desk Tools.
- Wide tool mode is applied for `People at show`.
- Compact tool mode remains available for ordinary Show Desk tools.

Manual verification:

- On desktop, the People roster is readable in the wider drawer.
- On tablet/mobile widths, the drawer becomes near-full/full width and remains usable.
- Presence dots degrade gracefully when no one is online.
