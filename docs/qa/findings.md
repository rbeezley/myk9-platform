# QA Findings Registry

Durable index for proactive QA findings. Use this for bugs found by `qa-feature`, `audit-pages`, `harden`, browser walks, Playwright traces, and future QA scripts.

## Status Values

- `open`: confirmed and not fixed.
- `in-progress`: fix is underway.
- `fixed`: fixed and proof has passed.
- `deferred`: accepted risk or out of scope for the current sprint.

## Finding Lifecycle

1. Create a finding only when the issue is reproducible or has durable evidence.
2. Keep the finding in `Open Findings` while the issue is unresolved, even if a fix is being attempted.
3. Set status to `fixed` only after the `Proof required` command or manual replay passes.
4. Move fixed findings to `Closed Findings` in the same change that records the proof result.
5. If the issue is intentionally not fixed, set status to `deferred` and keep the reason in `Notes`.
6. If a finding is noisy or stale, either refresh the evidence or close it as superseded; do not let unowned findings accumulate.

## Flake Budget

Active Nightly specs are trusted only while they stay reliable. Track repeated Nightly failures in `docs/qa/nightly-history.md`.

- A single failure opens or updates a finding with the failed command and trace/screenshot path.
- Two failures for the same active spec within 14 days mark it `test-flake` unless a product bug is proven.
- Below roughly 95% pass rate over the last 14 scheduled runs, demote the spec from `Nightly Active` to `Nightly Candidates / Repair Queue` in `docs/qa/e2e-suite-map.md`.
- Re-promote only after the spec passes alone and in the full active Nightly command with `--retries=0`.

## Severity Values

- `blocker`: prevents a target role from completing a core workflow.
- `high`: user-facing workflow failure, silent failure, data loss risk, or role/RLS mismatch.
- `medium`: confusing, stale, inaccessible, or missing feedback but workaround exists.
- `low`: polish, noisy warning, or low-risk inconsistency.

## Pattern Values

Use the closest existing pattern before inventing a new one:

- `silent-no-op`
- `missing-feedback`
- `missing-loading-state`
- `hidden-validation`
- `validation-visible-mismatch`
- `role-scope-empty`
- `role-rls-mismatch`
- `mutation-stale-cache`
- `swallowed-error`
- `stale-derived-state`
- `broken-navigation`
- `console-error`
- `network-error`
- `mobile-layout-break`
- `accessibility-gap`
- `test-flake`

## Finding Template

Copy this block for each new finding.

```markdown
### QA-<PATTERN>-###

- **Status:** open
- **Severity:** high
- **Role:** exhibitor | secretary | judge | steward | admin | all
- **Surface:** route/component/file
- **Suite category:** pr-smoke | nightly | feature-audit | manual-debug | candidate-delete | none
- **Pattern:** silent-no-op
- **Detected by:** qa-feature | audit-pages | harden | Playwright | manual | script
- **Evidence:** code reference, trace path, screenshot path, console/network output, or reproduction steps
- **User impact:** what the user experiences in plain English
- **Intent check:** which role feeling is harmed or preserved
- **Fix owner:** file/module area
- **Proof required:** exact test, command, or manual replay required before closing
- **Notes:** optional context, linked PR, migration number, or deferral reason
```

## Open Findings

### QA-TEST-FLAKE-004

- **Status:** open
- **Severity:** medium
- **Role:** secretary
- **Surface:** `apps/myk9show/src/test/e2e/registration/entryCreationCore.spec.ts`, `apps/myk9show/src/test/e2e/registration/singleDogSingleClass.spec.ts`, `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`
- **Suite category:** nightly
- **Pattern:** test-flake
- **Detected by:** Playwright
- **Evidence:** 2026-05-21 active Nightly command failed after `40 passed`, `3 failed`, and `2 did not run`. Failures were `entryCreationCore.spec.ts:64` timed out inside `page.evaluate` while importing/using `useEntryStore`, `singleDogSingleClass.spec.ts:110` could not find seeded dog `Bravo` in the mail-in registration wizard, and `critical-path.spec.ts:63` timed out on the sign-in deep link to `/secretary/register/:showId`. Evidence paths include `apps/myk9show/test-results/registration-entryCreation-9764e-tus-through-workflow-states-chromium/error-context.md`, `apps/myk9show/test-results/registration-singleDogSing-28b55--dog-and-one-selected-class-chromium/error-context.md`, and `apps/myk9show/test-results/uat-secretary-critical-pat-bc2f8-g-and-reach-class-selection-chromium/error-context.md`.
- **User impact:** Nightly cannot currently prove the secretary registration/payment path reliably. Focused `registrationUI.spec.ts --grep "searches for a non-owned dog"` passed in isolation, so this may be sequence pollution rather than a product-wide dog-search outage.
- **Intent check:** Harms the secretary target feeling of "That was easy" if it reflects real registration instability; harms QA trust if it is only suite order/state leakage.
- **Fix owner:** registration Playwright fixtures, secretary mail-in registration flow, and entry-store browser test coverage.
- **Proof required:** Focused reruns of the three failed specs alone, then the full active Nightly Playwright command from `docs/qa/e2e-suite-map.md` with `--retries=0`.
- **Notes:** Do not demote yet unless this repeats within 14 days or the focused proof shows the active specs are no longer trustworthy.

