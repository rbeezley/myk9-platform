# Design: exhibitor-interface-audit-remediation

## Context

A verified UX audit of the exhibitor surface found 14 defects/friction points across My Shows, My Dogs, Dog Details, the Add-a-Dog wizard, Find Shows, and the sidebar. All findings were traced to specific code (see proposal Impact). The exhibitor intent word is **"respects my time"** (docs/INTENT.md §Exhibitor): fewer cards, fewer redundant buttons, no dead controls, no broken filters.

Key data-model fact resolved during investigation: `registrations` (migration 054) is **one row per handler per show** with an auto-generated `MK9-XXXXXX` confirmation number, and every entry carries `registration_id`. A registration *is* the online-order unit and can span multiple dogs — so "one card per online order" is achievable client-side with data already joined by `USER_ENTRIES_SELECT`.

## Goals / Non-Goals

**Goals:**

- One My Shows card per registration (order), with all dogs on it, ≤5 dog items per row.
- Card-only My Dogs for exhibitors; card click is the single navigation affordance.
- Dog Details tab strip fits without horizontal scroll; Activity becomes a below-tabs section.
- Every visible CTA works ("Upgrade to unlock" navigates to `/pricing-page`).
- Find Shows dropdowns paint above later content; Scent Work filter matches shows.
- "Ringside" nav label; authenticated exhibitors never see a passcode prompt.
- Personalized sidebar header; theme-safe photo dialog.

**Non-Goals:** (see proposal) no backend/schema changes, no secretary/admin view changes, no anonymous-passcode redesign, no global dark-mode sweep.

## Decisions

### D1 — Order grouping key: `registrationId`, fallback `show+dog`

Change `groupEntriesByShowAndDog` (`useMyEntriesData.ts`) to group by `registrationId` when present. Entries with `registration_id = null` (secretary/mail-in entered) keep the current show+dog grouping so nothing disappears. The card model becomes: order header (show, date, confirmation number, payment status/total) + a dog list, each dog with its nested classes (reusing the existing per-dog class rendering inside `MyEntryCard`).

*Alternative considered:* grouping by `stripe_payment_intent_id` — rejected: not in the My Shows select, not present for check/waived payments, and registration already models the order 1:1.

*Preserve:* the `exhibitor-my-shows-legibility` spec's summary-band/next-action requirements still apply per card; the "one clear next action" now derives from the order's aggregate state (finish payment for the order, else check-in for the next eligible class across dogs, else view show).

### D2 — Dogs-per-row cap via responsive grid, max 5 columns

