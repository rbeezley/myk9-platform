# Migrate Show Officials to user_roles & Harden Volunteer RLS

**Date:** 2026-03-30
**Status:** Approved
**Scope:** Items 10+11 from TO-DOS.md, expanded to fix the underlying data model

## Problem

Show official assignment (secretary, chairman, chief steward) is stored as plain TEXT fields on the `shows` table (`shows.secretary`, `shows.chairman`, `shows.chief_steward`). This bypasses the RBAC system (`user_roles` table) that was purpose-built for scoped role assignment. Consequences:

1. **No referential integrity** — TEXT fields, not even foreign keys
2. **Single official per role** — one secretary per show; larger events need multiple
3. **RLS can't scope efficiently** — policies must join through `shows` table to check assignment
4. **RBAC bypass** — deactivating a secretary's `user_roles` row doesn't revoke their show-level access because permission checks read `shows.secretary` directly
5. **Volunteer RLS is unscoped** — a secretary for Show A can manage volunteers for Show B because the 6-line inline check only verifies the user has the secretary role globally, not for a specific show

## Solution

Move official assignment into `user_roles` rows with `show_id` scoping. Create helper functions for RLS. Rewrite volunteer policies to be show-scoped.

## Design

### 1. Database Migration

#### New helper functions

```sql
-- Check if current user is secretary for a specific show (or site_admin)
CREATE OR REPLACE FUNCTION is_show_secretary(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        (r.name = 'secretary' AND ur.show_id = check_show_id)
        OR r.name = 'site_admin'
      )
  );
$$;

-- Check if current user holds any official role for a specific show
CREATE OR REPLACE FUNCTION is_show_official(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        (r.name IN ('secretary', 'chairman', 'steward') AND ur.show_id = check_show_id)
        OR r.name = 'site_admin'
      )
  );
$$;
```

#### Data migration

For each show with a non-null `secretary`/`chairman`/`chief_steward` value:

1. Look up `people.id` matching the TEXT value
2. Look up `roles.id` for the corresponding role name
3. Insert `user_roles` row with `(user_id, role_id, show_id, is_active = true)`
4. Skip if no matching person found (stale data)
5. Skip if `user_roles` row already exists (avoid duplicates)

Field-to-role mapping:

- `shows.secretary` → role `secretary`
- `shows.chairman` → role `chairman`
- `shows.chief_steward` → role `steward`

#### Drop columns

After data migration:

```sql
ALTER TABLE shows DROP COLUMN IF EXISTS secretary;
ALTER TABLE shows DROP COLUMN IF EXISTS chairman;
ALTER TABLE shows DROP COLUMN IF EXISTS chief_steward;
```

No denormalized cache. Officials resolved from `user_roles` at read time.

#### Rewrite volunteer RLS

Replace 6 inline secretary/admin checks with helper function calls. Add show-scoping.

```sql
-- volunteers table: secretary must be assigned to this show
DROP POLICY IF EXISTS "Secretary can manage volunteers" ON volunteers;
CREATE POLICY "Secretary can manage volunteers"
  ON volunteers FOR ALL TO authenticated
  USING (is_show_secretary(show_id));

-- volunteer_class_assignments: scope through parent volunteer's show_id
DROP POLICY IF EXISTS "Secretary can manage class assignments" ON volunteer_class_assignments;
CREATE POLICY "Secretary can manage class assignments"
  ON volunteer_class_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.volunteers v
      WHERE v.id = volunteer_id
        AND (SELECT public.is_show_secretary(v.show_id))
    )
  );

-- volunteer_general_assignments: scope through parent volunteer's show_id
DROP POLICY IF EXISTS "Secretary can manage general assignments" ON volunteer_general_assignments;
CREATE POLICY "Secretary can manage general assignments"
  ON volunteer_general_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.volunteers v
      WHERE v.id = volunteer_id
        AND (SELECT public.is_show_secretary(v.show_id))
    )
  );
```

No `WITH CHECK` — Postgres uses `USING` for both when they're identical.

### 2. App Layer — Types & Queries

#### Type changes

Remove from `Show` and `ShowInput` interfaces in `show-types.ts`:

- `secretary: string`
- `chairman: string`
- `chiefSteward: string`

These are no longer properties of a show. They are relationships via `user_roles`.

#### New hook: `useShowOfficials(showId)`

React Query hook that fetches `user_roles` rows where `show_id = showId` and role is secretary, chairman, or steward, joined with `people` for display info.

```typescript
interface ShowOfficial {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: 'secretary' | 'chairman' | 'steward';
}

interface ShowOfficials {
  secretaries: ShowOfficial[];
  chairmen: ShowOfficial[];
  stewards: ShowOfficial[];
}

function useShowOfficials(showId: string | undefined): UseQueryResult<ShowOfficials>;
```

Query key: `['shows', showId, 'officials']`. Cache strategy: `moderate` (5min).

#### Mapper cleanup

Remove secretary/chairman/chief_steward from:

- `showMappers.ts` — `mapShowInputToInsert`, `mapShowInputToUpdate`, `mapDatabaseToShow`, `mapShowToShowInput`
- `ReplicatedShowsTable.ts` — `rowToShow()`, `toSupabaseRow()`
- `showStore.ts` — `replicatedToShow()`, `mergeShowData()`

#### Validation cleanup

Remove secretary/chairman/chiefSteward from:

- `validation.ts` — `showSchemas.basic` and `showSchemas.edit`
- `showCreationWizardValidation.ts`

