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

None.

## Closed Findings

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
