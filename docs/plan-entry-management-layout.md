# Entry Management Layout Plan

> **Status:** Complete

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This is a production UI/state-flow change in myK9Show that affects secretary entry
  review and show-day actions, so focused component coverage plus an app-level browser smoke is
  required before PR.

## Purpose

Reshape Entry Management into a calmer command center for trial secretaries without adding a new
page or duplicating Show Desk. The page should support both pre-show review and show-day exception
work, but it should remain the owner of entry/order/payment operations while Show Desk remains the
pressure-surface for running the show.

The target secretary feeling from [`INTENT.md`](INTENT.md) is: **"That was easy."**

## Current Problem

The current page has grown organically. It includes page-level tabs, entry-status tabs, stats,
trial/class filters, a separate search/filter row, list/table modes, list cards, table rows, move-up
and pulled queues, dialogs, and bulk actions. The underlying capability is strong, but the page asks
the secretary to understand too many control layers before doing the work.

Specific issues to resolve:

- The app already has a standard search/filter/view-toggle pattern on Dogs, Clubs, People, and
  Shows; Entry Management should use it instead of a bespoke control stack.
- Entry status buckets are expressed as tabs even though they are really filters.
- The separate `Entries` and `Waitlist` page tabs add another layer of navigation that likely is not
  needed if waitlist is a filter/attention state.
- Table view should be the default because secretaries need scan density.
- Card view should not produce one isolated card per entry; online enrollments/payments can cover
  multiple dogs, so cards need enrollment-level grouping with dog subgroups.
- Per-row capabilities are not consistently discoverable unless every row has a standard three-dot
  actions menu.
- Bulk actions need to be obvious for selected rows, and the card view needs group-level bulk
  actions such as "accept all for this dog" or "check in all for this dog."

## Duplication Question

Does this duplicate an existing page?

No, if scoped correctly. Entry Management already owns entry review, payment state, armbands,
confirmation email, check-in state, pull/no-show, move-up request decisions, refunds, and enrollment
records. This plan reorganizes that existing surface.

What could duplicate another page?

- Rebuilding Show Desk inside Entry Management would duplicate the show-day workbench.
- Rebuilding Show Map inside Entry Management would duplicate class/ring operational orientation.
- Creating a separate waitlist or move-up page would fragment work that already belongs to Entry
  Management.

The safe boundary: Show Desk may deep-link into Entry Management with filters applied; Entry
Management should not copy Show Desk's map or next-action model.

## Selected Direction

Use **one page with two work modes**:

- **Review**: pre-show and office work.
- **Day-of**: check-in and exception handling.

These modes should not be separate pages and should not fork the data model. They are presets over
the same Entry Management dataset, filters, table/card views, and actions.

## Layout

### Header

Keep the page title and primary commands concise:

- `New Entry`
- `Export CSV`

Avoid adding more header buttons. Work-specific commands should live in the bulk menu, row menu, or
group card actions.

### Stats

Use the standard stats card pattern already used elsewhere in the app. Entry Management already uses
`StatsGrid` / `StatCard`; implementation should preserve or tighten that shared primitive rather
than introducing bespoke cards.

Stats should stay compact and operational:

- Total entries
- Pending review
- Accepted
- Waitlist
- Revenue / collected fees

If additional attention stats are needed for Review or Day-of mode, prefer filter chips or mode
presets over adding more permanent cards.

### Shared Controls

[EXPANDED] Replace the bespoke search/filter/view control stack with the standard list-controls
pattern already used by Dogs, Clubs, People, and Shows. Prefer the existing shared component rather
than creating another local toolbar.

Controls should include:

- Search
- Filter chips/menu
- View toggle
- Results count

The shared search should drive both table and card views. If the table has its own built-in search,
remove or disable it so there is only one search field.

[ADDED] The shared control state should be the source of truth for both views. Switching between
table and cards must not reset search/filter choices unless the user explicitly clears them.

### Work Modes

