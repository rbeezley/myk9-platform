# Availability Persistence Plan

**Purpose:** Persist judge availability data to the database so it can power judge-to-show matching.

**Status:** Plan only — implement when ready to build judge-to-show matching.

---

## Current State

### What Exists

| Layer           | Status  | Details                                                                                  |
| --------------- | ------- | ---------------------------------------------------------------------------------------- |
| **UI**          | Exists  | `AvailabilitySection.tsx` collects startDate, endDate, maxShowsPerMonth, travelRadius    |
| **Types**       | Exists  | `JudgeInfo.availability` in `user-types.ts` (also has blackoutDates, availabilityStatus) |
| **DB Table**    | Missing | No `judge_availability` table in any migration                                           |
| **Queries**     | Missing | No availability CRUD in `judgeQueries.ts`                                                |
| **Persistence** | Missing | `JudgeCreationPanel` passes availability to `addUser()` but it's never written to DB     |

### Related Tables

- `people` — core person record (no availability columns)
- `judge_qualifications` — qualifications per judge (migration 049)
- `judge_certifications` — certifications per judge (migration 005)
- `judge_assignments` — judge-to-show/trial/class assignments with status (migration 005)
- `shows` — has `start_date`, `end_date`, `city`, `state`, `zip_code` for matching

---

## Design Decision: Dedicated Table vs JSON Column

**Recommendation: Dedicated `judge_availability` table.**

| Criteria               | JSON on `people`                            | Dedicated Table                                       |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------- |
| Query filtering        | Requires JSON operators, no indexes         | Standard SQL, indexable columns                       |
| Blackout dates         | Nested array in JSON                        | Separate `judge_blackout_dates` table or array column |
| Judge-to-show matching | Complex JSON extraction                     | Simple `WHERE` / `JOIN`                               |
| Schema evolution       | Harder to add constraints                   | Standard ALTER TABLE                                  |
| Consistency            | Different pattern from qualifications/certs | Matches existing `judge_*` table pattern              |

---

## Implementation Plan

### Step 1: Database Migration

**New file:** `supabase/migrations/050_judge_availability.sql`

```sql
-- Judge availability preferences for show matching
CREATE TABLE IF NOT EXISTS judge_availability (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,

  -- Date range the judge is generally available
  start_date DATE,
  end_date DATE,

  -- Capacity
  max_shows_per_month INTEGER DEFAULT 4 CHECK (max_shows_per_month BETWEEN 1 AND 30),

  -- Travel
  travel_radius_miles INTEGER DEFAULT 100 CHECK (travel_radius_miles >= 0),

  -- Overall status
  availability_status TEXT DEFAULT 'available'
    CHECK (availability_status IN ('available', 'busy', 'unavailable')),

  -- Blackout dates stored as array (simple, no need for separate table yet)
  blackout_dates DATE[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One availability record per judge
  CONSTRAINT judge_availability_person_unique UNIQUE (person_id)
);

CREATE INDEX IF NOT EXISTS judge_availability_person_id_idx
  ON judge_availability(person_id);
CREATE INDEX IF NOT EXISTS judge_availability_status_idx
  ON judge_availability(availability_status);
CREATE INDEX IF NOT EXISTS judge_availability_dates_idx
  ON judge_availability(start_date, end_date);

-- Updated_at trigger
CREATE TRIGGER update_judge_availability_updated_at
  BEFORE UPDATE ON judge_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE judge_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_availability FORCE ROW LEVEL SECURITY;

-- Judges can read/write their own availability
CREATE POLICY "Users can view own availability"
  ON judge_availability FOR SELECT
  USING (person_id IN (
    SELECT id FROM people WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own availability"
  ON judge_availability FOR ALL
  USING (person_id IN (
    SELECT id FROM people WHERE auth_user_id = auth.uid()
  ));

-- Show secretaries/admins can view all judge availability (for matching)
CREATE POLICY "Secretaries can view all availability"
  ON judge_availability FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM people
    WHERE auth_user_id = auth.uid()
    AND ('secretary' = ANY(roles) OR 'admin' = ANY(roles))
  ));
```

**Design notes:**

- One row per judge (UNIQUE on person_id) — availability is a preference, not per-show
- `blackout_dates` as DATE[] keeps it simple; if blackout management becomes complex (recurring patterns, reasons), extract to a separate table later
- RLS allows judges to manage their own, secretaries/admins to read all

### Step 2: Database Queries

**Edit:** `apps/myk9show/src/services/database/queries/judgeQueries.ts`

