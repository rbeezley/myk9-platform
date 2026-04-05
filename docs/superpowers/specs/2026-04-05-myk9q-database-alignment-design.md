# myK9Q Database Alignment — Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Problem

myK9Q was copied from a standalone production repo into the monorepo. While its `.env` already points at the platform Supabase project (`sojmvhhwsjxmfistvzbe`), the code references column names, views, and tables from the legacy schema (`yyzgjyiqgmjzyhzkqdfx`). myK9Q cannot run against the platform DB until these divergences are resolved.

This is a prerequisite for passcode generation and feature stripping.

## Approach

Direct refactor: update myK9Q code to use platform column names, create compatibility views for joined data, add missing columns/views to the platform schema via migration. No adapter layer or feature flags.

### License Key = Show UUID

The `license_key` used for myK9Q multi-tenant isolation will be the show's UUID (`shows.id`). This eliminates the need for a separate generated license key string. The show UUID is already unique, already on all the right tables via FKs, and works directly with myK9Q's existing infrastructure:

- **`x-license-key` header** — set to the show UUID string
- **`get_license_key()` RLS function** — returns a UUID string (same mechanism)
- **Realtime subscriptions** — filter by show UUID
- **Passcode generation** — derive passcodes from the show UUID hex segments, same algorithm as the legacy license key (e.g., role prefix + 4 hex chars from a UUID segment)

Tables where `license_key` exists (`shows`, `clubs`, `people`, `dogs`, `entries`) will be populated with the show UUID. Note: `clubs`, `people`, and `dogs` are not show-scoped in the platform model (a club/person/dog spans multiple shows), so `license_key` on those tables only applies to myK9Q's show-scoped data download context.

## Scope

### In Scope

1. Refactor myK9Q code to use platform column names on core tables
2. Map `class_requirements` references to `sport_class_rules`
3. Create platform views for myK9Q data loading and statistics
4. Add missing columns to platform tables (`section`, `judge_name` on classes)
5. Add missing columns to `sport_class_rules` for scent work scoring
6. Clean up stale references (CLAUDE.md project ID, legacy migration docs, .env.example)

### Deferred (Documented, Not Implemented)

- **`push_subscriptions`** — blocked on auth model reconciliation (passcode vs Supabase Auth UUID)
- **`push_notification_config`** — legacy pattern, platform uses edge function secrets
- **`event_statistics`** — nationals feature dormant
- **`performance_metrics` / `performance_session_summaries`** — dev tooling, not core

## Design

### 1. Platform Migration

A single migration (`115_myk9q_compatibility.sql`) that:

#### 1a. Add missing columns to `classes`

```sql
ALTER TABLE classes ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS judge_name TEXT;
```

`section` is the A/B section designation on scent work classes. `judge_name` is a denormalized judge name for display — myK9Q needs it directly on classes for offline-first rendering. myK9Show resolves judge via `judge_assignments` + `people` join, but myK9Q's offline model needs a flat column.

#### 1b. Add missing columns to `sport_class_rules`

```sql
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS has_30_second_warning BOOLEAN DEFAULT TRUE;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS time_type TEXT DEFAULT 'fixed'
  CHECK (time_type IN ('fixed', 'range', 'dictated'));
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS warning_notes TEXT;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS max_time_seconds_area2 INTEGER;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS max_time_seconds_area3 INTEGER;
```

These are legitimate scent work scoring rules that the platform needs for multi-area time limits and warning configuration.

#### 1c. Create `view_myk9q_entries`

Replaces the legacy `view_entry_class_join_normalized`. Joins entries + dogs + classes + trials + shows and aliases columns to match myK9Q interface expectations:

```sql
CREATE OR REPLACE VIEW view_myk9q_entries AS
SELECT
  e.id,
  e.armband::INTEGER as armband_number,
  e.handler as handler_name,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.entry_status,
  e.run_order as exhibitor_order,
  e.created_at,
  e.updated_at,
  -- Scoring
  e.is_scored,
  e.is_in_ring,
  e.result_status,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_correct_finds,
  e.total_incorrect_finds,
  e.no_finish_count,
  e.points_earned,
  e.scoring_completed_at,
  -- Class
  c.id AS class_id,
  c.element,
  c.level,
  c.judge_name,
  c.section,
  c.status AS class_status,
  c.time_limit_seconds,
  c.num_areas AS area_count,
  -- Trial
  t.id AS trial_id,
  t.trial_number,
  t.date AS trial_date,
  -- Show
  s.id AS show_id,
  s.license_key,
  s.name AS show_name
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN trials t ON e.trial_id = t.id
LEFT JOIN shows s ON e.show_id = s.id;
```

RLS and grants:

```sql
GRANT SELECT ON view_myk9q_entries TO anon, authenticated;
```

Views inherit RLS from their underlying tables, so no additional policies needed.

#### 1d. Create stats views

Adapted from legacy migration 044, using platform column names:

- **`view_stats_summary`** — pre-joined scored entries for statistics
- **`view_breed_stats`** — aggregated stats by breed
- **`view_judge_stats`** — aggregated stats by judge
- **`view_clean_sweep_dogs`** — dogs with 100% qualification rate
- **`view_fastest_times`** — fastest qualifying times with tie ranking

Column adjustments from legacy:

