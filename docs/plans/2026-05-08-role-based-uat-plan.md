# Role-Based UAT Automation Plan

## Summary

Create a phased user acceptance testing plan and automation suite for `myK9Show` covering the three requested roles:

- Secretary: "That was easy"
- Exhibitor: "This respects my time"
- Site Admin: "The platform is healthy"

Primary UAT runs locally against disposable seeded data. A smaller smoke pass runs against staging after local success. The suite should use Playwright plus browser-preview/computer-use walks so failures produce both machine assertions and human-readable evidence.

[EXPANDED] Execute UAT one role at a time. Each role phase must run, produce findings, fix all blocking/high-priority issues, re-run cleanly, and receive a phase signoff before moving to the next role.

[ADDED] The first implementation milestone is a repeatable critical-path harness, not broad regression. The harness must be safe to rerun: every data-changing step either creates records with a unique `uat_<timestamp>_<role>` marker or uses read-only existing data.

[ADDED] Use one dedicated feature branch/worktree for the full UAT rollout, preferably `codex/role-based-uat`. Fix blockers and high-priority issues as they are discovered inside the active role phase; defer only low-priority polish items to the findings report/backlog.

## Key Changes

- Add a dedicated Playwright UAT folder, likely `apps/myk9show/src/test/e2e/uat/`.
- Add shared UAT helpers for:
  - signing in as secretary, exhibitor, and site admin
  - creating uniquely named disposable UAT shows, dogs, entries, and admin records
  - collecting screenshots, traces, console errors, failed network requests, and acceptance notes
  - cleaning up test-created records where feasible
- [ADDED] Add a setup manifest written to `test-results/uat/manifest-<run-id>.json` that records every created entity id, source role, and cleanup status.
- [ADDED] Add a UAT report writer that produces `test-results/uat/findings-<run-id>.md` with role, journey, pass/fail, blocker, artifact links, and recommended owner.
- Use browser preview/computer-use for a human-readable verification pass after automated runs:
  - open local app
  - walk one successful path per role
  - capture visible evidence/screenshots
  - record blockers as UAT findings, not silent test failures
- [ADDED] Treat browser-preview/computer-use as an evidence pass, not the source of truth for assertions. Playwright owns pass/fail; browser preview confirms the experience matches role intent and captures screenshots stakeholders can inspect.

## Phase Workflow

Each role phase follows the same loop:

1. Run that role's automated Playwright UAT locally.
2. Run the browser-preview/computer-use evidence pass for that role.
3. Write findings to `test-results/uat/findings-<run-id>.md`.
4. Fix all blockers and high-priority issues found in that role's journey.
5. Add or update unit/component tests for any fixed pure logic, hooks, or components.
6. Re-run the same role phase until it passes locally.
7. Run that role's staging smoke pass if staging credentials/data are available.
8. Mark the role phase complete in this plan or the active tracking document before starting the next role.

Do not start the next role while the current role has unresolved blockers or high-priority UAT findings.

## [ADDED] Branch and Fix Workflow

- Create one dedicated feature branch/worktree for the UAT rollout: `codex/role-based-uat`.
- Keep the UAT automation, role findings, and ordinary fixes in that same branch so each phase can be re-run against the exact code under review.
- Fix blockers and high-priority issues immediately during the active role phase.
- Add or update tests with each fix before re-running that role's UAT.
- Record every issue in the role findings report, even if fixed during the same phase.
- Defer only low-priority polish, copy, or non-blocking UX issues to the findings report/backlog.
- Split a bug into a separate branch/PR only when it is large, risky, or unrelated enough that it would slow the active UAT phase.
- Do not move to the next role until the current role has no unresolved blockers/high-priority findings and its UAT phase passes.

## Role Phases

### Phase 1: Secretary UAT

Goal: prove the show-management path feels easy and complete for the highest-stress role before validating downstream users.

Status: Complete for local Phase 1 signoff. Automated local Secretary UAT passes for the read-only critical path, disposable entry management path, and screenshot evidence pass. Covered dashboard, show wizard readiness, mail-in search/class-selection readiness, entry management controls, waitlist access, armband assignment, entry acceptance, check-in, cleanup, reports categories, and visible evidence screenshots.

Latest local result, 2026-05-08:

- `cd apps/myk9show && .\node_modules\.bin\playwright.cmd test src/test/e2e/uat/secretary --project=chromium --retries=0`
- Result: 7 passed.
- Focused regression: `cd apps/myk9show && ..\..\node_modules\.bin\vitest.cmd run src/hooks/__tests__/useEntryManagementActions.test.ts`
- Result: 1 passed.
- Fixed during Phase 1: secretary entry management imported the wrong `assignArmband` implementation, causing manual armband assignment to send the armband number as a UUID. The hook now uses the secretary entry-management writer.
- Evidence note: the Codex in-app browser preview plugin was blocked in this session because the Node REPL backend resolved to Node `v22.12.0` while the plugin requires `>= v22.22.0`. A Playwright evidence pass was added instead and attaches screenshots for dashboard, entry management, waitlist, and reports.
- Evidence screenshots saved under `apps/myk9show/test-results/uat/evidence/`.
- Known run noise: Vite dependency scan can report unresolved `mermaid` and `@react-pdf/renderer`, but this did not block the Secretary UAT run.

- Sign in as `secretary@myk9t.com`.
- Create or select a disposable UAT show.
- Configure show basics, trials/classes, entry fee, and opening/closing dates.
- Register an exhibitor's dog through `/secretary/register/:showId`.
- Manage entries through `/secretary/entries/:showId`.
- Verify pending, accepted, waitlist, armband assignment, and reports access.
- Acceptance: the secretary can complete the core show-management flow without dead ends, confusing errors, or excess steps.
- [ADDED] Failure handling: if disposable show setup fails, stop the secretary journey, record the setup error in findings, and do not continue against shared seed data.
- [ADDED] Edge checks: verify empty/pending/accepted/waitlist states render with clear labels and that no routine secretary action exposes a technical error message.

Phase gate:

- Secretary local UAT passes. Complete.
- Browser-preview evidence confirms the journey supports "That was easy." Substituted with Playwright screenshot evidence because the in-app browser plugin is blocked by local Node runtime version.
- All secretary blockers/high-priority findings are fixed and re-run. Complete.
- Any affected tests pass. Complete.

### Phase 2: Exhibitor UAT

Goal: validate the exhibitor path only after secretary-created show/entry setup is stable.

- Sign in as `exhibitor1@myk9t.com`.
- Browse shows at `/shows`.
- Open show details.
- Register owned dog(s) through `/shows/:showId/register`.
- Confirm payment/entry agreement path without using real payment capture.
- Verify the entry appears in `/my-entries` and the show detail "My Entries" context.
- Acceptance: the exhibitor can find, enter, and verify an entry quickly with prefilled/owned dog data.
- [ADDED] Failure handling: if the exhibitor has no eligible owned dog or the target disposable show is not open for entries, record a blocked UAT finding with the missing prerequisite instead of silently switching to another account.
- [ADDED] Edge checks: verify the no-dogs/closed-entry states are understandable and that duplicate-entry prevention is surfaced calmly.

Phase gate:

- Exhibitor local UAT passes.
- Browser-preview evidence confirms the journey supports "This respects my time."
- All exhibitor blockers/high-priority findings are fixed and re-run.
- Any affected tests pass.

### Phase 3: Site Admin UAT

Goal: validate oversight and admin health after user-facing secretary/exhibitor flows are stable.

- Use a dedicated non-owner site-admin test account if available; otherwise require `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`.
- Access `/admin/dashboard`.
- Verify platform summary cards load.
- Walk `/admin/users`, `/admin/permissions`, `/admin/templates`, and `/admin/alerts`.
- Perform only disposable/non-destructive admin mutations locally, such as creating a temporary role/template if supported.
- Keep staging smoke read-only unless explicitly approved.
- Acceptance: admin can see system health, reach key management surfaces, and complete safe standard operations.
- [ADDED] Failure handling: if site-admin credentials are unavailable, skip the admin journey with an explicit blocked status and do not use the owner's personal account in automation.
- [ADDED] Security check: verify secretary and exhibitor accounts cannot access `/admin/dashboard` or the admin child routes in this UAT scope.
- [ADDED] Edge checks: verify admin dashboard loading/error states and that user/template search handles no-result states without crashing.

Phase gate:

- Site-admin local UAT passes, or is explicitly blocked only by missing admin test credentials.
- Browser-preview evidence confirms the journey supports "The platform is healthy."
- All site-admin blockers/high-priority findings are fixed and re-run.
- Any affected tests pass.

### Phase 4: Final Cross-Role Smoke

Goal: confirm the role-by-role fixes still work together.