Add `judgeAvailabilityQueries` following the existing pattern:

```typescript
export const judgeAvailabilityQueries = {
  async upsert(data: {
    person_id: string;
    start_date?: string | null;
    end_date?: string | null;
    max_shows_per_month?: number;
    travel_radius_miles?: number;
    availability_status?: string;
    blackout_dates?: string[];
  }) {
    return supabase
      .from('judge_availability')
      .upsert(data, { onConflict: 'person_id' })
      .select()
      .single();
  },

  async getByPersonId(personId: string) {
    return supabase.from('judge_availability').select('*').eq('person_id', personId).maybeSingle();
  },

  async delete(personId: string) {
    return supabase.from('judge_availability').delete().eq('person_id', personId);
  },
};
```

Key difference from qualifications: **upsert** (not delete-all-then-recreate) since it's a single record per judge.

[ADDED] Add batch query for list views:

```typescript
  async getAllForJudges(personIds: string[]) {
    return supabase
      .from('judge_availability')
      .select('*')
      .in('person_id', personIds);
  },
```

### Step 3: Type Mappings

**Edit:** `apps/myk9show/src/types/database-mappings.ts`

Add DB types for `judge_availability` table:

```typescript
export interface DbJudgeAvailability {
  id: string;
  person_id: string;
  start_date: string | null;
  end_date: string | null;
  max_shows_per_month: number;
  travel_radius_miles: number;
  availability_status: string;
  blackout_dates: string[];
  created_at: string;
  updated_at: string;
}
```

Add mapper in `userMappers.ts` (or `judgeQueries.ts`):

```typescript
const mapDbAvailabilityToUI = (db: DbJudgeAvailability): JudgeInfo['availability'] => ({
  startDate: db.start_date ? new Date(db.start_date) : null,
  endDate: db.end_date ? new Date(db.end_date) : null,
  blackoutDates: (db.blackout_dates || []).map(d => new Date(d)),
  maxShowsPerMonth: db.max_shows_per_month,
  travelRadius: db.travel_radius_miles,
});
```

### Step 4: Wire Up JudgeCreationPanel

**Edit:** `apps/myk9show/src/components/panels/entities/JudgeCreationPanel/index.tsx`

After user creation succeeds, persist availability:

```typescript
// After addUser() succeeds and we have the person ID:
// [EXPANDED] Wrap in try/catch — user creation succeeded, so log availability
// failure but don't block the overall save. Invalidate caches after.
if (formData.availability) {
  try {
    await judgeAvailabilityQueries.upsert({
      person_id: newUserId,
      start_date: formData.availability.startDate?.toISOString().split('T')[0] ?? null,
      end_date: formData.availability.endDate?.toISOString().split('T')[0] ?? null,
      max_shows_per_month: formData.availability.maxShowsPerMonth,
      travel_radius_miles: formData.availability.travelRadius,
      blackout_dates: [],
    });
  } catch (error) {
    logger.error('Failed to save availability', 'judges', { userId: newUserId }, error as Error);
    notifications.error('Judge created but availability failed to save');
  }
}
// Invalidate caches so availability loads on next fetch
queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(newUserId) });
loadUsers();
```

### Step 5: Wire Up UserEditPanel (Availability Tab)

**Edit:** `apps/myk9show/src/components/panels/edit/UserEditPanel.tsx`

Add availability persistence in the save handler, same pattern as qualifications:

```typescript
// [EXPANDED] Same error handling + cache invalidation pattern as Step 4:
if (userData.judgeInfo?.availability) {
  try {
    await judgeAvailabilityQueries.upsert({
      person_id: userId,
      start_date: /* ... */,
      end_date: /* ... */,
      max_shows_per_month: userData.judgeInfo.availability.maxShowsPerMonth,
      travel_radius_miles: userData.judgeInfo.availability.travelRadius,
      blackout_dates: (userData.judgeInfo.availability.blackoutDates || [])
        .map(d => new Date(d).toISOString().split('T')[0]),
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
    loadUsers();
  } catch (error) {
    logger.error('Failed to save availability', 'judges', { userId }, error as Error);
    notifications.error('User saved but availability failed to save');
  }
}
```

### Step 6: Load Availability on User Fetch

**Edit:** `apps/myk9show/src/store/userStore.ts` (or `useUsersQuery.ts`)

When loading a judge user, also fetch their availability:

```typescript
// In loadUsers or mapDbUserToUser:
if (user.roles?.includes('judge')) {
  const { data } = await judgeAvailabilityQueries.getByPersonId(user.id);
  if (data) {
    user.judgeInfo = {
      ...user.judgeInfo,
      availability: mapDbAvailabilityToUI(data),
    };
  }
}
```

