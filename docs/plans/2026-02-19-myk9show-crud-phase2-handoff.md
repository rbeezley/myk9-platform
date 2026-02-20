# myK9Show CRUD Audit Phase 2 — Handoff for Next Session

**Date:** 2026-02-19
**Context:** Completed cross-entity flow audit + flagged items cleanup. Both tasks from the previous handoff are done. The app is ready for dogfooding.

## What Was Done

### Phase 1 (previous session): Per-Entity CRUD Audit
65 structural issues found and fixed across all 7 entities. Committed as `fc7d346`.

### Phase 2 (this session): Cross-Entity Flow Audit + Cleanup
28 files changed, 136 insertions, 4,099 deletions. Committed as `9570dca`, pushed to `main`.

**Cross-entity fixes (Task 1):**

1. **Wizard ID mismatch (critical)** — `useShowCreationWizardActions.ts` was using client-generated IDs (`wizard-${timestamp}-${random}`) instead of DB-generated UUIDs. Rewrote `createTrials` to be async, await each `addTrialToStore`, and return a `Record<string, string>` mapping wizard IDs to real UUIDs. `saveShow` now captures the `addShow`/`updateShow` return value and uses `realShowId` for all downstream operations.

2. **Race condition eliminated** — Trial creation used a 1-second `setTimeout` before creating classes, racing against async trial creation. Replaced with proper `await` chain: save show → await trials → create classes → navigate.

3. **Entry mapper missing foreign keys** — `classMappers.ts` `mapEntryInputToInsert` was setting `dog_id: null` and had no `show_id`. Added both fields from `EntryInput`. Updated `EntryInput` type in both `class-store-types.ts` and `classStore.types.ts` to include `dogId?` and `showId?`.

4. **Silent persistence failures** — `updateResult` calls in `ClassDetailsPage` and `SecretaryClassDashboard` were missing `await`, so errors were silently swallowed. Added `await` to both.

**Flagged items cleanup (Task 2):**

5. **13 dead code files deleted** (~3,100 lines) — All verified unused via import search before deletion:
   - `useDogs.ts`, `useDogsQuery.ts`, `dogsService.ts`, `AddDogDialog.tsx`, `OptimisticAddDogDialog.tsx`
   - `useShowsQuery.ts`, `AddTrialDialog.tsx` (stub), `EditTrialDialog.tsx` (stub + trials version)
   - `PersonEditDialog.tsx`, `EditClubDialog.tsx`
   - `AddDogDialog.test.tsx`, `dogsService.test.ts` (orphaned tests for deleted files)
   - Removed dead lazy loader reference in `lazyLoading.ts`

6. **Hardcoded statistics replaced with real data:**
   - `ShowDetailsMain.tsx` — `trials * 8` classes, `trials * 32` entries, and static "+12%"/"+8%"/"+15%" trends replaced with real computed values from `useClassStoreCompat`
   - `TrialDetailsPage.tsx` — Hardcoded `judges: 2` replaced with unique judge count from class assignments; `qualifiedRate: 75%` replaced with real computation from entry `status` field

7. **`deleteEntryLegacy` removed** from 6 files — sync-only method that was defined but never called anywhere: `entryStore.ts`, `entryTypes.ts`, `entry-store-types.ts`, `classStore.ts`, `classStore.types.ts`, `class-store-types.ts`, `useEntryStoreCompat.ts`, `useClassStoreCompat.ts`

**Validation:** typecheck, build, lint all pass clean.

## What Remains (Deferred to Dogfooding)

These items were identified during the audit but require either real data testing, architectural decisions, or are lower priority. They should be addressed based on dogfooding feedback.

### Integration gaps (found in cross-entity audit)

- **Dual `EntryStatus` enums** — Class store uses `'Qualified' | 'Not Qualified' | ...` while entry store uses `'confirmed' | 'pending' | ...`. These represent different concepts (competition result vs registration status) but the naming is confusing.
- **Class status doesn't cascade** — Changing a class to "Completed" doesn't update the parent trial or show aggregation. No rollup logic exists.
- **`entry_status_history` table never joined** — DB has a status history table but no query ever loads it. Status history is lost.
- **Secretary RBAC scope** — Secretary dashboard loads data but doesn't validate the user has secretary role for that specific show. RBAC gating is at the route level only.
- **Registration workflow is local-only** — `showRegistrationStore.submitRegistration` simulates a delay but never calls the API. The `AddEntryDialog` uses `RegistrationWorkflow` which goes through this local-only path.
- **`ClassCreationPage` wizard writes only to Zustand** — Classes created via the class creation wizard never reach Supabase. Only the show creation wizard's class creation path is wired to the DB.

### Mock/hardcoded data still present

- **`useRoleBasedData.ts`** — Hardcoded email-to-person mapping (dev scaffolding). Used for role-based filtering but maps specific email addresses to mock person IDs.
- **`ClubAdminService`** — Uses `MOCK_USERS` entirely. Club admin features show fake data.
- **Show/trial statistics** — Now use real class/entry counts, but trend percentages are removed (would need historical data to compute real trends).

### Architectural items

- **Duplicate `EntryInput` types** — Exist in both `class-store-types.ts` and `classStore.types.ts`. These two files define overlapping types for the class store.
- **Dual data layer** — Some entities have both Zustand store and React Query paths. The React Query compat hooks wrap Zustand stores, adding complexity without benefit.
- **Two class stores** — `classStore` (main) and `classCreationStore` (wizard-only, local). The creation store doesn't sync to DB.

## Key Files

- **Phase 1 audit report:** `docs/plans/2026-02-19-myk9show-crud-audit-report.md`
- **Phase 1 handoff:** `docs/plans/2026-02-19-myk9show-crud-audit-handoff.md`
- **Phase 1 design:** `docs/plans/2026-02-19-myk9show-crud-audit-design.md`
- **Dogfooding checklist:** Bottom of the audit report

## Dogfooding Priority

The app is structurally sound for manual testing. Recommended dogfooding order:

1. **Create a show end-to-end** — Club → Show wizard → Trials → Classes. Verify the wizard produces real UUIDs and data persists after page reload.
2. **Register a dog in a class** — Create person + dog, browse shows, attempt registration. This will likely hit the local-only registration workflow — note the gap and decide if it needs a real API path before further testing.
3. **Secretary operations** — Open a show as secretary, view entries, edit entry details, change statuses, delete an entry. Verify persistence.
4. **Day-of-show** — Check in entries, update class status, score entries (via myK9Q if applicable).

## Execution Notes

- Cross-entity audit used 4 parallel Explore agents (one per flow) — worked well, each agent traced a complete flow and returned findings
- Dead code deletion was verified file-by-file with import searches before removal
- The `SyncableEntryData` type (class store) has a `status` field representing competition result, not `competitionData` — this tripped up the statistics fix initially
- Two duplicate `EntryInput` type files needed the same `dogId`/`showId` addition — both must be kept in sync until they're consolidated