- Run the secretary, exhibitor, and site-admin smoke subset locally.
- Run staging smoke for all available roles.
- Verify no fix for a later role regressed a signed-off earlier role.
- Produce one final UAT summary report with phase status, unresolved low-priority findings, screenshots, and staging smoke results.

## [ADDED] Data, Security, and Recovery Rules

- Disposable data must use a per-run id and must not overwrite shared seed records.
- Cleanup should run in `afterEach` and again in a best-effort final cleanup pass using the manifest.
- If cleanup fails, the test should mark the run as "passed with cleanup debt" only when assertions passed; the manifest must list the unremoved ids.
- Staging smoke is read-only by default. Any staging mutation requires explicit approval in that session, even if the local UAT allows it.
- Never commit real passwords. Site-admin credentials must come from `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`, or the admin journey is blocked.
- The implementation must avoid broad service-role use in browser tests. If service-role setup is needed, keep it in Node-side Playwright setup helpers and never expose it to the page.

## Test Execution

- Local full UAT:
  - `pnpm dev:show`
  - secretary phase: `cd apps/myk9show && npx playwright test src/test/e2e/uat/secretary --project=chromium`
  - exhibitor phase: `cd apps/myk9show && npx playwright test src/test/e2e/uat/exhibitor --project=chromium`
  - site-admin phase: `cd apps/myk9show && npx playwright test src/test/e2e/uat/site-admin --project=chromium`
  - final smoke: `cd apps/myk9show && npx playwright test src/test/e2e/uat/smoke --project=chromium`
  - include tablet viewport for secretary and exhibitor critical paths
- Staging smoke:
  - run the same UAT smoke subset with `PLAYWRIGHT_BASE_URL=https://myk9-platform-myk9show.vercel.app`
  - staging mutations must use disposable records only and avoid shared-system admin changes unless approved
- Evidence output:
  - Playwright HTML report
  - traces on retry
  - screenshots on failure
  - browser-preview screenshots for one pass per role
  - concise UAT findings table: role, journey, pass/fail, blocker, screenshot/trace path, owner
- [ADDED] Environment prerequisites:
  - local `.env`/`.env.local` must point to the intended Supabase project
  - secretary and exhibitor seeded accounts must authenticate before data setup starts
  - site-admin env credentials are required for the admin journey
  - Playwright should fail fast if the dev server cannot start or the base URL returns a non-app page
- [ADDED] Operational notes:
  - run each role's local UAT before that role's staging smoke
  - fix and re-run the active role before moving to the next role
  - archive each UAT report directory by run id
  - do not retry a hanging run for more than 30 seconds without reporting the hang, per project test guidance

## Testing Phase

- Unit tests are not required for the UAT plan itself unless new helper logic becomes complex.
- Add focused tests for helper utilities if they parse URLs, generate cleanup manifests, or classify findings.
- [ADDED] Add helper-level tests for run-id generation, manifest append/update, finding classification, and cleanup debt reporting.
- The UAT suite must fail on:
  - login failure
  - protected route access failure for the intended role
  - visible app crash or console page error
  - missing critical controls
  - failed entry/show/admin workflow assertion
  - unexpected 4xx/5xx from app-owned Supabase/API requests
  - leaked admin route access for secretary or exhibitor
  - disposable setup producing records without the current run marker
- The UAT suite must record but not necessarily fail on:
  - minor visual polish concerns
  - copy concerns
  - slow-but-successful paths
  - staging-only seed drift
- [ADDED] Manual acceptance pass:
  - after Playwright passes locally, use browser preview to walk one secretary, exhibitor, and site-admin happy path
  - record whether each path matches the role intent from `docs/INTENT.md`
  - attach screenshots to the UAT findings report

## Assumptions

- Full UAT targets `myK9Show`; `myK9Q` is out of scope for secretary, exhibitor, and site-admin role acceptance.
- Use disposable seeded data for local runs.
- Use both tiers: full local run, then staging smoke.
- First version covers critical paths, not broad regression.
- [ADDED] Role order is Secretary, then Exhibitor, then Site Admin, then final cross-role smoke.
- Site-admin automation needs a dedicated test admin account; if none exists, the implementation should require `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` in local/staging env.
- [ADDED] The implementation may add package scripts for convenience, but should not replace the existing `test:e2e` command behavior.
- [ADDED] Existing older E2E specs may be referenced for selectors and helper patterns, but the UAT suite should not depend on stale aspirational specs as acceptance truth.