Add a compact mode switch:

- `Review`
- `Day-of`

The mode switch should set useful default filters, not hide capabilities.

Review mode default filters:

- Pending review
- Payment due
- Missing armband
- Missing info
- Confirmation email failed/not sent
- Waitlist

Day-of mode default filters:

- Checked-in status
- Not checked in
- Pull/no-show
- Move-up requested
- Issues
- Current trial/class when linked from Show Desk

The exact filter names should use show language, not technical status strings.

### Filters Instead Of Tabs

Remove the status tab row as a primary navigation model:

- Pending
- Accepted
- Waitlist
- Move-Up
- Pulled
- Issues

Represent these as filters or quick filter chips. Multiple filters should be combinable when useful,
for example `Payment Due` + `Pending Review`.

Trial and class filters should remain, but they should be part of the same control system or visually
sit with it. Deep links from Show Desk should continue to set trial/class filters directly.

[ADDED] Invalid or contradictory filter combinations should fail calmly: show the filter-aware empty
state and a clear way to remove filters. Do not silently reset the secretary's filters.

## Default Table View

Table view should be the default because it supports dense scanning and bulk work.

Column direction:

1. Selection checkbox gutter, when bulk selection is available.
2. Armband badge as the first data column.
3. Dog.
4. Class / trial context.
5. Handler / owner.
6. Entry status.
7. Check-in.
8. Payment / enrollment.
9. Email / confirmation.
10. Row actions.

The armband badge should be visually first because it is the secretary's fastest real-world lookup
handle.

Every row needs a standard three-dot menu. The row menu should contain all actions available for that
single entry row, including status, check-in, armband, comp/uncomp, refund/withdraw/pull, and email
actions where valid.

[ADDED] Use the existing standard row-action menu primitive where possible so Entry Management uses
the same action affordance as the rest of the app. Avoid bespoke kebab-menu styling.

Selected rows should enable a bulk actions three-dot menu. Bulk actions should show only actions that
make sense for the current selection, or explain why an action is unavailable.

## Card View

Card view should be the alternate view for context-heavy work, not the default.

Group cards by **enrollment/order** because payment and confirmation often belong to the whole order.
Inside each enrollment card, group entries by **dog**. Under each dog, list the dog's classes/entries.

Enrollment-level actions:

- Mark paid / update payment
- Send or resend confirmation
- Accept all entries in the enrollment
- Reject or withdraw the enrollment when valid
- Export/copy order context if needed

Dog-level actions:

- Accept all for this dog
- Check in all for this dog
- Assign/change armband
- Pull/no-show all classes for this dog when valid

Entry/class-level actions stay available through each row's three-dot menu.

[ADDED] Grouping must preserve enrollment/payment truth. Payment-state actions belong at enrollment
scope unless the existing data model proves a narrower row/dog scope is safe.

## Bulk Actions

Bulk action design should support three scopes:

- Selected table rows.
- One dog within an enrollment card.
- One enrollment/order card.

The implementation should reuse existing mutation handlers where possible. Do not create a parallel
bulk mutation path unless the existing handlers cannot express the scope safely.

Bulk action labels should be plain:

- `Accept selected`
- `Check in selected`
- `Mark paid`
- `Send confirmation`
- `Pull / no-show`

Avoid showing destructive actions as primary buttons. Destructive or irreversible operations should
live in menus/dialogs with clear confirmation language.

[ADDED] Bulk eligibility must be computed before showing or enabling an action. Mixed selections
should either narrow the available actions or show a plain-English disabled reason. Partial failures
should keep the current table/card data visible, report which rows failed when that information is
available, and allow the secretary to retry without losing the current selection unexpectedly.

## Data And Permission Boundaries

[ADDED] Preserve the existing Entry Management data boundary. Do not introduce new direct Supabase
reads or writes for core entry data as part of this layout work. Reuse the current data hooks,
replication-backed read path, and established mutation handlers unless the implementation plan proves
an existing helper cannot support the needed scope.

