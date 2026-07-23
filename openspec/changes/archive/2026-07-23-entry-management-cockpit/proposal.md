## Why

Entry Management is the secretary's canonical place for registration review, payment, and entry correction, but its current stack of statistics, presets, filters, table/card modes, breadcrumbs, and competing badges makes routine work difficult to scan. For fall 2026 launch readiness, it needs the same calm queue-and-focus mental model already approved for Show Desk so a secretary can find a registration, understand its next action, and complete work without losing context.

The original request was: “Can we take the lessons we've learned from the redesign of the show desk tab and see how we could apply that to the entry management tab? It is also very busy and overwhelming with no visual hierarchy. Need to simplify and deduplicate it. Need to make it more user-friendly and intuitive and efficient for the show secretary to manage entries. The table also needs to be cleaned up and improved. Feels like there are badges everywhere with no structure.”

## What Changes

- Replace the competing Entry Management table/card presentations with one responsive Show Registration queue and focused-registration pane based on the approved Balanced prototype.
- Make `Needs review` the default queue; retain `Missing information`, `Payment due`, and `All registrations` as compact queue choices with truthful counts.
- Use one queue row per Show Registration while keeping Dog, Class, and per-Entry Handler identity in the focused pane. Search spans registration and child Entry identities, including Exhibitor, email, Dog, Handler, Armband, confirmation, Entry number, and Class.
- Preserve normalized URL state for queue, Trial/Class scope, search, and the focused Show Registration. Desktop keeps queue and detail visible together; narrow widths use an explicit queue-to-full-width-detail transition without losing focus or filters.
- Give the focused queue row a persistent selected treatment distinct from checkbox bulk selection. Apply the same focus feedback to Show Desk so both cockpits confirm row clicks consistently.
- Restructure the focused pane as Registration header, Primary work, Entries grouped by Dog, Payment, then Communication/history. Reuse the existing entry, payment, email, Armband, comp, removal, and status mutation paths rather than reimplementing them.
- Consolidate Move-ups, Pulls/Scratches, and Waitlist under one Entry Management `Exceptions` peer with internal navigation; normalize legacy tab URLs to the canonical state.
- Replace Entry Management's full-width bulk footer with a compact floating selection toolbar that states both selected Show Registrations and affected Entries while retaining existing eligibility and partial-failure behavior.
- Keep `Add entry` as the only visible primary page action; retain normalized copy-link, CSV export, and density under compact secondary controls.
- Delete or retire the superseded Entry Management statistics-card, table/card toggle, Day-of mode, and duplicate filter breadcrumb. Preserve the existing `EntryEditDialog` only as the canonical complete field editor until the focused pane has proven editing parity. Existing canonical exception, Show Desk/check-in, reports, and exhibitor My Entries surfaces remain owners of their work.
- Absorb the unimplemented `entry-peek-pane` change's URL, responsive-detail, shared-action, offline, and focus-management requirements into this cockpit; do not implement a second competing pane.

This change does not duplicate an existing page. It reshapes the existing canonical Entry Management route and links to existing exception and show-day owners. A link alone cannot solve the problem because the overload is inside Entry Management's own primary queue and detail workflow.

### Non-goals

- No new Entry Management route, command center, report, check-in implementation, or replacement exception workflow.
- No new mutation or direct Supabase path; established replicated/offline-capable reads and writes remain authoritative.
- No change to exhibitor My Entries or its existing `EntryEditDialog` usage.
- No unattended self-service check-in kiosk in this change.
- No removal of normalized copy-link behavior. The incompatible pre-launch device-local Entry Management saved-view schema is retired with its Day-of and table/card modes instead of pretending those modes can be restored into the new cockpit.

## Capabilities

### New Capabilities

- `entry-management-cockpit`: The canonical responsive Show Registration queue, URL-addressable focused detail, search/scope behavior, visual focus feedback, and reuse of existing registration actions.

### Modified Capabilities

- `bulk-selection-actions`: Entry Management presents registration-level selection in a compact floating toolbar with exact Registration and affected-Entry counts while preserving shared action eligibility and dispatch behavior.
- `operational-views`: Entry Management's supported view state becomes queue, Trial/Class scope, search, density, and focused registration; the retired Day-of, table/card, and incompatible pre-launch saved-view modes no longer appear as Entry Management presets.
- `shell-interaction-integrity`: Move-ups, Pulls/Scratches, and Waitlist become one canonical Entry Management Exceptions peer with accessible internal navigation and legacy URL normalization.

## Impact

- Affects `EntryManagementPage`, Entry Management URL normalization/filter hooks, enrollment grouping, responsive rendering, queue/detail components, bulk-selection presentation, and focused tests.
- Reuses `useEntryManagementData`, `useEntryManagementActions`, existing exception components, lifecycle email/payment dialogs, shared entry action definitions, and replication-backed Entry mutations.
- Removes the production need for the throwaway prototype route after browser parity is verified.
- Adds a small consistent focused-row treatment to the existing Show Desk queue without changing Show Desk data ownership or actions.
- Supersedes the unimplemented peek-pane change, archived at `openspec/changes/archive/2026-07-23-entry-peek-pane/` without syncing its obsolete delta spec.
