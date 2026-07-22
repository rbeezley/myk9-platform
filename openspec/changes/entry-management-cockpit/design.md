## Context

Entry Management already has the difficult infrastructure: show-scoped replicated Entry reads through `useEntryManagementData`, offline-capable mutations through `useEntryManagementActions`, enrollment grouping, typed attention classification, URL normalization, saved operational views, lifecycle email/payment dialogs, and specialized Move-up, Pull, and Waitlist components. The defect is the projection. `EntryManagementPage` stacks page tabs, Trial/Class filters, a breadcrumb, related links, a trial scope bar, statistics cards, work-mode presets, filters, table/card modes, bulk controls, and row menus with similar visual weight.

The approved prototype establishes a queue-and-focus pattern matching Show Desk. The queue unit is a Show Registration, not a flattened Entry. One registration can contain multiple Dogs, and each child Entry can have a different Handler. Secretaries may work with hundreds of Entries, so search and scope must remain fast and URL-addressable. The screen must also remain usable on a 15-inch laptop, a narrow in-app browser, and a tablet.

An existing unimplemented `entry-peek-pane` change overlaps this work. Its context-preserving detail, URL, offline, shared-action, and focus-management requirements are valid, but a separate overlay pane would compete with the approved persistent focused-registration pane. This change absorbs those requirements and supersedes that change.

The secretary intent is “That was easy”: the page must confirm clicks, preserve context, expose one next action, and keep exceptions and secondary controls reachable without making them peers of daily work.

## Goals / Non-Goals

**Goals:**

- Present one canonical Show Registration queue with a focused-registration pane and the same interaction model as Show Desk.
- Make review, missing-information, and payment work easy to locate with compact queues, robust search, Trial/Class scope, and precise URL state.
- Reuse existing entry, enrollment, payment, email, exception, and offline mutation paths.
- Preserve deep links, copied views, browser navigation, bulk-action eligibility, partial-failure handling, and already-loaded offline behavior.
- Remove redundant presentation modes and controls after parity is proven.
- Keep production files under 500 lines by separating pure grouping/classification, queue, focus, toolbar, and URL concerns.

**Non-Goals:**

- No new data model, API, direct Supabase read, mutation, or server function.
- No duplicate Check-in desk, reporting, scoring, Move-up, Pull, or Waitlist implementation.
- No changes to exhibitor My Entries or its `EntryEditDialog` call site.
- No unattended kiosk or new role/permission model.
- No broad redesign of Show Desk beyond matching focused-row feedback and, if shared safely, the contextual toolbar primitive.

## Decisions

### 1. Use one Show Registration projection over the existing Entry dataset

Create a pure `ShowRegistrationGroup` projection from `EntryManagementEntry[]`. Its stable key is the registration ID, then Stripe payment-intent ID, then the single Entry ID fallback already used by `groupEntriesByEnrollment`. The group exposes Exhibitor/submitter identity from owner fields, confirmation, submitted time, child Entries, Dogs, payment summary, attention summary, and the recommended next action. Child Entries retain their own Handler, Class, status, and mutation target.

The existing enrollment grouping/payment helpers remain dependencies; the cockpit does not create a competing money calculation. Where an online order has no registration row, its stable fallback group still behaves as one visible registration unit.

Alternative considered: one row per Entry. Rejected because it repeats the same registration/payment context and makes bulk review noisy. Alternative considered: one row per Dog. Rejected because payment and submission decisions belong to the registration while Handler can vary per child Entry.

### 2. Derive queues with shared canonical predicates

Add pure group selectors that delegate child classification to `classifyEntryAttention`, `getOperationalEntryState`, and `getEffectivePaymentStatus`:

- `needs-review`: any child Entry is pending review;
- `missing-information`: any child Entry is explicitly classified missing information;
- `payment-due`: the group has an accepted, unpaid eligible balance according to existing payment helpers;
- `all`: every group.

Counts and visible results use the same group predicate. Within the work queues, order is oldest unresolved/submitted first. `All registrations` supports the existing explicit sort choices without a hidden urgency score.

Alternative considered: a new priority formula. Rejected because it would be opaque and could disagree with existing attention links.

### 3. Make search global to the show while preserving dormant queue/scope state