### QA-CONSOLE-ERROR-005

- **Status:** open
- **Severity:** medium
- **Role:** secretary
- **Surface:** `/secretary/entries/:showId` and `/secretary/reports`
- **Suite category:** none
- **Pattern:** console-error
- **Detected by:** audit-pages
- **Evidence:** 2026-05-21 route-health sweep logged `[ERROR] [secretary] Error loading entries: {stack: undefined}` on `/secretary/entries/4584f257-19b5-4016-aae6-5e7827b769cb` at 375px and `/secretary/reports` at 1280px. The route sweep otherwise rendered those pages.
- **User impact:** Secretary routes render, but entry-backed data may be missing or stale without a clear user-facing explanation.
- **Intent check:** Harms the secretary target feeling of calm control because the page appears usable while entry loading fails in the background.
- **Fix owner:** `apps/myk9show/src/hooks/useEntryManagementData.ts` and entry query/RLS path behind `getEntriesForShow`.
- **Proof required:** Focused route-health replay for `/secretary/entries/:showId` and `/secretary/reports` at desktop and 375px with no console errors or owned 4xx/5xx responses.
- **Notes:** Left open because the failure may involve query shape or RLS and needs a narrower investigation.

## Closed Findings

### QA-CONSOLE-ERROR-007

- **Status:** fixed
- **Severity:** low
- **Role:** admin
- **Surface:** `/admin/permissions`
- **Suite category:** none
- **Pattern:** console-error
- **Detected by:** audit-pages
- **Evidence:** 2026-05-21 route-health sweep logged repeated React duplicate-key warnings on `/admin/permissions` at desktop and 375px. Browser console args identified the repeated key as a generated RBAC role key.
- **User impact:** Admin permissions page rendered, but repeated React key collisions could cause unstable list identity or duplicated/omitted rows.
- **Intent check:** Preserves admin confidence by removing noisy, low-level render instability from a permission-management surface.
- **Fix owner:** `apps/myk9show/src/services/rbac/PermissionChecker.ts`, `apps/myk9show/src/pages/admin/permissions/PermissionManagementPage.tsx`
- **Proof required:** Passed on 2026-05-21 with focused browser replay of `/admin/permissions`: `errors=0 duplicateKey=0`.
- **Notes:** Fixed by including role scope in generated user-role row IDs so scoped assignments keep stable React identity.

### QA-NETWORK-ERROR-006

- **Status:** fixed
- **Severity:** low
- **Role:** public
- **Surface:** `/shows/:id`
- **Suite category:** none
- **Pattern:** network-error
- **Detected by:** audit-pages
- **Evidence:** 2026-05-21 route-health sweep logged Supabase `406` responses on public `/shows/4584f257-19b5-4016-aae6-5e7827b769cb` at desktop and 375px from `postgrestGetShowById`.
- **User impact:** Public show detail rendered, but the background detail query generated avoidable 406 network noise that can mask real route-health failures.
- **Intent check:** Preserves the exhibitor/public browsing experience by keeping show-detail loading quiet when a detail row is not visible.
- **Fix owner:** `apps/myk9show/src/services/database/shows/reads.postgrest.ts`
- **Proof required:** Passed on 2026-05-21 with focused browser replay of `/shows/4584f257-19b5-4016-aae6-5e7827b769cb` at 1280px and 375px: both passed with no owned 4xx/5xx responses.
- **Notes:** Fixed by changing the detail lookup from `.single()` to `.maybeSingle()` while keeping the existing `PGRST116` compatibility branch for tests.

### QA-NETWORK-ERROR-003

