# People SELECT RLS Restriction

**Date:** 2026-04-06
**Status:** Approved
**Migration:** 119

## Problem

The `people` table SELECT policy (`people_select`, migration 111) allows any authenticated user to read all non-deleted rows. This exposes PII (email, phone, street address) to any logged-in user via the Supabase REST API.

The `entries` table SELECT remains open (`USING (true)`) but entries contain only semi-public data (handler name, scores, run orders, armband numbers) that is already displayed on public TV boards and run order screens. The real PII leak is through the `people` join.

## Decision

Restrict `people` SELECT to own-record-or-privileged-role. Keep `entries` SELECT open.

## New Policy

```sql
DROP POLICY IF EXISTS "people_select" ON people;

CREATE POLICY "people_select" ON people
  FOR SELECT TO authenticated
  USING (
    (
      auth_user_id = (SELECT auth.uid())
      OR (SELECT is_trial_secretary())
      OR (SELECT is_platform_admin())
    )
    AND (
      deleted_at IS NULL
      OR (SELECT is_platform_admin())
    )
  );
```

### Access Matrix

| Role           | Own record | Other people | Soft-deleted |
| -------------- | ---------- | ------------ | ------------ |
| Regular user   | Yes        | No           | No           |
| Secretary      | Yes        | Yes          | No           |
| Platform admin | Yes        | Yes          | Yes          |

## Impact Analysis

- **TV/spectator views** -- use `entries.handler` (text field), not `people` table. No breakage.
- **Run order display** -- uses entries data only. No breakage.
- **Dog list/detail** -- dogs have own RLS; app queries current user's dogs. No breakage.
- **Entry registration** -- handler lookup during registration is a secretary flow. Covered.
- **CSV export** -- uses `get_entries_for_export` RPC (SECURITY DEFINER). Bypasses RLS. No breakage.
- **Anon users** -- already excluded by `TO authenticated`. No change.

## Migration

Single file `119_restrict_people_select_rls.sql`. Drop old policy, create new one.

## Testing

1. Authenticated user can read their own `people` row.
2. Authenticated user cannot read another user's `people` row.
3. Secretary can read all non-deleted `people` rows.
4. Platform admin can read all rows including soft-deleted.
5. Existing test suites pass (secretary entry queries, profile queries).
