# Proposal: exhibitor-interface-audit-remediation

## Why

A UX audit of the exhibitor interface (2026-07-22) found fragmented entry cards, dead controls, dark-mode contrast failures, and a broken discipline filter — friction that directly undermines the fall 2026 launch goal of an exhibitor experience an elderly, low-tech user can trust. All findings were verified against the current code; each maps to a concrete defect or inconsistency, not speculative polish.

## What Changes

**My Shows consolidation (verified: cards are currently one per dog per show, `groupEntriesByShowAndDog`)**

- Group My Shows cards by online order (registration/confirmation) instead of show+dog: one card per order, with all dogs from that order grouped on it.
- Cap grouped dog chips/cards at five per row so wide orders wrap instead of scrolling horizontally.

**My Dogs simplification (verified: table/card toggle + redundant "View Dog" button exist)**

- Remove the table view and view toggle for exhibitor-only users on My Dogs — card view only. (Secretary/admin dog list keeps its table.)
- Remove the "View Dog" button from dog cards; the card itself is already clickable and remains the sole navigation affordance.

**Dog details & wizard fixes**

- Fix tab overflow on Dog Details: relocate the Activity tab content to a section below the tabs (or collapsible), reducing the tab strip to fit without horizontal scrolling.
- Wire the "Upgrade to unlock" teaser button (`TitleProgressTeaser`) — currently has no `onClick` — to the existing `/pricing-page` navigation used by `BlurGate`.
- Add-a-Dog wizard: remove the Date of Birth hint text ("Not sure of the exact date? An approximate one is fine.") and move the Color & Markings field from the Essentials tab to Optional Details.
- Replace the pop-up `AddEditRegistrationDialog` used inside the Add-a-Dog wizard with the slide-out panel pattern already used by `AddRegistrationPanel` on Dog Details (consistency, not new UI).

**Find Shows filter fixes (both verified bugs)**

- Fix the filter dropdown rendering behind the Past Shows tabs: the `FilterChips` popover is non-portaled and trapped by the `backdrop-blur-sm` stacking context in `ListControls`; portal it (or restructure stacking) so it paints above subsequent content.
- Fix the Scent Work filter returning zero results: the filter exact-matches `'Scent Work'` against `show.events` derived from raw `trial_type` values; normalize the comparison so stored variants match.

**Navigation & personalization**

- Rename the exhibitor sidebar item "Show day" to "Ringside" (staff sidebar already uses "Ringside").
- Ensure authenticated exhibitors following the Ringside link never hit a passcode prompt; verify the RBAC/entry bypass in `AtShowAccessGate` covers signed-in users and fix any gap.
- Replace the sidebar header "myK9 Exhibitor" with a greeting using the user's first name (available via `AuthContext.firstName`, not currently passed to the sidebar config).

**Dark mode**

- Fix the photo upload dialog Save button (hardcoded `bg-gray-900`, unreadable in dark mode) and the dialog's other hardcoded gray/blue utilities by switching to theme tokens / standard Button variants.

## Capabilities

### New Capabilities

- `exhibitor-dog-management`: My Dogs card-only view, card-click navigation, Dog Details tab layout, working upgrade CTA, Add-a-Dog wizard field placement, slide-out registration flow, theme-safe photo dialog.
- `find-shows-filtering`: Find Shows filter dropdowns render above surrounding content and discipline filters match shows regardless of stored `trial_type` casing/format.
- `exhibitor-sidebar-personalization`: Exhibitor sidebar header greets the user by first name instead of the generic product label.

### Modified Capabilities

- `exhibitor-my-shows-legibility`: The card-grouping requirement changes from one card per show+dog to one card per online order, with multi-dog orders grouped on a single card and dog items capped at five per row.
- `exhibitor-show-day-access`: Adds requirements that the exhibitor navigation label reads "Ringside" and that authenticated exhibitors reach ringside without a passcode prompt.

## Impact

- **Affected code (apps/myk9show):** `MyEntriesPage` + `useMyEntriesData` + entries `search.ts` select (order grouping), `BrowseDogsPage`/`DogsGridView`/`BrowseCard` (My Dogs), `DogDetailsTabs`/`ActivityTab`/`TitleProgressTeaser` (dog details), `AddDogPanel` (`BasicInfoTab`, `AdditionalInfoTab`, `AddEditRegistrationDialog`), `FilterChips`/`ListControls`/`useBrowseShowsFilters` (Find Shows), `unifiedSidebarConfig`/`RoleSidebar`/`UnifiedAppLayout` (nav + personalization), `AtShowAccessGate`/`RingsideEntryPage` (passcode), `PhotoDialog` (dark mode).
- **Data model:** the exhibitor entries query does not currently expose an order id; grouping will key on the existing `registration_id`/`confirmation_number` join. No schema change expected; if registration does not map 1:1 to an online order, the design phase resolves the grouping key before implementation.
- **Launch readiness:** every item removes a defect or redundant affordance on the exhibitor journey — the audience the fall 2026 launch depends on most — and none adds net-new surface.
- **Duplication check:** no new pages, routes, or panels are introduced. The registration slide-out reuses the existing `AddRegistrationPanel`/`EditPanelWrapper` pattern; the upgrade button links to the existing pricing page; My Dogs and My Shows both *lose* surface (table view, View button, per-dog card fan-out). This change consolidates; it does not duplicate.

## Non-Goals

- No new exhibitor pages, tabs, or dialogs beyond relocating existing Activity content.
- No changes to secretary/admin dog or entry views (their table views stay).
- No payment/order backend changes — grouping uses data already joined client-side.
- No redesign of the passcode flow for anonymous ringside visitors; only the authenticated bypass is in scope.
- No broader dark-mode sweep beyond the photo dialog identified in the audit.