- `s.name` as `show_name` (was `s.show_name`)
- `t.name` as `trial_name` (was `t.trial_name`)
- `t.date` as `trial_date` (was `t.trial_date`)
- `e.armband` as `armband_number` (was `e.armband_number`)
- `e.handler` as `handler_name` (was `e.handler_name`)
- `d.call_name` as `dog_call_name` (was `e.dog_call_name`)
- `d.breed` as `dog_breed` (was `e.dog_breed`)
- Entries must be joined to dogs table (denormalized columns don't exist on platform entries)

### 2. myK9Q Code Refactor

#### 2a. Replication tables — Shows

`ReplicatedShowsTable` interface update:

| Current field                            | New field                           | Source             |
| ---------------------------------------- | ----------------------------------- | ------------------ |
| `show_name`                              | `name`                              | `shows.name`       |
| `club_name`                              | Drop (or resolve from `club_id` FK) |                    |
| `show_type`                              | `type`                              | `shows.type`       |
| `show_status`                            | `status`                            | `shows.status`     |
| `site_name`                              | `venue_name`                        | `shows.venue_name` |
| `site_address`                           | `address`                           | `shows.address`    |
| `site_city`                              | `city`                              | `shows.city`       |
| `site_state`                             | `state`                             | `shows.state`      |
| `site_zip`                               | `zip_code`                          | `shows.zip_code`   |
| `secretary_name` / `show_secretary_name` | `secretary`                         | `shows.secretary`  |
| `app_version`                            | Drop                                |                    |

All consuming components/services must be updated to use new field names.

#### 2b. Replication tables — Trials

| Current field        | New field                        |
| -------------------- | -------------------------------- |
| `trial_name`         | `name`                           |
| `trial_date`         | `date`                           |
| `trial_number` (INT) | `trial_number` (TEXT)            |
| `trial_status`       | `status`                         |
| `element`            | Drop (element is on classes)     |
| `organization`       | Drop (org is on sport_templates) |

#### 2c. Replication tables — Classes

| Current field              | New field                                                |
| -------------------------- | -------------------------------------------------------- |
| `class_status`             | `status`                                                 |
| `license_key`              | Drop (join through trials → shows)                       |
| `hide_count`               | Drop from class interface (lives on `sport_class_rules`) |
| `timer_mode`               | Drop from class interface                                |
| `hides_known`              | Drop from class interface                                |
| `distraction_count`        | Drop from class interface                                |
| `time_limit_area2_seconds` | Drop from class interface                                |
| `time_limit_area3_seconds` | Drop from class interface                                |

`judge_name` and `section` stay — they'll exist on the platform classes table after the migration.

#### 2d. Replication tables — Entries

Entries fetched via `view_myk9q_entries` — the view aliases columns so the `Entry` interface stays largely unchanged. The replication table's `fetchFromSupabase` changes from `.from('entries')` to `.from('view_myk9q_entries')`.

For realtime subscriptions (which fire on the raw `entries` table), the handler re-fetches the changed row from `view_myk9q_entries` by ID rather than applying the raw payload directly.

#### 2e. class_requirements → sport_class_rules

`ReplicatedClassRequirementsTable`:

- Change `super('class_requirements', ...)` to `super('sport_class_rules', ...)`
- Update `ClassRequirement` interface to match `sport_class_rules` schema
- Update `fetchFromSupabase` query and all field references
- Update consumers (scoresheets, class settings)

#### 2f. Direct Supabase queries

All `.from()` calls in myK9Q services that reference legacy column names must be updated:

- `entryService.ts` — column aliases in select/filter
- `preloadServiceHelpers.ts` — switch entries fetch to `view_myk9q_entries`
- `authService.ts` — column name updates for shows/trials/classes queries
- `resultVisibilityService.ts` — already uses canonical visibility table names (no changes)
- `nationalsScoring.ts` — already uses `nationals_scores`/`nationals_rankings` (no changes)
- `announcementService.ts` — already uses `announcements` (no changes)
- `metricsApiService.ts` — references `performance_metrics`/`performance_session_summaries` (deferred, will break)

#### 2g. Supabase types in `supabase.ts`

The inline type definitions (`ShowQueue`, `TrialQueue`, `ClassQueue`, `EntryQueue`, `ResultQueue`, `ViewEntryClassJoinDistinct`) in `apps/myk9q/src/lib/supabase.ts` must be updated to match platform column names or removed in favor of proper type imports.

### 3. Cleanup

- **`apps/myk9q/CLAUDE.md`**: Update Supabase project ID from `yyzgjyiqgmjzyhzkqdfx` to `sojmvhhwsjxmfistvzbe`, update region, update MCP server references
- **`apps/myk9q/.env.example`**: Remove legacy dual-database references (VITE_SUPABASE_URL_LEGACY, etc.)
- **`apps/myk9q/supabase/migrations/`**: Add a README noting these are historical migrations from the legacy standalone project, not active platform migrations
- **Legacy `ResultQueue` type**: Remove — platform merged results into entries table (migration 003)

### 4. Known Breakages (Accepted)

These features will not work after alignment until their deferred dependencies are resolved:

- **Push notifications** — `push_subscriptions` schema mismatch (passcode vs UUID auth)
- **Performance metrics** — `performance_metrics` / `performance_session_summaries` tables don't exist
- **Nationals scoring** — `event_statistics` table doesn't exist (nationals feature already dormant)

The app will still build and run for core scoring/entry workflows.

## Testing

- `pnpm typecheck` across monorepo — catches all column name mismatches
- `cd apps/myk9q && pnpm test` — run existing unit tests, update snapshots as needed
- Manual: start myK9Q dev server, verify show download, class list, entry list, and scoring flow against platform DB
