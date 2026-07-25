## Why

The redesigned secretary Entry Management cockpit (Registrations + Exceptions with queue chips) has the right information architecture, but the live UX audit ([docs/entry-management-ux-audit-2026-07-22.md](../../../docs/entry-management-ux-audit-2026-07-22.md)) found that its **action grammar** undermines the "That was easy" secretary intent: the number-one task (accept/reject a registration) hides behind an anonymous "Actions ⋯" overflow, the same review state is labeled three different ways ("Accepted" in the list, "Reviewed" on the focused badge, "Accept entry" in the menu), the change-status menu neither marks the current state nor guards flipping a Completed (scored) entry back to Pending, the mobile layout clips the queue chips and truncates rows to unreadable fragments, and the show-details "Entries" tab duplicates the cockpit as a read-only dead end.

## What Changes

- Promote the registration decision actions (Accept, Reject) out of the "Actions ⋯" overflow into the focused registration's primary-work panel; the overflow keeps rarer verbs (Missing Info, Check In All).
- Define one canonical review-state vocabulary and use it everywhere the state renders (queue rows, focused badge, status menus, bulk toolbar), with the status-change menu marking the entry's current state.
- Guard status regressions on scored entries: reverting a Completed entry requires an explicit confirmation that names the consequence.
- Complete the mobile/narrow pass for the cockpit queue: chips remain reachable (wrap or scroll with affordance) and rows restructure vertically so exhibitor and dog names stay legible.
- Consolidate the show-details "Entries" tab for managers into a summary + link into the cockpit instead of a parallel read-only entry table (per the consolidate-don't-duplicate phase rule).
- Do not add new routes, pages, or another entry surface; all work modifies existing cockpit and show-details components.
- Do not change entry lifecycle semantics, payment logic, or replication paths; this is presentation and interaction grammar only, except the added revert confirmation.

## Capabilities

### New Capabilities

- `registration-decision-actions`: Accept/Reject as first-class, discoverable actions in the focused registration's primary-work panel, consistent with the recommended-action framing.
- `entry-review-vocabulary`: One shared label set for review states across queue, badges, menus, and bulk actions, plus current-state marking and a completed-entry revert guard in the status menu.
- `cockpit-narrow-layout`: Usable queue chips and registration rows at phone/narrow-tablet widths.

### Modified Capabilities

None (no existing spec files cover these surfaces yet).

## Impact

- Affects `EntryFocusedRegistration`, `EnrollmentCard`/entry action menus, `EntryStatusPopover`, `EntryRegistrationQueue` (+ row components), cockpit toolbar/chips, and `ShowDetailTabs`/`EntriesTab` on the show details page; colocated and caller tests for each.
- The bug-fix PR from the same audit (Back-param clearing, copy/grammar, scroll reset, wired Manage Entries button, Density label) lands separately and first; this change builds on it.
- No database, replication, or API changes. The revert guard is a client confirmation, not a server rule (server-side enforcement, if desired, is future work).
- No new routes; deep links and URL params keep their current shapes.
