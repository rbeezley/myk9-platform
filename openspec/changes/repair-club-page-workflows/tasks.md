## 1. Evidence and Scope Inventory

- [ ] 1.1 Reproduce `QA-CLUB-TABS-038` and `QA-CLUB-PAYMENTS-041` with assertion-first `userEvent` pointer/keyboard tests, confirm each test is red, and identify whether the failure is local composition or a shared Tabs/Button primitive before editing production code.
- [ ] 1.2 Inventory the live club row, `club-admin` role, permissions and role-permission links, and the affected user-role scope assignment in one read-only query pass; record whether the stale scope is seed/config data and do not mutate a shared database without a separate approval gate.
- [ ] 1.3 [ADDED] If the inventory proves a shared role/seed correction is required, create a separately scoped follow-up issue with evidence, approval, and rollback gates; do not hide that mutation inside this client repair.
- [ ] 1.4 Confirm the existing public `clubs_select` policy and table-specific `replicatedClubsTable.sync()` path support guest reads, and document any discrepancy before changing the client path.
- [ ] 1.5 Recheck active `interaction-state-components` and `unified-financial-dashboard` changes before implementation; keep this change out of broad primitive migration and financial-dashboard scope.

## 2. Validated Club-Admin Context

- [ ] 2.1 [EXPANDED] Add a pure validated-club-context selector that deduplicates scope IDs and has focused tests for one valid scope, one live plus one stale scope, duplicate scopes for one club, zero live scopes, multiple distinct live scopes, loading, and populated-but-not-refreshed inputs; prove it never falls back to the first club when context is ambiguous.
- [ ] 2.2 [EXPANDED] Add the smallest hook/state adapter needed to combine role scope with replication-backed club readiness, preserving existing authorization boundaries and keeping online context non-actionable until the current-session freshness check settles.
- [ ] 2.3 Update `UnifiedAppLayout` and `unifiedSidebarConfig` to build `My Club` labels and destinations only from validated context, with focused shell/sidebar tests proving unchecked scope IDs never become links.
- [ ] 2.4 [EXPANDED] Update the existing club-admin members and payments entry points to use the same context, render access-configuration guidance when validation settles without exactly one live club, distinguish ambiguous multiple-live-scope guidance, and render retryable access-verification guidance without trusting cache when freshness fails or times out.

## 3. Public Club Replica Readiness

- [ ] 3.1 [EXPANDED] Add an idempotent cache-first club readiness operation to `clubStore` that loads IndexedDB, performs only the table-specific club sync once per online client session or when the cache is empty, a requested club ID is absent, or retry is explicit, reloads the cache, records successful freshness, deduplicates remote sync, applies the existing 15-second network timeout to caller-visible waiting, evaluates each caller's postcondition, and preserves cached data on failure/timeout.
- [ ] 3.2 [EXPANDED] Add store tests for guest empty-cache success, first-session refresh with populated cache, successful zero-club response, offline cached success, requested-ID-missing from a populated cache, rejection, timeout with fake timers, explicit retry after the underlying sync settles, concurrent callers with different requested IDs, and proof that unrelated tables are not synchronized.
- [ ] 3.3 [EXPANDED] Update `useBrowseClubsData` and its retry path to use the shared readiness operation; add hook/page tests for cache-first background refresh, loading, populated, successful-empty, cached, timed-out, and unavailable states.
- [ ] 3.4 [EXPANDED] Update `ClubDetailPage` to pass the requested ID into readiness and render distinct available, unavailable, and in-page not-found outcomes with a canonical `/clubs` link; add route tests proving a populated stale cache is synchronized before not-found, valid guest URLs do not redirect, and loading always terminates.

## 4. Club Profile and Contact Integrity

- [ ] 4.1 Repair the proven club tab activation layer so pointer and keyboard activation update `?tab=`, selected trigger, and panel together; keep the fix local unless the red primitive test proves a shared Tabs defect.
- [ ] 4.2 [EXPANDED] Make statistic cards accessible buttons with visible focus state, Enter/Space activation, and the same canonical tab setter; normalize unavailable URL tab values to the default available tab and add focused tests for pointer, keyboard, semantics, and URL behavior.
- [ ] 4.3 [EXPANDED] Normalize email, phone, and website destinations in one reusable helper, accept only `http:`/`https:` website schemes, and add unit coverage for undefined, null-like, whitespace-only, bare host, fully qualified, and unsupported/executable-scheme values.
- [ ] 4.4 Update `ClubHeader` and `AboutTab` to omit contact actions without usable destinations and omit an otherwise empty options menu while preserving edit, branding, and delete permissions; add component tests for partial and absent contact data.