- **Status:** fixed
- **Severity:** high
- **Role:** secretary
- **Surface:** `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx` / `/secretary/shows/:showId`
- **Suite category:** feature-audit
- **Pattern:** network-error
- **Detected by:** qa-feature
- **Evidence:** Reproduced on 2026-05-20 with `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts --project=chromium --workers=1 --timeout=90000 --retries=0`. The Secretary Show Workbench rendered, but browser health captured `404 GET https://sojmvhhwsjxmfistvzbe.supabase.co/rest/v1/show_incidents?...` from the Incident Log/Incident Closeout queries. The migration file exists at `supabase/migrations/20260519163003_create_show_incidents.sql`, so the linked environment appears to be missing the table or REST exposure.
- **User impact:** Secretaries see incident-related workbench cards backed by a failing request, so show-day incident logging/closeout cannot be trusted until the table is available in the environment.
- **Intent check:** Harms the secretary target feeling of "That was easy" because a calm show-day page is quietly failing while loading incident data.
- **Fix owner:** Supabase migration/deployment for show incidents.
- **Proof required:** Passed on 2026-05-20 after applying pending migrations: `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts --project=chromium --workers=1 --timeout=90000 --retries=0` (`2 passed`).
- **Notes:** Fixed by applying `supabase/migrations/20260519163003_create_show_incidents.sql` to the linked Supabase project after explicit user approval. `supabase/migrations/20260518120000_add_entry_payment_method.sql` was an unrelated pending prerequisite discovered by the dry run, so it was applied in the same approved DB push but was not the root cause of this finding.

### QA-ROLE-RLS-MISMATCH-002

- **Status:** fixed
- **Severity:** medium
- **Role:** admin
- **Surface:** `apps/myk9show/src/test/e2e/entities/showCRUD.spec.ts` / show delete feature-audit proof
- **Suite category:** feature-audit
- **Pattern:** role-rls-mismatch
- **Detected by:** qa-feature
- **Evidence:** Reproduced on 2026-05-15 with `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/showCRUD.spec.ts --grep "delete a show" --project=chromium --workers=1 --timeout=90000 --retries=0`. Direct browser-context evidence showed `admin@myk9t.com` returns `is_site_admin() = true` and `is_platform_admin() = true`; `createShow` succeeds, then `deleteShow` fails with Postgres `42501 new row violates row-level security policy for table "shows"`. Follow-up evidence showed the existing `soft_delete_show` RPC rejected admin-created draft shows with `club_id = null` as `Show not found`.
- **User impact:** The feature-audit suite could not prove show soft-delete behavior. Admin-created draft shows without a club could not be cleaned up through the app-layer soft-delete path.
- **Intent check:** Restores the admin/secretary expectation that show-management actions are predictable and explainable.
- **Fix owner:** show database writes / show CRUD feature-audit setup / show RLS policy evidence.
- **Proof required:** Passed on 2026-05-15: `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/showCRUD.spec.ts --grep "delete a show" --project=chromium --workers=1 --timeout=90000 --retries=0` (`1 passed`).
- **Notes:** Fixed by routing app-layer show soft delete through the existing `soft_delete_show` RPC, applying `supabase/migrations/20260515110000_fix_shows_soft_delete_rls.sql`, and applying `supabase/migrations/20260515113000_fix_soft_delete_show_null_club.sql` so site admins can soft-delete draft shows without `club_id`.

### QA-TEST-FLAKE-001

- **Status:** fixed
- **Severity:** medium
- **Role:** secretary
- **Surface:** `apps/myk9show/src/test/e2e/uat/secretary/disposable-entry.spec.ts` / `/secretary/entries/:showId`
- **Suite category:** nightly
- **Pattern:** test-flake
- **Detected by:** Playwright
- **Evidence:** 2026-05-13 Nightly command passed 24/25 active tests, then timed out in `secretary can find, assign armband, accept, and check in a disposable entry` at `expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible`. Error context showed the Entry Management page eventually rendered with no selected show. Attachment paths: `apps/myk9show/test-results/uat-secretary-disposable-e-b1800-check-in-a-disposable-entry-chromium/error-context.md` and `apps/myk9show/test-results/uat-secretary-disposable-e-b1800-check-in-a-disposable-entry-chromium/attachments/uat-finding-f5b976e70efcece8df9f855dea9a722d482c1170.md`.
- **User impact:** Nightly cannot currently prove the disposable-entry secretary workflow end to end; if this is product behavior rather than test timing, a secretary may not land on the expected seeded show from an Entry Management deep link.
- **Intent check:** Harms the secretary target feeling of "That was easy" if the page opens without the intended show context.
- **Fix owner:** secretary Entry Management route/data selection and UAT seed/deep-link proof.
- **Proof required:** Passed focused proof on 2026-05-13: `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/uat/secretary/disposable-entry.spec.ts --project=chromium --workers=1 --timeout=90000 --retries=0` (`1 passed`). Passed promotion proof on 2026-05-13: full active Nightly command from `docs/qa/e2e-suite-map.md` with `--retries=0` (`25 passed`).
- **Notes:** Root cause was stale local replicated show data preventing `/secretary/entries/:showId` from selecting a valid deep-linked show. Fixed by falling back to server reads on missing show cache data and by resolving URL show ids directly when the selector list is stale.
