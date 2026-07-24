## 1. Execution Contract and Overlap Control

- [x] 1.1 Link [MYK9-71](https://linear.app/myk9-platform/issue/MYK9-71/complete-the-exhibitor-journey-and-premium-entitlement-experience) to `exhibitor-journey-completion`, attach the audit and OpenSpec, and record the four implementation slices and evidence gates.
- [ ] 1.2 Treat MYK9-71 as the parent contract and create/link one PR-sized child Linear issue for each implementation slice in sections 2, 3, 4, 5, and 6, plus the section 8 compatibility cleanup, before starting that slice.
- [ ] 1.3 Re-read `docs/INTENT.md`, the audit, proposal, design, all four delta specs, and the linked Linear acceptance criteria before editing code.
- [ ] 1.4 Rebase on current `main`, inspect the final state of `improve-exhibitor-entries-scan`, `unified-financial-dashboard`, and related exhibitor remediation, and remove or narrow any task already satisfied there.
- [ ] 1.5 Inventory every current Premium route/component/hook, legacy Dog Details tab URL, entitlement caller, Stripe/account surface, `people`/`exhibitor_profiles`/RBAC table, and User Management mutation path; save the inventory in the implementation PR or an OpenSpec note.
- [ ] 1.6 Capture baseline free and complimentary-Premium screenshots and console/network evidence at 390x844, 834x1112, tablet landscape, and 1280x800 using the audit persona without creating a paid Stripe subscription.

## 2. Slice 1 — Premium Record Integrity

- [x] 2.1 Add assertion-first failing tests proving empty Pedigree and Health submissions invoke no mutation and mutation failures preserve the open form and its entered values.
- [x] 2.2 Replace programmatic submit-event dispatch in Pedigree and Health add/edit dialogs with native form association or `requestSubmit()`, add TypeScript validation, and close/reset only after confirmed mutation success.
- [x] 2.3 Add a date-only helper test matrix for UTC, `America/Chicago`, month/year boundaries, and round-trip edit display, then replace touched `new Date('YYYY-MM-DD')` paths.
- [x] 2.4 Add failing Health filter tests for search, type, year, combined filters, and filter-specific empty state, then wire the controls to real state and clear-filter recovery.
- [x] 2.5 Verify Slice 1 with focused Pedigree, Health form, date-helper, and Health filter tests plus `pnpm typecheck` and `pnpm lint`.
- [x] 2.6 Open the Slice 1 PR with the audit findings, red-to-green evidence, risk, how to test, and explicit non-goals; wait for CI/review, resolve findings, and merge before starting dependent layout work.

## 3. Slice 2 — Dog Workspace Consolidation and Responsive Records

- [x] 3.1 Add navigation tests for default Overview, Career/Records secondary views, all legacy tab mappings, copied deep links, Back/Forward behavior, lock discovery, and upgrade-return state.
- [x] 3.2 Refactor `DogDetailsTabs` into Overview, Career, and Records using existing feature components and hooks; render Activity only on Overview and remove the duplicate Title Progress sidebar teaser/card where it repeats Career.
- [x] 3.3 Add container-aware secondary navigation that remains labeled, keyboard operable, and unclipped at the four audited viewport classes.
- [x] 3.4 Add responsive tests/source guards and implement Health header/filter/action reflow inside constrained Dog Details content containers.
- [x] 3.5 Add Pedigree relationship-order tests and implement wide tree plus narrow Parents/Grandparents grouped layouts with equivalent add/view/edit/delete actions.
- [x] 3.6 Add Title Progress and Statistics tests for locked, loading, error/retry, empty, and source-grounded populated states without demonstration data.
- [x] 3.7 Add Training Journal accessibility and deletion-recovery tests, then label fields/toolbars/delete controls and implement confirmation or mutation-backed Undo with failure restoration.
- [x] 3.8 Implement route-entry focus/scroll behavior for dog-card navigation, secondary deep links, and browser Back restoration with focused navigation tests.
- [x] 3.9 Verify Slice 2 with focused Dog Details, Title Progress, Statistics, Health, Training, and Pedigree tests; `pnpm typecheck`; `pnpm lint`; and browser checks at all four viewport classes in light and dark modes.
- [x] 3.10 Open the Slice 2 PR with before/after screenshots and accessibility evidence; wait for CI/review, resolve findings, and merge.

## 4. Slice 3A — Entitlement Grant Data and Authorization

- [x] 4.1 Inventory `roles`, `permissions`, `role_permissions`, site-admin helpers, `people`, `exhibitor_profiles`, and legacy `early_adopter_until` rows in one evidence pass before writing the migration.
- [x] 4.2 Add assertion-first SQL/source tests for admin-only grant-row reads, sanitized own-context reads, denied direct writes, denied non-admin RPC calls, required reason/date validation, truthful expired/revoked/superseded history, non-overlapping grants, paid-subscription isolation, concurrent requests, server-time boundary evaluation, and Premium create/update authorization.
- [x] 4.3 Add the `subscription_entitlement_grants` table, history/status fields, constraints, indexes, explicit Data API `GRANT`s (`GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`; no `anon` grant) alongside admin-only row RLS, sanitized server-evaluated entitlement-context/helper functions, and platform-admin grant/revoke/explicit-replace RPC behavior with target-row locking and active-range overlap prevention.
- [x] 4.4 Backfill every non-null `early_adopter_until` value as a founding grant without changing its end date, retain the legacy field for compatibility, and add a migration parity query.
- [ ] 4.5 Regenerate Supabase TypeScript types and add typed wrappers for the sanitized own-entitlement context, admin grant history, grant, and revoke operations.
- [ ] 4.6 Apply the server entitlement helper to Health, Training, Pedigree, and Premium manual-result create/update authorization without weakening ownership; add direct-API tests proving free/Analytics-trial-only/expired/revoked callers cannot create or edit, non-owners cannot act, owners retain read/delete access, and existing Health/Training export or report actions remain available.
- [ ] 4.7 Run migration/source tests, local database replay where available, `pnpm qa:rls-smoke`, focused wrapper tests, `pnpm typecheck`, and `pnpm lint`.
- [ ] 4.8 Record query plans and bounded timings for entitlement context, admin history, and Premium mutation checks using a high-history account fixture; add or adjust indexes if the plan shows repeated scans.
- [ ] 4.9 Open the additive migration PR with forward/rollback instructions and query plans for owner/admin lookups; wait for CI/security review, resolve findings, and merge without pushing a linked database.
- [ ] 4.10 Obtain explicit shared-system approval, deploy the additive migration to staging, and record evidence for backfill parity, admin authorization, non-admin denial, natural expiry history, explicit supersession, active-range overlap prevention, direct Premium-write denial, concurrent grant serialization, and unchanged Stripe rows.

## 5. Slice 3B — Unified Entitlement and Admin Experience

- [ ] 5.1 Add pure resolver/hook tests for paid, founding, complimentary, Analytics-scoped trial, free, expired, multiple-source precedence, server-time boundary timestamps, bounded stale access, scheduled expiry invalidation, focus/reconnect refresh, loading, refresh failure, and no-trusted-result failure.
- [ ] 5.2 Implement the sanitized server-context-backed entitlement resolver and one account-scoped React Query hook, remove caller-provided trial counts while preserving the Analytics-only trial boundary, retain the last trusted result only until `trustedUntil`, schedule boundary invalidation, and add structured legacy-fallback mismatch logging.
- [ ] 5.3 Add User Management tests for admin-only visibility, target eligibility, required end date/reason, grant/revoke confirmation, failure preservation, history, refetch, and disabled repeat submission.
- [ ] 5.4 Add the Complimentary Premium control to the existing `UserEditPanel` using the authorized RPC; do not add a page or direct table mutation.
- [ ] 5.5 Refactor Subscription to compose effective access with Stripe billing details, remove hardcoded usage and unavailable invoice links, and test paid, complimentary, founding, trial, expired, free, loading, and error states.
- [ ] 5.6 Make Pricing entitlement-aware and test that active sources receive the correct current-access action while free/expired users retain the real checkout path.
- [ ] 5.7 Remove or configure placeholder footer phone/address/social/help/legal items and reconcile `docs/future/exhibitor-premium.md`, `docs/roles/exhibitor.md`, and operations guidance with the five shipped capabilities and admin grant workflow.
- [ ] 5.8 Verify Slice 3B with focused resolver/hook, User Management, Subscription, Pricing, Footer, and every gate-consumer test; `pnpm typecheck`; `pnpm lint`; and staging browser transitions across free, Analytics-scoped trial, complimentary Premium, expiry while open/refresh failing, and revoked free.
- [ ] 5.9 Open the Slice 3B PR with authorization evidence and screenshots; wait for CI/security/product review, resolve findings, and merge.

## 6. Slice 4 — Core Exhibitor Trust Contracts

- [ ] 6.1 Reproduce the audit's My Shows `$150 due` versus My Payments `$0` contradiction with an assertion-first fixture using the same entry/payment rows, then identify which caller diverges from the canonical amount-due selector.
- [ ] 6.2 Reuse the existing `exhibitor-money-clarity` selector and scope labels so My Shows and My Payments agree for zero due, online due, pay-at-show, refund, waived, pending-review-paid, loading, and error states.
- [ ] 6.3 Add a cross-surface count fixture for orders, dogs, class entries, current entries, and history; reuse existing lifecycle selectors and update labels so every differing count declares its unit and scope.
- [ ] 6.4 Add entry-action tests for editable existing classes, add-only classes, already-entered explanations, newly selected classes enabling Next, post-close contact recovery, and mutation failure.
- [ ] 6.5 Rename or reroute misleading `Add or Change Entries` actions according to actual capability, using the existing edit, add-class, or show-team contact surface without adding a workflow.
- [ ] 6.6 Add a 390px Payments disclosure test and make amount, status, and receipt information discoverable with accessible labels and 44px targets without duplicating the desktop table.
- [ ] 6.7 Verify Slice 4 with focused payment selector/page, count selector/page, entry action/wizard, and mobile Payments tests plus `pnpm typecheck`, `pnpm lint`, and a no-horizontal-overflow browser pass.
- [ ] 6.8 Open the Slice 4 PR with explicit overlap notes for the active entry-scan and financial changes; wait for CI/review, resolve findings, and merge.

## 7. Full Journey Verification and Evidence

- [ ] 7.1 Run all focused test files added or changed by Slices 1–4, then run `pnpm typecheck`, `pnpm lint`, `pnpm build:show`, and `pnpm openspec validate exhibitor-journey-completion --type change --strict --no-interactive`.
- [ ] 7.2 Run database/RLS smoke and entitlement authorization tests against an isolated environment; verify direct grant writes and Premium-record bypasses are denied, RPC authorization, concurrency, backfill parity, server-time expiry, and no Stripe-row mutation.
- [ ] 7.3 Re-walk the elderly/low-tech exhibitor journey at 390x844, 834x1112, tablet landscape, and 1280x800 in light and dark modes for free, complimentary Premium, revoked, expired, paid, and trial states.
- [ ] 7.4 Exercise all five Premium capabilities through invalid input, valid save, edit, delete/undo, empty, loading, error/retry, long content, and deep-link/refresh states; record screenshots and console/network results.
- [ ] 7.5 Verify My Shows, My Payments, Dog Activity, Subscription, and Pricing using one seeded account and record a reconciliation table for amounts, counts, entitlement source, and available action.
- [ ] 7.6 Run an automated accessibility pass plus keyboard-only walkthrough over Dog Details, all Premium forms, Payments mobile disclosure, Subscription/Pricing, and the admin grant control; resolve serious/critical findings.
- [ ] 7.7 Conduct one visible-label-only walkthrough with an elderly or low-tech test user, record confusion and completion evidence, and open follow-up issues for non-blocking findings rather than silently expanding this change.
- [ ] 7.8 Confirm there are no new routes, duplicate dashboards, fake metrics, placeholder links, stale locks, horizontal clipping, console errors, or unhandled mutation failures in scope.
- [ ] 7.9 Review structured entitlement logs and the admin grant-history query for PII-safe visibility of grants, revocations, denials, fallback mismatches, and expiry transitions; add the operational check to the runbook.
- [ ] 7.10 Regress the previously audited but not repeated paths: dog delete/refetch, exhibitor check-in vocabulary, stale-cart recovery, and Developer-menu visibility; record pass evidence or open a blocking follow-up before calling the journey complete.

## 8. Compatibility Cleanup and Rollback Readiness

- [ ] 8.1 Review fallback telemetry and staging/production parity after one compatibility release; do not remove legacy entitlement storage while any active caller or unmatched row remains.
- [ ] 8.2 Add the cleanup migration to remove the `early_adopter_until` fallback, protection trigger, and column, including a preflight query and documented reconstruction rollback from grant history.
- [ ] 8.3 Run clean database replay, regenerated-type checks, entitlement tests, RLS smoke, `pnpm typecheck`, and staging free/Premium/revoked verification against the cleanup migration.
- [ ] 8.4 Obtain explicit shared-system approval before deploying the cleanup migration and record post-deploy parity/authorization evidence.

## 9. Tracking, Final PR Gate, and Archive

- [ ] 9.1 Update the linked Linear issue after each slice with changes, tests, PR, risks, and acceptance-criteria status; keep the launch-readiness goal, Premium docs, audit index, and debt register consistent with actual completion.
- [ ] 9.2 Complete a final diff review against the OpenSpec and audit, remove superseded code/flags/teasers, and confirm every audit finding is closed, delegated to an already-owned active change with evidence, or filed as an explicit follow-up.
- [ ] 9.3 Ensure every implementation PR includes the repository template, Linear link, checked acceptance criteria, visual evidence, risk, how to test, intentional non-goals, material agent involvement, and follow-up issues.
- [ ] 9.4 Wait for final CI and independent review, fix actionable failures, merge every slice, and close the Linear issue only when all evidence gates pass.
- [ ] 9.5 Sync the completed delta specs, archive `exhibitor-journey-completion`, validate the archive, and perform branch/worktree cleanup.