Search matches Exhibitor name/email, Dog, per-Entry Handler, Armband, confirmation, Entry number, and Class. While search text is present, rendering ignores the active queue and Trial/Class scope and searches all loaded Show Registrations. The queue and scope parameters remain in the URL but dormant; clearing search restores them automatically. Matching child context is identified and opened in the focused pane.

This avoids a second “previous filters” state store and works offline from the already-loaded Entry dataset. Search input is debounced only if profiling proves necessary; the first implementation uses memoized in-memory filtering.

Alternative considered: search only the active queue. Rejected because a busy secretary should not need to guess which queue contains a Dog or Handler.

### 4. Normalize one URL contract around the cockpit

The canonical parameters are `queue`, `trial`, `class`, `search`, `registration`, `density`, `tab`, and `exception`. Invalid values normalize to safe defaults. `Needs review` is the default queue and is omitted from the URL. `registration` addresses a group key only when it belongs to the current show-scoped loaded dataset. Browser Back/Forward, refresh, and copied links restore the same queue, scope, search, and focused registration.

Legacy `attention`, `payment`, `mode`, `view`, `entryTab`, `queue` exception values, and old tab URLs normalize into the new contract where a truthful equivalent exists. Unsupported Day-of or table/card state is removed rather than creating hidden dual behavior. A legacy child `entry` focus parameter may resolve to its parent group during the transition, but canonical writes use `registration`.

Alternative considered: keep local focus state. Rejected because attention deep links, copied views, refresh, and Back/Forward would lose context.

### 5. Use one responsive component tree selected by content width

At sufficient content width, render the queue and focused pane side-by-side, with the detail pane sticky within the page. Below the measured content threshold, show either the queue or the same focused pane full-width. Opening a row transitions to detail; Back returns to the preserved queue, scroll, filters, and selection. If a wide viewport narrows while detail is open, keep detail open rather than silently hiding it.

No CSS-hidden duplicate detail tree is rendered. The breakpoint uses container/content width rather than device labels so it behaves correctly in the in-app browser and with a collapsed sidebar.

Alternative considered: always hide the right pane below a viewport breakpoint. Rejected because it makes a click appear to fail and caused the prototype concern this design resolved.

### 6. Keep focus and bulk selection visually and semantically distinct

Clicking a row sets focused registration and gives that row a persistent background tint, inset outline, and leading accent in light and dark themes. The row exposes `aria-selected`; keyboard activation receives equivalent feedback. Checkbox selection is the only way to enter bulk-selection mode and retains its own checked state.

Show Desk receives the same focused-row grammar so both cockpits confirm navigation consistently. This is presentation reuse, not a shared domain state abstraction.

Alternative considered: a `Selected` badge. Rejected because it adds another badge to a page being simplified and can be confused with registration status.

### 7. Keep the focused pane stable and reuse existing actions

The pane hierarchy is fixed: Registration header, Primary work, Entries grouped by Dog, Payment, Communication/history. The active queue or search match opens the relevant Dog/section but does not rearrange the pane. Each child Entry shows Trial/date, Class, its own Handler, status, and next action.

Status, payment, edit, Armband, comp/uncomp, refund, removal, and email controls bind to existing `useEntryManagementActions`, dialogs, lifecycle email hooks, and shared action definitions. The existing Entry Management `EntryEditDialog` remains the canonical full-field editor until the focused pane can provide complete editing parity; this change does not build a second editor or alter the separate My Entries call site. Focus moves into full-width detail on narrow layouts and returns to the originating row on Back/Escape. On desktop, queue and pane remain in the normal document flow rather than a modal focus trap.

Alternative considered: rebuild actions inside the pane. Rejected because it would duplicate eligibility, permissions, and offline mutation behavior.

### 8. Consolidate exceptions without reimplementing them

The page has two primary peers: `Registrations` and `Exceptions`. Exceptions contains accessible internal choices for Move-ups, Pulls/Scratches, and Waitlist and renders the existing canonical components. Legacy direct tab/query states normalize to the corresponding Exceptions choice. Trial context is passed only where the existing component supports it; unsupported scope is not implied.

Alternative considered: keep four top-level tabs. Rejected because three are exception types, not peer mental models. Alternative considered: merge exception rows into the registration queue. Rejected because their ordering and actions are specialized.

### 9. Select whole registrations and present actions contextually