[ADDED] Menus must respect the same authorization rules as the current actions. The layout may make
actions easier to find, but it must not expose a broader action set to club admins, site admins, or
secretaries than the existing handlers permit. Unauthorized or unsupported actions should be absent
or disabled with calm explanatory copy.

## URL And Deep-Link Behavior

Entry Management must remain deep-linkable.

Preferred URL params:

- `mode=review|day-of`
- `status=...`
- `attention=...`
- `trial=...`
- `class=...`
- `view=table|cards`

Existing links such as `entryTab=pending` should be redirected or translated during implementation
so older dashboard or test links still land on the equivalent filtered view.

[EXPANDED] Existing page-tab links must also be handled. `tab=waitlist` should translate to the new
waitlist filter/attention state, and any legacy `entryTab` value should map to its closest new filter
instead of landing on an unfiltered table.

Show Desk should link into Entry Management with filters applied for work that Entry Management owns,
such as pull/no-show, move-up decisions, and check-in rows. It should not duplicate the entry table.

## Error And Empty States

Empty states should explain the current filter, not imply the show has no entries.

Examples:

- `No entries match these filters.`
- `No pending entries.`
- `No move-up requests right now.`
- `No dogs are waiting for check-in in this class.`

Load errors should continue to replace the misleading zero-entry view, with a retry action. Action
errors should leave the loaded table/cards usable.

[ADDED] Action failures should be scoped to the attempted action. A failed payment update, email
send, check-in, or status change should not clear filters, mode, selected rows, or the current view.

## Performance And Scale

[ADDED] Enrollment and dog grouping should be derived from the already-loaded entry dataset with
memoized helpers. Do not add per-enrollment, per-dog, or per-row network requests while rendering the
table or cards. If extra metadata is needed, batch it through the existing query layer before render.

[ADDED] Table view remains the default partly for scale. Card view should stay responsive on large
shows by rendering compact enrollment groups and avoiding layout work that grows quadratically with
entry count.

## Recommended Implementation Phases

### Phase 1: Shared Controls And Filter Model

- Replace bespoke search/filter/view controls with the shared list-controls pattern.
- Convert status tabs to filters/quick chips.
- Preserve current URL behavior by mapping existing `entryTab` values and `tab=waitlist` to new
  filters.
- Make table view the default.

### Phase 2: Table Actions

- Put armband as the first data column after the checkbox gutter.
- Add row-level three-dot actions to every table row.
- Add selected-row bulk actions through a standard three-dot menu or the existing sticky bulk bar,
  adjusted to the standard action-menu pattern.
- Remove duplicate table search if the shared search controls the dataset.
- Verify action eligibility and partial-failure behavior before wiring each bulk action.

### Phase 3: Enrollment Card Grouping

- Rework card view around enrollment/order cards.
- Add dog subgroups inside enrollment cards.
- Add enrollment-level and dog-level bulk actions.
- Keep entry/class-level actions available through row menus inside the card.
- Memoize grouping and avoid new render-time network calls.

### Phase 4: Review / Day-Of Mode Presets

- Add `Review` and `Day-of` mode switch.
- Make modes filter presets over the shared dataset.
- Add Show Desk deep links into Day-of filters for class/check-in/pull/move-up states.

### Phase 5: Verification And Polish

- Run focused component tests for filter URL mapping, default table view, row actions, bulk actions,
  enrollment grouping, and mode presets.
- Run a browser smoke on the secretary Entry Management page using seeded data.
- Verify legacy dashboard and Show Desk deep links still land on the correct filtered rows.
- Re-check the duplication boundary: no new Show Desk, Show Map, waitlist, or move-up page was
  created.
- Verify no new direct Supabase read/write path was introduced for core entry data.

## Testing Phase

Do not consider implementation complete until these pass:

