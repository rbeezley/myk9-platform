# Overnight Launch-Readiness Sweep

**Date:** 2026-06-28
**Auditor:** Codex
**Scope:** Route/page inventory, secretary/show-day UX consolidation, offline-critical architecture scan, documentation readiness, and focused verification sampling.
**Worktree:** `codex/overnight-launch-sweep`

## Executive Summary

The best overnight value is not broad refactoring. The useful work is evidence gathering, stale-doc cleanup, and a small number of high-signal follow-up tasks.

Overall launch posture is better than the backlog text implies: the route layer already redirects many older secretary surfaces into canonical show-scoped pages. `/secretary/entries/:showId?` lands on `/shows/:showId/entry-management`, `/secretary/day-of` lands on `/shows/:showId/show-desk`, and standalone report/results routes recover to the dashboard when no show context exists.

The remaining risks are concentrated in four areas:

1. Authenticated E2E route sweeps were blocked by rejected E2E credentials during the audit run; the immediate credential reset has since passed focused secretary verification.
2. Documentation tracking is stale compared with captured screenshot evidence.
3. The suite map references a deleted Playwright spec.
4. Show Map move-up/undo writes Entry lifecycle fields directly through the replicated table, while the domain glossary says Entry status transitions belong behind the lifecycle module.

## Scope Notes

This sweep did not mutate shared systems. The only live browser check that required escalation was local Playwright/Vite port binding. No database push, deploy, GitHub write, or external-service write was performed.

Because authenticated E2E credentials were rejected during the initial audit pass, the browser route audit could only prove public routes. The secretary group failed fast before route assertions, which matches the open QA finding. After the audit, the E2E Auth accounts were reset with the repo setup script, and the focused secretary route-health sample passed.

## Secretary/Show-Day UX Audit

### Pass 1: Mental Model Alignment

**What UI suggests:** Secretaries should start from cross-show triage, then enter a show-scoped workbench for operational work.

**What it actually does:** The current route model mostly supports this. Secretary dashboard remains cross-show; show operations live under `/shows/:showId/*`; legacy links redirect into the show-scoped surface when possible.

**Misalignment gaps:**

| UI Element                   | User Expects                                                 | Actually Does                                                                                                                                                            | Severity |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Waitlist documentation route | A show-specific waitlist page                                | Shot list and outline name `/secretary/waitlist/:showId`, but route code only defines `/secretary/waitlist` and redirects to dashboard                                   | High     |
| Volunteer scheduling         | Show-specific setup/personnel work inside the show workbench | `/secretary/volunteers` still renders as a standalone secretary route                                                                                                    | Medium   |
| Paper scoring routes         | One ringside scoring mental model                            | `/at-show` and `/scoring/classes/:classId/entries` both exist; this may be justified by mobile ringside vs paper-scoring flows, but the docs should name the distinction | Medium   |

**Jargon found:** `pending closeout`, `electronic-submission`, and raw route/source-map terms appear mostly in docs, not necessarily in UI. Keep them out of customer-facing guides.

### Pass 2: Information Architecture

**Current structure:**

- Cross-show secretary triage: `/secretary/dashboard`
- Show-scoped management: `/shows/:showId/setup`, `/show-desk`, `/entry-management`, `/reports`, `/results-control`, `/submit-results`
- Legacy secretary aliases: `/secretary/day-of`, `/secretary/run-order`, `/secretary/entries/:showId?`
- Ringside/scoring: `/at-show/:showId/...`, `/scoring/classes/:classId/entries`
- Standalone secretary support pages: `/secretary/messages`, `/secretary/volunteers`, `/people`

**IA issues:**

| Issue                      | Location                                                                                       | Problem                                                                                                               | Recommendation                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale waitlist route       | `docs/training/screenshot-shot-list.md:53`, `apps/myk9show/src/routes/secretaryRoutes.tsx:313` | Docs say a waitlist page is ready, but the route redirects to the dashboard.                                          | Decide whether waitlist is folded into Entry Management or should be restored as a show-scoped route. Then update guides and shot list.                               |
| Standalone volunteer route | `apps/myk9show/src/routes/secretaryRoutes.tsx:321`                                             | Personnel/setup work still has a separate page while the consolidation plan pushes setup concerns into the workbench. | Prefer a deep-link from Setup tools to this route only if the standalone page remains the canonical personnel surface. Otherwise fold it into `/shows/:showId/setup`. |
| Page directory gaps        | `docs/user-guides/workflow-source-map.md:15`                                                   | Workflow map lists sidebar routes missing from `pageDirectory.ts`.                                                    | Add the missing route entries or remove the gap list if it is stale.                                                                                                  |

