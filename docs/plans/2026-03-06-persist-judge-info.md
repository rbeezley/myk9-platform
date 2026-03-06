# Plan: Persist Judge Info on Creation

**Date:** 2026-03-06
**Status:** Draft

## Problem

When creating a judge via `JudgeCreationPanel`, only the basic person record is saved to the `people` table. The `judgeInfo` data (qualifications, certifications, availability) passed from the panel is silently discarded by `userStore.addUser()`.

## Current State

### Database Tables (migration 005)

- `judge_certifications` — exists: `person_id`, `organization`, `sport`, `level`, `certification_number`, `certification_date`, `expiration_date`, `is_active`
- `judge_assignments` — exists: for assigning judges to shows/trials/classes
- `judge_qualifications` — **does NOT exist** (referenced by `judgeQueries.ts` but never created)

### Application Layer

- `judgeQueries.ts` — full CRUD for `judge_qualifications` table (table doesn't exist yet)
- `judge-management.ts` — comprehensive types for qualifications, certifications, assignments, analytics
- `JudgeCreationPanel` — collects: judge number, qualifications (org, level, disciplines, dates), certifications, availability
- `userStore.addUser()` — only inserts person fields into `people` table, ignores `judgeInfo` and `roles` beyond the array

### Data Flow Gap

```
JudgeCreationPanel.handleSubmit()
  → builds judgeData with { ...personFields, roles: ['judge'], judgeInfo: {...} }
  → calls addUser(judgeData)
    → addUser extracts only: first_name, last_name, email, phone, address fields, roles
    → judgeInfo is DROPPED here
    → inserts into `people` table only
```

## Plan

### Step 1: Create `judge_qualifications` table (migration)

Create migration to add the missing table that `judgeQueries.ts` already expects:

```sql
CREATE TABLE IF NOT EXISTS judge_qualifications (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  qualification_level TEXT NOT NULL,
  disciplines TEXT[] DEFAULT '{}',
  date_obtained DATE,
  expiration_date DATE,
  approval_number TEXT,
  approved_by TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  suspension_date DATE,
  suspension_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX judge_qualifications_person_id_idx ON judge_qualifications(person_id);
CREATE INDEX judge_qualifications_org_idx ON judge_qualifications(organization);
```

Add RLS policies matching the `people` table pattern (authenticated users can read, secretaries/admins can insert/update/delete).

### Step 2: Add `judge_number` to `people` table

The judge number is a top-level identifier (like a registration number). Store it directly on the person record rather than in a separate table.

```sql
ALTER TABLE people ADD COLUMN IF NOT EXISTS judge_number TEXT;
CREATE INDEX people_judge_number_idx ON people(judge_number);
```

### Step 3: Wire `addUser` to persist judge data

After the person insert succeeds in `userStore.addUser()`:

1. If `userData.judgeInfo` exists:
   - Update the person's `judge_number` field
   - For each qualification in `judgeInfo.qualifications`, call `judgeQualificationQueries.create()` with `person_id` set to the newly created person's ID
   - For each certification in `judgeInfo.certifications`, insert into `judge_certifications` table

Map from panel's `JudgeQualification` format to DB's `CreateJudgeQualificationData`:

```typescript
// Panel collects:
{
  (organization,
    level,
    disciplines,
    dateObtained,
    judgeNumber,
    showTypes,
    certificationDate,
    status);
}

// DB expects (CreateJudgeQualificationData):
{
  (person_id,
    organization,
    qualification_level,
    disciplines,
    date_obtained,
    expiration_date,
    is_active);
}
```

Map from panel's `JudgeCertification` format to DB's `judge_certifications` columns:

```typescript
// Panel collects:
{
  (name, issuingBody, dateObtained, expirationDate, certificationNumber);
}

// DB expects (judge_certifications table):
{
  (person_id,
    organization,
    sport,
    level,
    certification_number,
    certification_date,
    expiration_date);
}
```

### Step 4: Load judge data when reading people

Update `userQueries.ts` `getAllUsers()` or add a specific `getJudgeWithQualifications()` query that joins:

- `people` (base record)
- `judge_qualifications` (via `person_id`)
- `judge_certifications` (via `person_id`)

The existing `mapDatabaseToUser()` already handles `judge_qualifications` array in the response — it maps them into `judgeQualifications` on the User object. It just needs the data to actually be there.

### Step 5: Update `userMappers.ts` to include `judge_number`

- Insert: include `judge_number` in the insert payload when present
- Read: map `dbUser.judge_number` to `User.judgeInfo.judgeNumber`

## Scope Decisions

### In Scope

- Migration for `judge_qualifications` table + `judge_number` column
- RLS policies for new table
- Persist qualifications and certifications on judge creation
- Read qualifications back when loading people/judges

### Out of Scope (future work)

- Availability persistence (no table exists; could be JSON column or separate table)
- Judge assignment management (table exists, UI doesn't)
- Edit judge qualifications UI (separate feature)
- Judge analytics/performance stats

## Files to Modify

1. `supabase/migrations/0XX_judge_qualifications_table.sql` — new migration
2. `apps/myk9show/src/store/userStore.ts` — wire judgeInfo persistence after person create
3. `apps/myk9show/src/services/mappers/userMappers.ts` — add judge_number to insert/read
4. `apps/myk9show/src/services/database/queries/userQueries.ts` — join judge data on read

## Files That Already Work (no changes needed)

- `judgeQueries.ts` — CRUD already written for `judge_qualifications`
- `judge-management.ts` — types already defined
- `JudgeCreationPanel/index.tsx` — already collects and passes judgeInfo
- `userMappers.ts` `mapDatabaseToUser()` — already maps `judge_qualifications` array

## Estimated Effort

Small-medium. The query layer and types are already built. Main work is the migration and wiring the store to call the existing queries after person creation.
