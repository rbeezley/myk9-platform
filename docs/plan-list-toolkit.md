# List Toolkit — shared search, filter and bulk actions

> **Status:** Active

Design: the "Admin Users Redesign" canvas (variant E, and the combined B + A + D board).

## Goal

One set of list controls for every large admin table (Users first, then Dogs and Entries), so each page declares only its fields and its bulk actions:

1. **View tabs** — built-in views with live counts. They replace stat cards: the count on a view is the stat, and clicking it applies the filter.
2. **Filter bar** — search plus removable filter chips, and a "+ Filter" menu listing each field's values with counts. Option fields and date-range fields.
3. **Result line** — "214 of 4,812 users" and "Select all 214 matching", so bulk actions reach past the current page.
4. **Floating bulk bar** — bottom centre, fixed, appears on the first selection; always in view wherever the admin has scrolled.

> **MYK9-906 changed the presentation** (see [`plan-secretary-crud-consolidation.md`](plan-secretary-crud-consolidation.md) Phase 9). The behaviour above is unchanged; how it looks is not: view tabs are a labelled **Show:** select with the count inside each option ("Pending (12)") and read "Custom" when the filters match no view; every filter field is always visible as a labelled select ("Class: [Any class ▾]", date ranges as a "Created: [Any time ▾]" popover) instead of removable chips behind a "+ Filter" menu; and the result line is a short sentence ("Showing 12 of 214 entries.") with a **Show all entries** button that clears search, view and fields. It states count and noun only: the dropdowns already show every active filter, and any URL param that narrows a list without a visible control is normalized away when read. Thirteen rarely-used fields were cut at the same time. Each page decides "filtered" from the same applied state that filters its list and resets it in one update; the sentence stays hidden until the data has loaded.

Filter state stays in the URL (existing `userListParams.ts` codec), so every filtered list is a link.

## Duplication check

- The old `components/common/FilterChips.tsx`, `ListControls.tsx` and `ResultsCount.tsx` were deleted under MYK9-817; `apps/myk9show/src/test/ci/listToolkitGuard.test.ts` fails if any page imports a retired per-page list control.
- The legacy device-local `SavedViewsControl` was removed after its only mounted caller was retired; the kit's view tabs remain built-in, URL-backed presets. No user-defined saved views in this change.
- `UserFilters.tsx` (the expandable filter panel) and `UserManagementStats.tsx` (stat cards) are **deleted** — the filter bar and view tabs replace them.

## Scope (this change: Users page)

- `apps/myk9show/src/components/list-toolkit/` — `ListViewTabs`, `ListFilterBar`, `ListResultLine`, `FloatingBulkBar`.
- `DataTable` column meta `stickyRight`, so the row-actions column is never clipped.
- `/admin/users`: views (All, Signed in 30d, Dormant 90d+, Never signed in, New, last 7 days, Suspended) plus a Role requests link; new `login` filter (URL `login=`); roles collapse to the highest role plus "+N"; row actions pinned right; bulk bar floats; "Select all matching".
- The floating bar hosts Change roles, the account actions (Suspend, Reinstate, Send invitation, Restore — MYK9-835, rebuilt on ids-only selection and the current roster), a More menu (Copy emails, read-only, and Export), and bulk delete with confirmation.
- The bar gets a raised surface (accent wash, accent border, deep shadow) — in dark mode `--popover` equals the card colour, so it blended into the list.
- 44px touch-target floor (docs/INTENT.md) holds for every toolbar and bulk-bar control.

## Non-goals

- **Bulk role editing and bulk account actions were rebuilt under MYK9-820 / MYK9-835** (stacked on this change), after three Codex rounds on the original design found the same class of bug: a plan or a target list computed once and reused later, past the point where the underlying data had moved. The rebuild's rule is that the selection holds ids only, and every action — including a "Retry failed" that fires later, from a toast — resolves targets and eligibility from the CURRENT roster/assignments at the moment it runs, never from a snapshot. Bulk role editing adds one shared planner (`bulkRolePlanner.ts`) that both the "What will happen" summary and the runner consume, an Apply that re-reads assignments and refuses to run a plan that no longer matches what was shown, and a guard so the signed-in admin can never strip their own role. See `bulkAccountTargets.ts`, `useBulkAccountActions.ts`, `bulkRolePlanner.ts`, `bulkRoleEditPlan.ts`, `BulkRoleEditPanel.tsx`.
- Change-notification emails and bulk messaging (no notification path; needs compose, audit and unsubscribe rules). Bulk password reset and duplicate merge.
- Adopting the kit on Dogs and Entries — separate follow-ups.
- Keyboard shortcuts on the bulk bar.

## Testing phase

- Unit tests for each kit component (render, chip removal, option pick, date range, bulk bar visibility and clear).
- `userListParams` round-trip for `login`; `filterUsers` login buckets; view matching and counts.
- `getColumnLayoutClasses` for `stickyRight`.
- `BulkActionsBar`'s More menu: Copy emails writes the selected addresses to the clipboard. Bulk account actions and role editing (MYK9-835, MYK9-820) have their own unit and stale-data test coverage.
- Update the existing UserManagementPage and BulkActionsBar suites; run them and the shuffled app suite for touched files.
- Typecheck, lint, format, `qa:code-quality-ratchet`.