**Visibility problems:**

- Hidden but should be visible: E2E credential breakage blocks route-health confidence but is not surfaced in launch readiness docs.
- Prominent but should be secondary: `docs/user-guides/README.md` still emphasizes pending captures after the shot list marks many captures complete.

### Pass 3: Affordance Clarity

**Affordance audit:**

| Element                               | Looks Like             | Actually Is                                                                                           | Clear?              |
| ------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| `/secretary/entries/:showId?`         | Old page URL           | Redirect to canonical show entry management                                                           | Yes                 |
| `/secretary/day-of`                   | Old page URL           | Redirect to canonical Show Desk                                                                       | Yes                 |
| `/secretary/waitlist`                 | Working secretary page | Redirect to dashboard                                                                                 | No                  |
| `/shows/:showId?phase=show-desk` shot | Show Desk deep-link    | Route inventory prefers `/shows/:showId/show-desk`; old query-style links have history as a fixed bug | Medium clarity risk |

**False affordances:** Waitlist route documentation says the surface is ready, but the route does not render the waitlist page.

**Hidden affordances:** The successful consolidation redirects are not reflected clearly in the guides. A reader may still think old secretary routes are separate pages.

**Recommended fixes:**

- Make the waitlist decision explicit in `workflow-source-map.md`: canonical route, folded surface, or deferred.
- Replace query-style Show Desk screenshot route with `/shows/:showId/show-desk` where possible.

### Pass 4: Cognitive Load

**Decision points:**

| Screen/Step            | Decisions Required                                              | Can Be Reduced?                                                                                                 |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Secretary day-of start | Dashboard, setup, show desk, entry management, reports, results | Mostly reduced already by show-scoped sections. Keep legacy routes as redirects only.                           |
| Waitlist docs          | Is waitlist a page, tab, or dashboard redirect?                 | Yes. Pick one canonical concern and delete/update the other references.                                         |
| Scoring docs           | Is scoring in `/at-show` or `/scoring`?                         | Yes. Name `/at-show` as live ringside and `/scoring` as paper/secretary scoring, if that is the intended split. |

**Missing defaults:**

- Documentation index should default to the latest shot-list truth.
- Authenticated route-health should default to explicit credential-repair instructions when sign-in fails.

**Unnecessary complexity:**

| Complexity                                        | Who Needs It              | Recommendation                                                   |
| ------------------------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| Multiple historical secretary paths in docs       | Maintainers only          | Customer docs should document canonical show-scoped routes only. |
| `qa-draft` index text with obsolete capture notes | Documentation owners only | Keep current status notes short and current.                     |

**Cognitive load score:** Medium. The product route model is converging; the documentation layer still makes the workflow look more fragmented than it is.

### Pass 5: State Coverage

### Secretary Route Recovery

| State                   | Implemented? | Quality | Issue                                                                                              |
| ----------------------- | ------------ | ------- | -------------------------------------------------------------------------------------------------- |
| Empty/no selected show  | Yes          | Good    | `SecretaryNoContextRedirect` sends old standalone report/results routes to dashboard with a toast. |
| Loading show context    | Yes          | Good    | Redirect helpers render `LoadingSkeleton`.                                                         |
| Success/canonical route | Yes          | Good    | Entry and day-of aliases redirect to show-scoped pages.                                            |
| Error/auth credentials  | Partial      | Poor    | E2E route-health fails before page assertions when credentials are rejected.                       |

**Dead ends found:** `/secretary/waitlist` route is documented as ready but redirects to the dashboard.

**Missing error handling:** The docs/QA system does not yet treat rejected E2E credentials as a launch-readiness gate even though it blocks authenticated page evidence.

### Pass 6: Flow Integrity

**Primary flow tested:** Code-level secretary routing and focused route-health sample.

**Step-by-step findings:**

| Step | Action                                | Friction                                                            | Severity |
| ---- | ------------------------------------- | ------------------------------------------------------------------- | -------- |
| 1    | Resolve `/secretary/entries/:showId?` | Redirects to `/shows/:showId/entry-management` and preserves search | None     |
| 2    | Resolve `/secretary/day-of`           | Redirects to `/shows/:showId/show-desk` when show context exists    | None     |
| 3    | Resolve `/secretary/waitlist`         | Redirects to dashboard despite docs marking waitlist shot ready     | High     |
| 4    | Run public route-health               | Passed                                                              | None     |
| 5    | Run secretary route-health            | Blocked by rejected E2E credentials                                 | High     |

**Abandonment risks:**

