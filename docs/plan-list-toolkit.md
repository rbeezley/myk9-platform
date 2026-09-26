# List Toolkit — shared search, filter and bulk actions

> **Status:** Active

Design: the "Admin Users Redesign" canvas (variant E, and the combined B + A + D board).

## Goal

One set of list controls for every large admin table (Users first, then Dogs and Entries), so each page declares only its fields and its bulk actions:

1. **View tabs** — built-in views with live counts. They replace stat cards: the count on a view is the stat, and clicking it applies the filter.
2. **Filter bar** — search plus removable filter chips, and a "+ Filter" menu listing each field's values with counts. Option fields and date-range fields.
3. **Result line** — "214 of 4,812 users" and "Select all 214 matching", so bulk actions reach past the current page.
4. **Floating bulk bar** — bottom centre, fixed, appears on the first selection; always in view wherever the admin has scrolled.

Filter state stays in the URL (existing `userListParams.ts` codec), so every filtered list is a link.

## Duplication check

- `components/common/FilterChips.tsx` (browse pages) is a public-facing chip row with no counts, no date ranges and no search; the kit is the admin-table counterpart. Converging the two is a follow-up once Dogs/Entries adopt the kit.
- `features/operational-views/SavedViewsControl.tsx` stores ONE device-local view for secretary surfaces; the kit's view tabs are built-in, URL-backed presets. No user-defined saved views in this change.
- `UserFilters.tsx` (the expandable filter panel) and `UserManagementStats.tsx` (stat cards) are **deleted** — the filter bar and view tabs replace them.

## Scope (this change: Users page)

- `apps/myk9show/src/components/list-toolkit/` — `ListViewTabs`, `ListFilterBar`, `ListResultLine`, `FloatingBulkBar`.
- `DataTable` column meta `stickyRight`, so the row-actions column is never clipped.
- `/admin/users`: views (All, Signed in 30d, Dormant 90d+, Never signed in, New this week, Suspended) plus a Role requests link; new `login` filter (URL `login=`); roles collapse to the highest role plus "+N"; row actions pinned right; bulk bar floats; "Select all matching".
- Bulk role-edit panel (canvas variant D): per role Add / Keep / Remove with "who has it now" counts, club picker for club-scoped roles, and a "What will happen" summary beside Apply. It sends remove-then-add steps through the existing `bulkRoleRunner`, so club scoping, canonical-role validation and the show-limited/expiring-grant protection are unchanged. Replaces `BulkRoleDialog` and its Add / Remove / Replace mode switch.
- Bulk account actions on the floating bar, each shown only when it applies (count when it reaches fewer than all): Suspend / Reinstate (admin:manage; never the admin's own account; Suspend confirms), Send invitation (never-signed-in people with an email; confirms), Restore (removed people). A More menu holds Copy emails and Export. Each reuses the single-person path (`useUpdateUserMutation`, `invokeAdminInvite`, `restoreUser`) through `useBulkDispatch`.
- The bar gets a raised surface (accent wash, accent border, deep shadow) — in dark mode `--popover` equals the card colour, so it blended into the list.
- 44px touch-target floor (docs/INTENT.md) holds for every toolbar and bulk-bar control.

## Non-goals

- Replace mode in the bulk UI. The runner keeps it; a club-less legacy Secretary/Club Admin grant is still removable one person at a time from Manage roles.
- Change-notification emails and bulk messaging (no notification path; needs compose, audit and unsubscribe rules). Bulk password reset and duplicate merge.
- Adopting the kit on Dogs and Entries — separate follow-ups.
- Keyboard shortcuts on the bulk bar.

## Testing phase

- Unit tests for each kit component (render, chip removal, option pick, date range, bulk bar visibility and clear).
- `userListParams` round-trip for `login`; `filterUsers` login buckets; view matching and counts.
- `getColumnLayoutClasses` for `stickyRight`.
- `bulkRoleEditPlan` (holdings, collapse-to-Keep, remove-then-add steps, summary lines); the panel (gating, club requirement, submitted steps); `useBulkActions` running ordered steps and validating every step before any write.
- Update the existing UserManagementPage and BulkActionsBar suites; run them and the shuffled app suite for touched files.
- Typecheck, lint, format, `qa:code-quality-ratchet`.