- Unit/component tests for the new filter model and URL parameter mapping.
- Component tests for table row action menus and bulk action eligibility.
- Component tests for enrollment card grouping with multiple dogs on one enrollment.
- Component tests for `entryTab` and `tab=waitlist` compatibility mapping.
- Component tests for mixed-selection bulk action eligibility and partial-failure copy when practical.
- Regression test that table view is the default.
- Browser smoke for Review mode and Day-of mode on a seeded secretary show.
- `pnpm typecheck` or the narrowest practical TypeScript verification for changed app code.

## Implementation Notes - 2026-06-19

Completed in the first implementation pass:

- Added the shared Entry Management filter model, including legacy `entryTab` and `tab=waitlist`
  URL compatibility.
- Replaced the bespoke tab/search shell with the shared search/filter/view controls and made table
  view the default.
- Moved status buckets (`Pending`, `Accepted`, `Waitlist`, `Move-ups`, `Pulled`, `Issues`) into the
  shared filter model instead of separate tabs.
- Updated the table so armband is the first data column, duplicate table search is hidden, each row
  has a three-dot action menu, and selected rows use a three-dot bulk action menu.
- Updated card view so enrollment/payment remains the top-level grouping and dog sections are nested
  inside each enrollment card.
- Fixed a pre-existing duplicate import/local declaration in `MyEntryCard.tsx` that blocked the app
  TypeScript check.

Verified:

- `cd apps/myk9show && npx vitest run src/components/entries/management/__tests__/entryManagementFilters.test.ts src/components/entries/management/__tests__/RegistrationView.test.tsx src/components/entries/management/__tests__/RegistrationView.multiselect.test.tsx src/components/entries/management/__tests__/EntriesTableView.selection.test.tsx src/components/entries/management/__tests__/EntryBulkActionsBar.test.tsx src/components/entries/management/__tests__/EnrollmentCard.test.tsx`
  passed: 6 files, 36 tests.
- `cd apps/myk9show && pnpm typecheck` passed.

Still open:

- Visible `Review` / `Day-of` mode presets and seeded browser smoke are the next phase.

## Implementation Notes - 2026-06-19 Phase 4

Completed in the Review / Day-of mode pass:

- Added a compact `Review` / `Day-of` work-mode switch to Entry Management.
- Kept mode state URL-backed through `mode=day-of`, with `Review` as the default mode.
- Made mode changes apply table-first presets over the shared dataset:
  - `Review` sets `attention=pending`.
  - `Day-of` sets `mode=day-of&attention=accepted`.
- Preserved search, trial, and class filters while applying mode presets.
- Updated Show Desk and secretary dashboard pending-review links to use canonical
  `mode=review&attention=pending` URLs instead of writing new legacy `entryTab` links.
- Kept legacy `entryTab` / `tab=waitlist` compatibility in the normalization layer.

Verified:

- `cd apps/myk9show && pnpm exec vitest run src/test/hooks/useEntryManagementFilters.test.ts src/components/entries/management/__tests__/RegistrationView.test.tsx src/components/entries/management/__tests__/RegistrationView.multiselect.test.tsx src/features/show-map/__tests__/ShowDeskPanel.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx src/pages/secretary/__tests__/EntryManagementPage.errorState.test.tsx`
  passed: 7 files, 42 tests.
- `cd apps/myk9show && pnpm exec vitest run src/test/hooks/useEntryManagementFilters.test.ts src/components/entries/management/__tests__/entryManagementFilters.test.ts src/components/entries/management/__tests__/RegistrationView.test.tsx src/components/entries/management/__tests__/RegistrationView.multiselect.test.tsx src/components/entries/management/__tests__/EntriesTableView.selection.test.tsx src/components/entries/management/__tests__/EntryBulkActionsBar.test.tsx src/components/entries/management/__tests__/EntryRowActionMenu.test.tsx src/components/entries/management/__tests__/EnrollmentCard.test.tsx`
  passed: 8 files, 59 tests.