Inside the order card, dogs render in a CSS grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5` (wrap, never `overflow-x`). No JS measurement. This satisfies "limit five per row" as a maximum, not a fixed count.

### D3 — My Dogs: remove toggle for exhibitor-only users, keep component for staff

`BrowseDogsPage` already branches on role for the default view. For exhibitor-only users: don't render `viewMode`/`onViewModeChange` in `ListControls`, and always render `DogsGridView`. `DogsTableView` stays untouched for secretary/admin. In `BrowseCard`, drop the `actionLabel` button rendering when the card has an `href` (or remove the "View Dog" action from `DogsGridView`'s usage) — the whole-card click, `role="link"`, and keyboard handler already exist.

*Alternative:* delete `DogsTableView` entirely — rejected: secretaries legitimately use tables at scale (per-role table default is deliberate).

### D4 — Dog Details tabs: Activity moves below tabs

Remove the Activity tab from `DogDetailsTabs`; render `ActivityTab`'s content as a titled section below the tab panel (default position, always visible — no new collapsible primitive). Default tab becomes Registrations. This removes one trigger from the strip and matches the audit's preferred option. `PrimaryTabs` keeps its scroll-shadow overflow as a safety net for narrow phones.

*Alternative:* collapsible Activity accordion — rejected: adds an interaction affordance where a plain section suffices (consolidation phase: fewer affordances).

### D5 — Upgrade CTA: reuse `BlurGate`'s navigation

`TitleProgressTeaser`'s button gets `onClick={() => navigate('/pricing-page')}` — the same target `BlurGate.handleUpgrade` uses. No new upgrade flow.

### D6 — Wizard: field moves, hint removal, slide-out registration

- Delete the DOB `hint` prop in `BasicInfoTab.tsx:167` (keep the live age preview).
- Move the combined "Color & Markings" field markup + validation from `BasicInfoTab`/`validation.ts` to `AdditionalInfoTab` (it stays one merged field; the audit's "Color and Markings" maps to this single existing field).
- Replace `AddEditRegistrationDialog` (modal) inside `AddDogPanel` with the existing slide-over pattern: either mount `AddRegistrationPanel` (preferred if its save contract fits the wizard's local, not-yet-persisted dog) or wrap the existing dialog form body in `EditPanelWrapper` default `variant='panel'`. Decision point in implementation: the wizard's dog isn't saved yet, so the form must write to wizard state, not the DB — reuse the dialog's form body inside a `SlideOverPanel` shell rather than `AddRegistrationPanel`'s DB mutation path.

### D7 — Find Shows dropdown: portal the `FilterChips` popover

Root cause: the popover is a non-portaled absolute div inside `ListControls`' `backdrop-blur-sm` container (new stacking context), so `z-50` can't escape and later siblings (`PrimaryTabs`) paint over it. Fix: render the open menu through the app's existing popover primitive (shadcn `Popover`/`DropdownMenu`, already portal-based) instead of the hand-rolled absolute div. This fixes both the "behind tabs" and "transparent" symptoms (paint order) in every consumer of `FilterChips`.

*Alternative:* z-index escalation on ListControls — rejected: fragile, leaves the stacking-context trap for the next consumer.

### D8 — Scent Work filter: normalize before compare

In `useBrowseShowsFilters`, compare normalized tokens: `normalize(s) = s.toLowerCase().replace(/[^a-z]/g, '')` on both the mapped discipline (`'Scent Work'` → `scentwork`) and each `show.events` value, so `'Scentwork'`, `'scent_work'`, `'AKC Scent Work'` (via `includes`-style containment for org-prefixed values) all match. Add a unit test enumerating known `trial_type` variants from the DB. Also verify seed/staging `trial_type` values; if the DB is internally inconsistent, note it but fix client-side matching regardless (no schema migration in scope).

### D9 — Ringside rename + passcode bypass

- `EXHIBITOR_SHOW_DAY_NAV_ITEM.title` → `'Ringside'` (staff item already says Ringside; labels converge).
- `AtShowAccessGate` already bypasses for grant/staff-role/has-entry. Gap to close: an authenticated exhibitor with **no** entry and no role currently falls through to the passcode prompt. Requirement: authenticated users never see the passcode form from the sidebar path — show the signed-in "Ringside isn't open yet / no live show" state instead, reserving the passcode form for anonymous/`?passcode=1` flows. Verify `hasRole` resolution timing (RBAC 60s poll) doesn't flash the prompt for staff; gate on RBAC-loaded state before rendering the prompt.

### D10 — Sidebar personalization

Thread `firstName` (already exposed by `AuthContext`) from `UnifiedAppLayout` into `buildUnifiedSidebarConfig`; for the exhibitor config set `headerTitle` to the first name (fallback `'myK9 Exhibitor'` when null). `RoleSidebar` keeps rendering `config.headerTitle` — no new props on the presentational component.

### D11 — PhotoDialog theming

Replace hardcoded utilities with tokens/variants: Save button → plain `<Button>` default variant (drop `bg-gray-900 hover:bg-gray-800`); dropzone/helper text grays → `text-muted-foreground`, `border-border`, `bg-muted/…`. Covered by the existing contrast-token conventions; no token additions needed.

## Offline-first / replication impact

None of the touched surfaces write show-day core data. My Shows grouping is a pure client-side re-grouping of the existing `getUserEntries` result (which already honors the replication-backed read path); check-in still flows through the existing check-in mutation. No new direct Supabase reads are introduced.

## Risks / Trade-offs

- [Grouping regression hides an entry] → keep null-`registrationId` fallback grouping; unit-test `groupEntries*` with mixed null/non-null fixtures asserting total class count is conserved.
- [Order-level "next action" precedence ambiguity across dogs] → reuse the existing precedence (payment > check-in > view) evaluated over all classes in the order; covered by delta-spec scenarios.
- [FilterChips portal changes layout in other consumers] → `FilterChips` is shared; verify each consumer (Find Shows, My Shows filter strip) visually after the swap.
- [Wizard registration slide-out stacking] → `SlideOverPanel` over `AddDogPanel` (itself a slide-over) needs z-order/focus check; the panel system already supports layering via `EditPanelWrapper`.
- [Passcode-gate change accidentally loosens anonymous access] → change only the *authenticated* branch; anonymous flow untouched; add a scenario asserting anonymous users still get the passcode path.

## Open Questions

None blocking — the registration≡order question was resolved during investigation (migration 054: one registration per handler per show). The D6 wizard-registration form-body reuse is an implementation-time choice between two existing patterns, not a design unknown.