- A documentation author following S-10 cannot capture the stated waitlist page.
- Authenticated route sweeps will keep failing before testing product pages until E2E credentials are repaired.

**Recovery gaps:**

- Missing back/undo: none found in this sweep.
- No cancel option: not assessed in browser due auth blocker.
- Destructive with no confirm: not assessed in browser due auth blocker.

**Flow verdict:** Completable with friction. The route architecture is mostly sound, but verification is blocked and docs overstate readiness.

## Prioritized Findings

### Critical

No new Critical product issue was confirmed. The public route-health sample passed, and authenticated route-health stopped at credentials rather than a product route failure.

### High Priority

| Finding                                                       | Evidence                                                                                                                                                                             | Impact                                                                                                          | Effort                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Rerun full authenticated route sweeps after credential repair | Initial secretary route-health failed with `E2E sign-in rejected credentials for e2e-secretary@test.myk9.com`; after resetting E2E Auth users, focused secretary route-health passed | Full authenticated evidence across secretary, exhibitor, judge, club-admin, and admin still needs a broad rerun | Low                                         |
| Fix stale waitlist route/documentation mismatch               | Route code redirects `/secretary/waitlist` to dashboard, while shot list marks `/secretary/waitlist/:showId` ready                                                                   | Authors cannot verify the secretary guide; users may be told to use a nonexistent page                          | Low if docs-only, Medium if restoring route |
| Remove stale missing Playwright spec from E2E suite map       | `pnpm qa:e2e-map:check` fails on `apps/myk9show/src/test/e2e/playwright-real-auth.spec.ts`                                                                                           | Keeps QA inventory red and weakens trust in the suite map                                                       | Low                                         |
| Review Show Map move-up lifecycle seam                        | `showMapActionMutations.ts` writes `entry_status='moved'`, creates confirmed move-up entries, and restores status directly through replicated table updates                          | Possible divergence from the canonical Entry lifecycle interface and audit expectations                         | Medium                                      |

### Medium Priority

| Finding                                            | Evidence                                                                                                                                         | Impact                                      | Effort        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------- |
| Reconcile guide index with shot-list truth         | Guide README says screenshots/J captures are pending; shot list marks E-01...E-17 and J-01...J-06 captured                                       | Documentation appears less ready than it is | Low           |
| Close or update page-directory gap list            | Workflow source map lists `/admin/users`, `/admin/payouts`, `/people`, `/exhibitor/payments`, `/club-admin/*` as missing from `pageDirectory.ts` | Docs publication gates remain unclear       | Low to Medium |
| Revisit standalone `/secretary/volunteers` surface | Route still renders standalone while setup/personnel work appears to belong under show setup                                                     | Potential workflow fragmentation            | Medium        |
| Clarify `/at-show` vs `/scoring` in docs           | Both live routes exist for scoring-like work                                                                                                     | Users may not know which surface to use     | Low           |

### Low Priority

| Finding                                 | Evidence                                                                                                                                | Impact                                             | Effort         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------- |
| File-size/churn follow-up remains valid | `ShowDetailsPage.tsx` is 893 lines and highest churn; `RegistrationWizardPage.tsx` is 846 lines; `EntryManagementPage.tsx` is 499 lines | Maintainability risk, but not a new launch blocker | Medium to High |
| Screenshot account names drift          | Shot list still includes old `secretary@myk9t.com`, `club@myk9t.com`, and notes that some named accounts are stale                      | Capture instructions may waste time                | Low            |

## Architecture Scan

### Deepening Opportunities

1. **Files:** `apps/myk9show/src/features/show-map/showMapActionMutations.ts`, `apps/myk9show/src/services/database/entries/lifecycle.ts`, `apps/myk9show/src/services/database/day-of-operations/move-up.ts`
   **Problem:** Show Map move-up owns significant Entry lifecycle behavior directly: status update to moved, creation of a confirmed destination Entry, rollback, and undo. The day-of module, by contrast, routes comparable status transitions through the lifecycle module. This is a potential shallow seam: callers must know which Entry transitions are lifecycle-backed and which are Show Map-specific.
   **Solution:** Explore whether lifecycle should expose an offline-first adapter for move-up/undo or whether `CONTEXT.md` should explicitly bless Show Map as the replicated move-up adapter.
   **Benefits:** Better locality for Entry transition rules and stronger leverage from lifecycle tests.

2. **Files:** `apps/myk9show/src/pages/ShowDetailsPage.tsx`, `apps/myk9show/src/routes/publicRoutes.tsx`, show-management child pages.
   **Problem:** The public show details page is both a public/exhibitor page and the parent for secretary/club-admin show management sections. It is high-churn and 893 lines.
   **Solution:** Keep the route model, but deepen the show-management interface behind smaller route-section modules. Do not split into a new page tree unless the user experience demands it.
   **Benefits:** More locality for public vs management behavior while preserving the consolidated show URL.