## 5. Payment Checklist Integrity

- [ ] 5.1 Repair the proven payment checklist activation layer so `Connect payment account` opens the existing checklist and `Not now` closes it under real pointer and keyboard activation, without changing the checklist copy or its `// INTENT:` contract.
- [ ] 5.2 Extend `ClubPaymentsCard` tests to assert `startConnectOnboarding` is called zero times while opening/postponing, exactly once from `Continue to Stripe`, remains single-flight, and exposes the existing retryable error on rejection.
- [ ] 5.3 If and only if task 1.1 proves a shared Button defect, add primitive-level regression coverage, make the minimal shared fix, and reconcile the diff with `interaction-state-components` before proceeding.

## 6. Browser and App Verification

- [ ] 6.1 [EXPANDED] Add a dedicated read-only `apps/myk9show/src/test/e2e/club-surface-integrity.spec.ts` covering guest `/clubs`, valid/invalid `/clubs/:id`, authenticated profile tabs/stat cards, validated `My Club` navigation, and the payment checklist; use pointer/keyboard actions, do not activate `Continue to Stripe` or any database mutation, fail closed if the seeded read-only role/club context is unavailable, and classify the new suite in `docs/qa/e2e-suite-map.md` in the same change.
- [ ] 6.2 Re-walk the five findings at desktop and 375px widths, check console/runtime errors and horizontal overflow, and capture evidence for each acceptance scenario.
- [ ] 6.3 [ADDED] Verify failed public club synchronization emits one sanitized event through the existing logging service while guest-facing copy excludes internal error details.
- [ ] 6.4 [EXPANDED] Run `pnpm --dir apps/myk9show exec vitest run src/store/clubStore.readiness.test.ts src/hooks/__tests__/useValidatedClubContext.test.tsx src/hooks/__tests__/useBrowseClubsData.test.tsx src/pages/__tests__/BrowseClubsPage.test.tsx src/pages/__tests__/ClubDetailPage.test.tsx src/components/clubs/ClubDetails/__tests__/ClubDetails.interactions.test.tsx src/components/clubs/ClubDetails/__tests__/contactDestinations.test.ts src/components/clubs/ClubDetails/__tests__/ClubHeader.test.tsx src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts src/features/payments/__tests__/ClubPaymentsCard.test.tsx`; stop and report if the runner hangs for more than 60 seconds.
- [ ] 6.5 [EXPANDED] Run `pnpm --filter @myk9/show typecheck`, `pnpm --filter @myk9/show lint`, `pnpm --dir apps/myk9show test:e2e:clean src/test/e2e/club-surface-integrity.spec.ts --project=chromium --workers=1 --retries=0`, and `pnpm qa:e2e-map:check`; confirm the E2E suite remains read-only before execution.

## 7. Evidence, Review, and Merge Gate

- [ ] 7.1 Update `docs/qa/club-pages-audit-2026-07-18.md` and close `QA-CLUB-TABS-038`, `QA-CLUB-ROLE-SCOPE-039`, `QA-CLUB-PUBLIC-040`, `QA-CLUB-PAYMENTS-041`, and `QA-CLUB-CONTACT-042` in `docs/qa/findings.md` only after recording passing automated and browser evidence.
- [ ] 7.2 Run `pnpm openspec validate repair-club-page-workflows`, review the final diff for scope creep, and verify every spec scenario has implementation evidence.
- [ ] 7.3 Open the implementation PR with the Linear issue and OpenSpec change linked, include checked acceptance criteria, test/browser evidence, risks, intentional non-goals, and any separately owned data correction.
- [ ] 7.4 Keep the Linear issue open through required CI, code review, current-main reconciliation, and merge; mark it Done only after the evidence gate passes, then archive the OpenSpec change and complete branch/worktree cleanup.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The work crosses authorization-derived navigation, offline/public replication readiness, possible shared controls, and a payment setup surface, requiring focused tests, app checks, and browser evidence before merge.