#### Permission utilities

Replace `show.secretary === userId` checks in:

- `show-relationships.ts` — use `user_roles` query or `has_role` with show scope
- `permissionValidation.ts` — same approach

The `has_role()` function already accepts a `scope_club_id` parameter. For show-scoped checks, use the new `is_show_secretary(show_id)` function at the DB level, or query `user_roles` directly in the app layer.

#### Regenerate Supabase types

After migration, regenerate types. The columns disappear from `Database['public']['Tables']['shows']`.

### 3. App Layer — Wizard, Edit Forms, Display

#### Show Creation Wizard

`ShowDetailsStep` keeps its OfficialPicker UI (person selector for chairman and secretary). Data model changes:

- Wizard state stores selected person IDs in temporary fields (e.g., `officialSelections: { secretary: string[], chairman: string[], steward: string[] }`)
- `useShowCreationWizardActions` writes `user_roles` rows after show creation (it already does this for secretary — extend to chairman and steward)
- `transformWizardDataToShow()` no longer maps secretary/chairman to show fields
- `ReviewStep` reads from wizard's officialSelections state, not show fields

#### Edit Show Dialog / ShowEditPanel

Remove chairman/secretary/chiefSteward form fields from the show edit form. Replace with an "Officials" section that manages `user_roles` rows — add/remove officials with role + person selector. Mutations invalidate the `['shows', showId, 'officials']` query key.

#### ShowOfficials display component

Currently receives `chairmanId`/`secretaryId`/`chiefStewardId` as props. Switch to using `useShowOfficials(showId)` internally. Renders the same OfficialCard UI but supports multiple secretaries (maps over array). Parent components (`ShowOverviewTab`) stop passing these props.

#### Export

`export.ts` and `OfflineReportService` resolve officials from `user_roles` via a direct Supabase query within the export function (not a hook — export runs outside React).

#### myK9Q

Leave untouched. myK9Q reads from its own replicated data (`secretary_name`, `secretary_email`, `secretary_phone` denormalized fields) populated by the replication layer. These come from a separate data path. Migrate myK9Q separately if needed.

### 4. Volunteer RLS Hardening

Covered in Section 1 (database migration). Summary:

- `is_show_secretary(show_id)` used in all three volunteer table write policies
- Secretary for Show A cannot manage volunteers for Show B
- `volunteer_class_assignments` and `volunteer_general_assignments` scope through parent `volunteers.show_id`
- Read policies unchanged (all authenticated users can view)
- Redundant `WITH CHECK` clauses removed

### 5. Testing & Rollback

#### Unit tests

- Update tests for ShowOfficials, ShowDetailsStep, ReviewStep, ShowEditPanel, permissionValidation to work without `show.secretary` etc fields
- Add tests for `useShowOfficials` hook
- Volunteer scheduling tests should verify show-scoped access

#### Migration safety

The data migration handles:

- TEXT values that don't match any `people.id` — skip (stale/orphaned data)
- Shows where a `user_roles` row already exists for person+role+show — skip (no duplicates)
- Null values — skip

#### Rollback

Migration includes a rollback comment block:

1. Re-add columns: `ALTER TABLE shows ADD COLUMN secretary TEXT, ADD COLUMN chairman TEXT, ADD COLUMN chief_steward TEXT`
2. Backfill from `user_roles`: `UPDATE shows SET secretary = ... FROM user_roles ...`
3. Drop helper functions
4. Restore original volunteer policies

## Files Affected

### Database

- New migration `096_migrate_officials_to_user_roles.sql`

### Types & interfaces

- `apps/myk9show/src/types/show-types.ts` — remove 3 fields from Show and ShowInput
- `packages/supabase/src/database.types.ts` — regenerated
- `apps/myk9show/src/types/supabase.ts` — regenerated
- `apps/myk9show/src/types/database-mappings.ts` — updated

### Queries & hooks

- New: `apps/myk9show/src/hooks/queries/useShowOfficials.ts`
- `apps/myk9show/src/utils/show-relationships.ts` — rewrite permission checks
- `apps/myk9show/src/utils/permissionValidation.ts` — rewrite permission checks

### Mappers & replication

- `apps/myk9show/src/services/mappers/showMappers.ts` — remove 3 fields from all mappers
- `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts` — remove 3 fields
- `apps/myk9show/src/store/showStore.ts` — remove 3 fields

### Validation

- `apps/myk9show/src/lib/validation.ts` — remove 3 fields from schemas
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardValidation.ts` — remove

### Wizard & forms

- `apps/myk9show/src/pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts`
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx`
- `apps/myk9show/src/components/shows/wizard/steps/ReviewStep.tsx`
- `apps/myk9show/src/components/panels/edit/ShowEditPanel.types.ts`
- `apps/myk9show/src/components/panels/edit/ShowEditPanel.helpers.ts`
- `apps/myk9show/src/components/panels/edit/ShowEditForm.tsx`
- `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx`

### Display & export

- `apps/myk9show/src/components/shows/overview/ShowOfficials.tsx`
- `apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx`
- `apps/myk9show/src/lib/export.ts`
- `apps/myk9show/src/services/offline/OfflineReportService.ts`

### Compatibility

- `apps/myk9show/src/hooks/useShowStoreCompat.ts`
- `apps/myk9show/src/utils/show-management-tracking.ts`
- `apps/myk9show/src/services/testing/LoadTestService.ts`

### Not touched

- myK9Q app (separate data path, deferred)
