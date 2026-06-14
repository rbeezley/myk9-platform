# Dog CRUD E2E Test Design

**Date:** 2026-02-25
**Status:** Approved

## Goal

Verify full CRUD lifecycle for dogs via Claude Preview, following the same pattern used for club CRUD testing (2026-02-23). Find and fix any bugs discovered during testing.

## Approach

Sequential CRUD lifecycle on a single dog entity: CREATE, EDIT, DELETE, then edge case checks. Bugs fixed inline.

## Test Flow

### Phase 1: CREATE

1. Navigate to Dogs page, click "Add Dog"
2. Fill all 3 tabs of AddDogPanel:
   - **Basic Info:** call name ("Buddy Test"), gender (Male), DOB (2022-03-15), owner
   - **Registration:** AKC, number "DN12345678", breed "Golden Retriever", status Active
   - **Additional Info:** color ("Golden"), weight ("65"), height ("23"), microchip ("985112345678901"), spayed/neutered (Yes), notes
3. Save and verify redirect to new dog detail page
4. Verify all fields display correctly
5. Check console and network for errors

### Phase 2: EDIT

1. Click Edit on the dog
2. Modify fields across tabs: call name to "Buddy Updated", weight to "68", toggle spayed/neutered to No, add second registration
3. Save and verify changes on detail page
4. Reload page to confirm data survives round-trip (not just local cache)

### Phase 3: DELETE

1. Trigger delete from dog header
2. Confirm in DeleteDogDialog
3. Verify dog removed from sidebar
4. Verify navigation to another dog or empty state

### Phase 4: Edge Cases & Polish

1. Open AddDogPanel fresh -- verify no stale validation errors on mount
2. Test dropdown/select portals for CSS clipping
3. Check avatar rendering with no photo (no `src=""` console errors)
4. Test `?add=true` query param flow (inline creation from person page)

## Verification Strategy

- `preview_snapshot` after create/edit to confirm field values
- `preview_eval` with `window.location.reload()` then re-snapshot for persistence check
- `preview_console_logs` after every major action (zero errors expected)
- `preview_network` with `filter: "failed"` (zero failed requests expected)
- `preview_screenshot` for visual proof at key milestones
- `preview_inspect` for CSS concerns (overflow, clipping)

## Known Risk Areas

| Risk | Why | Verification |
|------|-----|--------------|
| spayedNeutered field | Recently added (commits 54d2731, 9620b90) | Verify persists through create/edit/reload |
| Registration sync | Separate `dog_registrations` table, async sync | Verify registrations appear after create/edit |
| Owner field | Admin-only, hidden for regular users | Check visibility and persistence |
| Photo as base64 | Stored as data URI in `imageUrl` column | Test upload and display |
| Dual measurement fields | String vs number mapping in dogMappers | Verify weight/height round-trip |
| DogProfileEditDialog deleted | Commit 13277e0 removed it | Verify no dead references |

## Success Criteria

- All 4 phases pass with zero console errors and zero failed network requests
- Every field entered in create is visible on detail page and survives page reload
- Edit changes persist through round-trip
- Delete removes dog from list and navigates cleanly
- Any bugs found are fixed, documented, and pass typecheck + lint

## Key Files

- `apps/myk9show/src/pages/DogDetailsPage.tsx`
- `apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx`
- `apps/myk9show/src/components/panels/edit/DogEditPanel.tsx`
- `apps/myk9show/src/components/dogs/common/DeleteDogDialog.tsx`
- `apps/myk9show/src/components/dogs/DogDetailsMain/index.tsx`
- `apps/myk9show/src/services/mappers/dogMappers.ts`
- `apps/myk9show/src/services/database/queries/dogQueries.ts`