Main-queue checkboxes select Show Registration groups. The compact floating toolbar reports `N registrations · M Entries`, keeps the primary eligible action, overflow actions, and Clear together, and never spans filtered-out groups. Dispatch expands selected groups to child Entry IDs and delegates to the existing bulk handlers and eligibility definitions. Exact eligible-subset and partial-failure reporting remains unchanged.

The toolbar is implemented as a reusable presentation primitive where practical, but this change only migrates Entry Management and any directly compatible Show Desk presentation. It does not rewrite unrelated domain action catalogs.

Alternative considered: preserve the full-width fixed footer. Rejected because the count and actions separate across the viewport and can be missed.

### 10. Retire legacy presentation only after behavior parity

Build the production cockpit beside the old `RegistrationView` using extracted pure adapters and existing handlers. Tests pin grouping, queue counts, URL normalization, search, focus, responsive transitions, and action dispatch before `EntryManagementPage` switches to the cockpit. Then remove the dev-only prototype route/imports and delete only production components proven unused by `rg`; keep reusable dialogs/helpers and the exhibitor dialog.

No runtime feature flag is required pre-launch. Rollback is the PR revert; no schema or data migration occurs.

### 11. Keep page actions and pagination subordinate to the work queue

`Add entry` remains the only visible primary page action. Copy normalized view link and CSV export stay in compact `More` controls, while density stays in `View`, so they remain reachable without competing with review work. The device-local pre-launch saved-view shape is intentionally retired because it encodes the removed Day-of and table/card presentations; there are no real users whose preferences require migration. Pagination operates on the fully filtered Show Registration result after queue/search/scope/sort evaluation, shows an exact range, and keeps the current page, focused registration, and compatible selection stable while detail opens.

Alternative considered: show every export/view control in the header. Rejected because it recreates the flat hierarchy the redesign is removing. Alternative considered: infinite scroll. Rejected because explicit 50-registration pages make range, keyboard position, and return context predictable for busy secretaries.

## Risks / Trade-offs

- **[Risk] Registration grouping can merge unrelated online Entries.** → Reuse the established registration/payment-intent/single-entry fallback key and add collision tests for missing registration IDs.
- **[Risk] Queue counts drift from attention links.** → Delegate to canonical child predicates and test each count against the visible group selector.
- **[Risk] Group-level actions accidentally apply to ineligible child Entries.** → Expand groups through existing eligibility resolution and show exact eligible/selected counts before dispatch.
- **[Risk] Search across hundreds of Entries becomes sluggish.** → Keep projection and normalized search documents memoized; profile before adding debounce or indexing.
- **[Risk] Pagination makes a focused or selected registration appear to vanish.** → Apply all filtering/sorting before paging, preserve the current page while detail is open, and prune selection only when its group leaves the effective result set.
- **[Risk] URL migration breaks old links.** → Add table-driven normalizer tests for every legacy attention/tab/mode/view/entry state and retain safe normalization.
- **[Risk] Responsive detail loses queue context.** → Render one detail component, preserve URL focus and queue scroll, and browser-test wide-to-narrow transitions.
- **[Risk] Removing old components drops a rare payment/email action.** → Inventory action parity and test handlers before deleting any call site; retain existing dialogs and hooks.
- **[Risk] Concurrent OpenSpec changes overlap Entry Management.** → Absorb `entry-peek-pane`; preserve `class-entry-operational-visibility` route/filter contracts; rebase before implementation verification.

## Migration Plan

1. Add pure Show Registration grouping, queue classification, search, pagination, and URL normalization with unit tests.
2. Add production queue, focused pane, responsive controller, and contextual bulk toolbar wired to existing actions.
3. Consolidate Exceptions navigation and normalize legacy URLs.
4. Switch `EntryManagementPage` from `RegistrationView` to the cockpit while preserving existing loading, error, authorization, and dialog boundaries.
5. Add the focused-row treatment to Show Desk and verify both themes and responsive widths.
6. Browser-walk the two-Trial/hundreds-of-Entries scenario, deep links, Back/Forward, selection, and offline-loaded filtering.
7. Remove the dev-only prototype and only the legacy presentation files with no remaining callers.
8. Revert the implementation commit(s) to roll back; no data rollback is required.

## Open Questions

None. The prototype decisions are recorded in `docs/entry-management-ux-audit.md`; implementation details that prove incompatible with existing action contracts must stop for a product decision rather than silently add a duplicate path.