- `cd apps/myk9show && pnpm typecheck` passed.
- Browser smoke:
  - `pnpm dev:show` required unsandboxed execution so Vite could bind to localhost.
  - Opened
    `http://localhost:5173/shows/show-1/entry-management?mode=day-of&attention=accepted` with
    Playwright.
  - The app loaded without client-render crashes, but the route showed the existing
    `We couldn't load this show. Please try again.` state because the smoke `show-1` fixture is not
    present in the connected Supabase data. Mode UI verification remains covered by component tests;
    a seeded secretary browser smoke should be run against staging or a known local seed show before
    closing the larger layout plan.

## Implementation Notes - 2026-06-19 Phase 5

Seeded browser smoke completed against the live local app and the shared secretary fixture show:

- Sign-in used the rotated local E2E secretary credential from `apps/myk9show/.env.local`; the older
  documented `secretary@myk9t.com` password in `docs/testing/secretary-walk-seed.md` is stale.
- Seed show: `dededede-0000-0000-0000-000000000010` / `Heartland Scent Work Classic`.
- Review mode loaded `/shows/:showId/entry-management?attention=pending`, kept table view as the
  default, showed `3 of 10 entries (filtered)`, and rendered armband as the first data column.
- Day-of mode switched to `/shows/:showId/entry-management?attention=accepted&mode=day-of`, kept
  table view, and showed the accepted entry row.
- Row actions opened from the table three-dot menu and exposed check-in, armband, comp, reject, and
  remove actions.
- Selected-row bulk actions appeared in the sticky bulk bar, explained disabled `Accept selected`,
  and exposed `Check in selected` plus destructive `Reject selected` inside the menu.
- Card view switched to `view=cards`, preserved the active filters, and rendered enrollment/payment
  as the card scope with the dog entry nested inside.
- Legacy deep links normalized correctly:
  - `entryTab=pending` -> `attention=pending`
  - `tab=waitlist` -> `attention=waitlist`
- Show Desk `Manage entries (3)` deep-linked to Entry Management with `attention=pending` rather
  than duplicating the entry table.
- No browser console errors appeared during the Entry Management smoke. The only console output was
  existing preload/monitoring warnings.

Non-blocking polish found:

- The waitlist empty state shows the generic table message `No results found.` below the active
  `Waitlist` chip and `0 of 10 entries (filtered)` count. It is not misleading, but a future polish
  pass could make the table empty copy fully filter-aware.

Resolved in follow-up:

- Entry Management now passes filter-aware empty copy into the table and card views, including
  `No waitlist entries right now.` for the waitlist filter and `No entries match these filters.`
  when search/payment filters narrow the result set.

## Implementation Notes - 2026-06-19 Phase 6

Completed the failure-aware bulk selection polish:

- `executeBulkStatusChange` now returns whether the bulk status update actually changed entries.
- Entry Management bulk status/check-in handlers return `true` only after the action succeeds and
  local state is patched.
- The selected-row bulk action menu now waits for async handlers and clears selection only on
  success. If a handled failure returns `false`, or an unexpected rejection occurs, the current
  selection stays in place so the secretary can retry without rebuilding the working set.

Verified:

- `cd apps/myk9show && pnpm exec vitest run src/components/entries/management/__tests__/EntryBulkActionsBar.test.tsx src/components/entries/management/__tests__/RegistrationView.multiselect.test.tsx src/components/entries/management/__tests__/bulkActionEligibility.test.ts src/services/database/entries/management-actions.test.ts src/hooks/__tests__/useEntryManagementActions.test.ts`
  passed: 5 files, 34 tests.
- `cd apps/myk9show && pnpm typecheck` passed.

## Open Questions

- Should `Review` or `Day-of` be remembered per user/show, or should Entry Management always open in
  `Review` unless the URL specifies otherwise?
- Which payment/confirmation actions are safe at dog scope versus enrollment scope?
- Should legacy `entryTab` params remain supported indefinitely, or only through a transition helper?
