# myK9Show CRUD Audit — Handoff for Next Session

**Date:** 2026-02-19
**Context:** Completed first CRUD audit pass. Starting next session with cross-entity flow audit + flagged items cleanup.

## What Was Done

Systematic audit of all 7 CRUD entities in myK9Show using phased parallel agents. **65 structural issues found and fixed**, committed as `fc7d346`, pushed to GitHub.

- **Phase 1:** People (9 fixes), Dogs (10 fixes), Clubs (13 fixes)
- **Phase 2:** Shows (6 fixes), Trials (10 fixes)
- **Phase 3:** Classes (9 fixes), Entries (8 fixes)
- **Validation:** typecheck + build + lint all pass

Full details in [2026-02-19-myk9show-crud-audit-report.md](2026-02-19-myk9show-crud-audit-report.md).

## What to Do Next

### Task 1: Cross-Entity Flow Audit

Trace the full end-to-end workflows that span multiple entities. The first audit fixed each entity's CRUD in isolation, but the handoffs between entities weren't tested. This is where integration bugs hide.

**Flows to trace:**

1. **Show setup flow:** Create Club → Create Show (wizard) → Add Trials → Add Classes from templates
   - Does the show wizard correctly associate with a club?
   - Do trials created within a show pass the correct `showId`?
   - Does class template creation within a trial pass the correct `trialId`?

2. **Dog registration flow:** Create Person → Create Dog (with owner link) → Browse Shows → Register Dog in Class → View in My Entries
   - Does dog creation correctly link to the owner person?
   - Does the registration workflow pass `dogId`, `classId`, `personId` correctly?
   - Does the entry appear on MyEntriesPage after creation?

3. **Day-of-show flow:** Check-in Entry → Update Class Status → Score (if applicable)
   - Does check-in update propagate to the class detail view?
   - Does class status change ("In Progress", "Completed") cascade correctly?

4. **Secretary management flow:** View all entries for a show → Edit entry → Change status → Delete entry
   - Does the secretary view load entries across all classes/trials?
   - Do secretary edits use the correct store/query path?

**Approach:** Use agents to trace each flow through code (not in isolation per entity, but following the data as it crosses entity boundaries). Fix integration issues found.

### Task 2: Flagged Items Cleanup

The first audit flagged ~35 items. Many are code-fixable without needing real data. Prioritized list:

**Dead code removal:**
- `apps/myk9show/src/hooks/useDogs.ts` — mock-data hook, not imported
- `apps/myk9show/src/hooks/queries/useDogsQuery.ts` — wraps legacy service, not imported
- `apps/myk9show/src/services/dogsService.ts` — legacy mock service
- `apps/myk9show/src/components/dogs/AddDogDialog.tsx` — only in tests
- `apps/myk9show/src/components/dogs/OptimisticAddDogDialog.tsx` — not imported
- `apps/myk9show/src/hooks/queries/useShowsQuery.ts` — mock-based, not imported
- `apps/myk9show/src/components/shows/ShowDetails/dialogs/AddTrialDialog.tsx` — stub
- `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditTrialDialog.tsx` — stub
- `apps/myk9show/src/components/trials/EditTrialDialog.tsx` — unused, pages use TrialEditPanel
- `apps/myk9show/src/components/users/PersonEditDialog.tsx` — legacy, not used in primary flows
- `apps/myk9show/src/components/clubs/EditClubDialog.tsx` — not imported by active code

**Hardcoded/mock data to address:**
- `useRoleBasedData.ts` has hardcoded email-to-person mapping (dev scaffolding)
- `ClubAdminService` uses `MOCK_USERS` entirely
- Show statistics hardcoded (classes = trials * 8, trends are static strings)
- Trial statistics use hardcoded judge count (2) and fake qualified rate (75%)

**Store/architecture cleanup:**
- `deleteEntryLegacy` is sync-only (should be removed or migrated to async `deleteEntry`)
- Registration workflow (`showRegistrationStore.submitRegistration`) is local-only (simulates delay, no real API call)
- ClassCreationPage wizard only writes to local Zustand, not Supabase

**Approach:** Use agents to clean up dead code files and fix the most impactful mock/hardcoded items. Lower-priority architectural items can wait for dogfooding feedback.

## Key Files

- **Audit report:** `docs/plans/2026-02-19-myk9show-crud-audit-report.md`
- **Audit design:** `docs/plans/2026-02-19-myk9show-crud-audit-design.md`
- **Dogfooding checklist:** Bottom of the audit report

## Execution Notes

- The phased parallel agent approach worked well (3 phases, 7 agents total, zero file conflicts)
- Each agent ran its own typecheck; combined typecheck between phases caught one unused variable
- Build and lint pass clean after all fixes
- Cross-entity audit (Task 1) should NOT be parallelized — flows are sequential by nature; use 4 agents, one per flow
- Flagged items cleanup (Task 2) CAN be parallelized — dead code removal is independent per file
