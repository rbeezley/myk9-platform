## Why

Opening an entry from Entry Management currently uses `EntryEditDialog`, a centered modal that blocks the list behind it. A secretary working down an operational queue — "needs review," "needs check-in" — loses the list, active filters, scroll position, and any bulk selection every time they open an entry, and must re-orient after each one. This makes the most common show-day loop (open entry → act → return → open next) slower and more error-prone than it needs to be.

Linear's side-peek pattern keeps the list alive: detail slides in beside the list, the list stays visible and scrolled where it was, and previous/next controls walk the current result set without ever leaving the surface. Adopting that interaction grammar tightens the secretary's core loop without adding a page, route, or new management surface.

This supports fall 2026 launch readiness by making queue processing faster and safer on the surfaces secretaries already use, on both desktop and tablet.

## What Changes

- Replace `EntryEditDialog` on Entry Management with a side peek pane. The entry list, active filters, scroll position, and bulk selection remain visible and intact behind the pane.
- Reflect the open entry in surface URL state (`?entry=<id>`) through Entry Management's existing search-param normalizer, so refresh, back/forward, and copied links restore the peeked entry within the same show scope.
- Add previous/next navigation that walks the currently filtered, ordered result set without closing the pane.
- Reuse the shared entry action definitions and inline status editing from `inline-bulk-actions-and-editable-status` (MYK9-47); the pane renders those actions rather than owning duplicate mutation logic.
- Render the same pane full-width on tablet/narrow viewports — one component, repositioned, never two CSS-hidden copies.
- Remove `EntryEditDialog` and its call sites once the pane is the single entry-detail path on this surface.
- Preserve keyboard focus behavior: focus moves into the pane on open, is trapped while open, and returns to the originating row on close/Escape.

## Capabilities

### New Capabilities

- `entry-peek-pane`: A context-preserving side pane for viewing and acting on a single entry from Entry Management, with URL-addressable open state, queue-order previous/next navigation, and shared-action reuse.

### Modified Capabilities

None. Entry mutation semantics, offline/replication paths, role checks, and transition rules are unchanged; only the container that presents entry detail changes.

## Impact

- Affects Entry Management's entry-detail presentation, `useEntryManagementFilters` / `normalizeEntryManagementSearchParams` URL state (adds an `entry` param), and the components currently rendering `EntryEditDialog`.
- Depends on `operational-views-and-display-presets` (MYK9-48) owning the normalized URL contract, and consumes the shared action/selection contracts from `inline-bulk-actions-and-editable-status` (MYK9-47).
- Removes `EntryEditDialog`; any other surface still using it must migrate or be explicitly out of scope for this slice.
- No new route or standalone entry-detail page. No change to the replication-backed mutation path.
- No database migration and no external API contract change.
> **Superseded:** The approved `entry-management-cockpit` change absorbs this proposal's URL-addressable detail, responsive preservation, shared-action, offline, and focus requirements. Do not implement this as a second pane.
