# Tasks: exhibitor-interface-audit-remediation

## 1. Quick fixes (independent, low risk)

- [x] 1.1 Wire `TitleProgressTeaser` "Upgrade to unlock" button to `navigate('/pricing-page')` (`src/components/dogs/DogDetailsMain/sidebar/TitleProgressTeaser.tsx:26-29`); add a test asserting navigation on click
- [x] 1.2 Rename exhibitor nav item "Show day" → "Ringside" in `unifiedSidebarConfig.ts:68-73`; update any tests/snapshots pinning the old label (grep `Show day` in src and tests)
- [x] 1.3 Remove the DOB `hint` prop in `AddDogPanel/BasicInfoTab.tsx:167` (keep age preview); grep tests for the hint phrase
- [x] 1.4 Re-theme `PhotoDialog.tsx`: Save button → default `Button` variant (drop `bg-gray-900 hover:bg-gray-800`), replace `bg-blue-50`/`border-gray-300`/`text-gray-{400,500,700}` with `bg-muted`/`border-border`/`text-muted-foreground`; verify visually in both themes

## 2. Sidebar personalization

- [x] 2.1 Pass `firstName` from `useAuthContext()` in `UnifiedAppLayout.tsx` into `buildUnifiedSidebarConfig` (`unifiedSidebarConfig.ts:85,341-347`); exhibitor `headerTitle` = first name, fallback `'myK9 Exhibitor'`; other roles untouched
- [x] 2.2 Unit-test `buildUnifiedSidebarConfig` for: name present, name null fallback, staff titles unchanged

## 3. Find Shows filters

- [x] 3.1 Replace `FilterChips` inline absolute dropdown (`src/components/common/FilterChips.tsx:71-89`) with the portal-based shadcn `DropdownMenu`/`Popover` primitive; preserve chip trigger styling and selection API
- [x] 3.2 Verify each `FilterChips` consumer (Find Shows, My Shows filter strip — grep usages) renders and selects correctly; confirm dropdown paints above `PrimaryTabs` on `BrowseShowsPage`
- [x] 3.3 Normalize discipline matching in `useBrowseShowsFilters.ts:35-40,145-149` (lowercase, strip non-alpha, containment for org-prefixed values)
- [x] 3.4 Unit tests enumerating trial-type variants (`Scent Work`, `Scentwork`, `scent_work`, `AKC Scent Work`, plus non-match case); check staging `trial_type` values and note any data inconsistency found

## 4. My Dogs simplification

- [x] 4.1 In `BrowseDogsPage.tsx`, for exhibitor-only users: omit `viewMode`/`onViewModeChange` from `ListControls` and always render `DogsGridView`; secretary/admin path unchanged
- [x] 4.2 Remove the "View Dog" action button from dog cards (`DogsGridView.tsx:41-44` / `BrowseCard.tsx:41-52`) while keeping whole-card click, `role="link"`, and Enter-key navigation; audit other `BrowseCard` consumers for `actionLabel` reliance before changing the shared component
- [x] 4.3 Update/extend `BrowseDogsPage` and `BrowseCard` tests: exhibitor sees no toggle, card navigates on click/Enter, secretary table intact

## 5. Dog Details tabs

- [x] 5.1 Remove Activity from `DogDetailsTabs.tsx:66-108`; render `ActivityTab` content as a titled section below the tab panel; default tab → Registrations (both exhibitor and secretary tab sets)
- [x] 5.2 Update DogDetails tests: tab list contents, default selection, activity section presence

## 6. Add-a-Dog wizard

- [x] 6.1 Move the "Color & Markings" field from `BasicInfoTab.tsx:185-193` to `AdditionalInfoTab.tsx`; move its rule out of Essentials validation (`AddDogPanel/validation.ts:90`) so Essentials completes without it
- [x] 6.2 Replace `AddEditRegistrationDialog` usage inside `AddDogPanel/index.tsx` with a slide-out (`SlideOverPanel`/`EditPanelWrapper` panel variant) hosting the same form body writing to wizard state; verify layering/focus over the wizard panel
- [x] 6.3 Update wizard tests: essentials validation without color, registration add via slide-out still lands in wizard state

## 7. Ringside passcode bypass

- [x] 7.1 In `AtShowAccessGate.tsx`, gate the passcode prompt on authentication: signed-in users without grant/role/entry get the signed-in explanatory state (`:91-119` path), never the passcode form (`:121-150`); anonymous and `?passcode=1` flows unchanged
- [x] 7.2 Ensure the gate waits for RBAC role resolution before rendering restricted/passcode states (no staff flash); add tests for: authed-no-entry, anonymous, staff-while-loading

## 8. My Shows order-centric cards

- [x] 8.1 Rework grouping in `useMyEntriesData.ts:78-98`: group by `registrationId` (fallback show+dog for null); card model = order header (show, date, confirmation, payment status/total) + per-dog class lists
- [x] 8.2 Update `MyEntryCard` to render grouped dogs in a wrapping grid capped at `xl:grid-cols-5` (no horizontal overflow); derive the single next action across the order (payment > check-in > view) reusing the existing precedence and check-in mutation path
- [x] 8.3 Unit tests for the new grouping: multi-dog single order → one card; null-registration entries preserved; class-count conservation across regroup; next-action precedence across dogs
- [x] 8.4 Verify against `exhibitor-my-shows-legibility` scenarios still in force (collapsed-by-default, 44px targets, reassurance copy) on phone/desktop viewports

## 9. Verification & ship

- [x] 9.1 `pnpm typecheck` and `pnpm lint` clean across the monorepo
- [x] 9.2 `cd apps/myk9show && pnpm test` — full unit suite green (rerun `--failed` once for known flaky AskQPanel test before diagnosing)
- [ ] 9.3 Browser pass in dev server: My Shows grouping, My Dogs cards, dog details tabs, wizard flow, Find Shows dropdown + Scent Work filter, Ringside link as signed-in exhibitor, sidebar name, photo dialog in dark mode
- [ ] 9.4 Open PR, run Codex review (behavior-changing UI), pass CI, merge from the main repo directory, verify branch/worktree cleanup
- [ ] 9.5 Sync delta specs (`/opsx:sync`), archive the change, and update any tracking docs/Linear issue referencing the exhibitor audit