**Performance note:** [EXPANDED] Use `getAllForJudges(personIds)` (added in Step 2) to batch-fetch in a single query. In `loadUsers()`, after fetching all users, collect judge person IDs and fetch all availability rows at once, then merge into user objects by person_id lookup.

### Step 6b: Supabase Type Generation [ADDED]

**Edit:** `packages/supabase/src/types/database.types.ts`

Add `judge_availability` to the generated types (or re-run `supabase gen types typescript`). Without this, TypeScript won't recognize the table in `.from('judge_availability')` calls.

### Step 7: Display Availability on UserDetailsView

**Edit:** `apps/myk9show/src/components/users/UserDetails/`

Add an availability section to the detail page (could be part of AccountSummaryCard or a new small card) showing:

- Available dates range
- Max shows/month
- Travel radius
- Availability status badge

---

## Future: Judge-to-Show Matching (Out of Scope)

Once availability is persisted, matching becomes a query:

```sql
-- Find available judges for a show
SELECT p.id, p.first_name, p.last_name, ja.travel_radius_miles
FROM people p
JOIN judge_availability ja ON ja.person_id = p.id
JOIN judge_qualifications jq ON jq.person_id = p.id
WHERE
  -- Has judge role
  'judge' = ANY(p.roles)
  -- Is generally available
  AND ja.availability_status = 'available'
  -- Show dates fall within availability window
  AND (ja.start_date IS NULL OR ja.start_date <= $show_start_date)
  AND (ja.end_date IS NULL OR ja.end_date >= $show_end_date)
  -- Show dates don't overlap blackout dates
  AND NOT ($show_start_date = ANY(ja.blackout_dates))
  -- Qualified for the discipline
  AND jq.is_active = true
  AND $show_discipline = ANY(jq.disciplines)
  -- Not already assigned to another show on those dates
  AND NOT EXISTS (
    SELECT 1 FROM judge_assignments jas
    JOIN shows s ON s.id = jas.show_id
    WHERE jas.person_id = p.id
    AND jas.status IN ('invited', 'confirmed')
    AND s.start_date <= $show_end_date
    AND s.end_date >= $show_start_date
  )
ORDER BY p.last_name, p.first_name;
```

This query is only possible with structured availability data in a dedicated table — validating the design choice.

---

## Deployment [ADDED]

After merging, apply the migration:

```bash
supabase db push   # Applies 050_judge_availability.sql
```

No environment variables needed. No data migration (new table, empty).

## Blackout Dates UI [ADDED]

The `blackoutDates` field is in the type and DB but **not collected in AvailabilitySection.tsx**. Options:

1. **Defer** — ship without blackout UI, store empty array. Add UI later when needed for matching.
2. **Add** — add a date-list picker to AvailabilitySection (multi-select calendar or chip-based date entry).

Recommendation: **Defer.** Blackout dates add UI complexity and aren't needed until matching is built. The DB column is ready when the UI catches up.

## Files Changed (Summary)

| File                                                                        | Change                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `supabase/migrations/050_judge_availability.sql`                            | **New** — table, indexes, RLS                     |
| `packages/supabase/src/types/database.types.ts`                             | [ADDED] Add generated types for new table         |
| `apps/myk9show/src/types/database-mappings.ts`                              | Add `DbJudgeAvailability` interface               |
| `apps/myk9show/src/services/database/queries/judgeQueries.ts`               | Add `judgeAvailabilityQueries` (incl batch)       |
| `apps/myk9show/src/services/mappers/userMappers.ts`                         | Add availability DB-to-UI mapper                  |
| `apps/myk9show/src/components/panels/entities/JudgeCreationPanel/index.tsx` | Persist availability on create + error handling   |
| `apps/myk9show/src/components/panels/edit/UserEditPanel.tsx`                | Persist availability on edit + cache invalidation |
| `apps/myk9show/src/store/userStore.ts`                                      | Batch-load availability when fetching judges      |
| `apps/myk9show/src/components/users/UserDetails/`                           | Display availability on detail page               |

## Testing

- Unit test `judgeAvailabilityQueries` (upsert, getByPersonId, delete)
- Unit test DB-to-UI mapper
- Integration: create judge with availability, verify it's persisted and loads back
- Integration: edit availability, verify upsert updates (not duplicates)
- Edge cases: judge with no availability record (nullable), blackout dates array empty vs populated