3. **Files:** `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`, `apps/myk9show/src/features/show-map/ShowDeskAdaptiveHeader.tsx`, `apps/myk9show/src/features/show-map/ShowDeskPanel.tsx`
   **Problem:** Pending-review counts and review actions now appear as links into Entry Management, which is good. The risk is that counts and filters diverge again as both surfaces evolve.
   **Solution:** Keep Entry Management canonical and route all Show Desk pending-review actions through shared count/filter helpers.
   **Benefits:** Better leverage from one Entry review interface and better locality for count bugs.

## Documentation Readiness

### Current State

- `docs/user-guides/README.md` still says the Secretary and Exhibitor guides have screenshots pending and Ringside Quickstart has J-01...J-06 plus access-paths diagram pending.
- `docs/training/screenshot-shot-list.md` marks E-01...E-17 captured, J-01...J-06 captured, and `at-show-access-paths` drawn.
- `docs/user-guides/documentation-qa-checklist.md` still requires a non-author reviewer before final verification.

### Recommended Docs Patch Set

1. Update `docs/user-guides/README.md` notes to match the shot list.
2. Fix or remove S-10 waitlist screenshot row until the route exists.
3. Update the Ringside Quickstart status note: screenshots captured; diagram source may still be pending if draw.io source is required.
4. Add page-directory entries for workflow-source-map gaps or remove stale gap claims.
5. Keep all guides at `qa-draft` until the non-author reviewer is named and auth-backed live route checks can run.

## Verification Results

| Command                                                                                                                                                                                    | Result                                                                      | Notes                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm qa:doc-staleness:strict`                                                                                                                                                             | Passed                                                                      | No documented routes changed in this branch.                                                               |
| `pnpm qa:e2e-map:check`                                                                                                                                                                    | Failed                                                                      | Missing suite-map target: `apps/myk9show/src/test/e2e/playwright-real-auth.spec.ts`.                       |
| `npx vitest run src/features/show-map/__tests__/showMapActionMutations.test.ts src/features/show-map/__tests__/showMapActions.test.ts src/features/show-map/__tests__/ShowMapTab.test.tsx` | Passed                                                                      | 79 tests passed.                                                                                           |
| `npx vitest run src/features/admin-help/__tests__/pageDirectory.test.ts src/routes/routeRegistry.test.ts`                                                                                  | Passed                                                                      | 13 tests passed.                                                                                           |
| Public route-health Playwright sample                                                                                                                                                      | Passed                                                                      | `route-health-by-role.spec.ts --grep "Route health: public"` passed in 14.7s after local port escalation.  |
| Secretary route-health Playwright sample                                                                                                                                                   | Failed before route assertions during audit; passed after credential repair | Initial run rejected `e2e-secretary@test.myk9.com` credentials in 6.9s. Post-repair rerun passed in 21.2s. |

## Recommended Next Work

1. **First PR:** Fix QA inventory/doc drift only.
   - Remove the missing `playwright-real-auth.spec.ts` suite-map entry.
   - Update guide README screenshot notes.
   - Fix the waitlist route row in shot list and guide outline.
   - No app tests needed beyond `pnpm qa:e2e-map:check`, `pnpm qa:doc-staleness:strict`, and markdown formatting.

2. **Second task:** Rerun authenticated route-health after E2E credential repair.
   - E2E Auth users were reset after the audit; focused secretary route-health now passes.
   - Rerun full `route-health-by-role.spec.ts` to restore broad authenticated route evidence.

3. **Third task:** Review Show Map move-up lifecycle ownership.
   - Duplication question: does this duplicate the Entry lifecycle module? If yes, why is duplication justified instead of an offline-first lifecycle adapter?
   - Start with tests around move-up audit, rollback, and cross-surface status agreement before changing behavior.

4. **Fourth task:** Decide the volunteer and waitlist canonical surfaces.
   - If folded into existing pages, update redirects/docs.
   - If standalone, add show context and page-directory entries.

## Open Questions

1. Is `/secretary/waitlist` intentionally retired in favor of Entry Management, or should a show-scoped waitlist page exist?
2. Is Show Map move-up intentionally separate from the lifecycle module because it must be fully offline-first?
3. Should `/secretary/volunteers` remain standalone through launch, or become a Setup deep-link?
4. Who will serve as the non-author reviewer for secretary and exhibitor guide verification?
