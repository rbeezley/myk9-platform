# DATABASE REFERENCE

**Supabase Project ID**: `yyzgjyiqgmjzyhzkqdfx`
**Region**: us-east-2
**Dashboard**: https://supabase.com/dashboard/project/yyzgjyiqgmjzyhzkqdfx

> **Note**: For current table schemas, use the Supabase MCP server (`mcp__supabase__list_tables`). This document covers views, functions, triggers, and patterns that MCP doesn't expose.

---

## Table of Contents
- [Database Views](#database-views)
- [Database Functions](#database-functions)
- [Database Triggers](#database-triggers)
- [Common Query Patterns](#common-query-patterns)
- [Multi-Tenant Isolation](#multi-tenant-isolation)
- [Key Enums](#key-enums)

---

## Database Views

Use these pre-aggregated views instead of manual joins to eliminate N+1 queries.

### view_class_summary ⭐
Pre-aggregated class statistics with entry counts and timing fields.

**Use for**: Class lists, dashboards, admin pages

**Key columns**:
- Class info: `class_id`, `element`, `level`, `section`, `judge_name`, `class_status`, `class_order`
- Timing: `briefing_time`, `break_until`, `start_time`, `is_scoring_finalized`
- Counts: `total_entries`, `scored_entries`, `checked_in_count`, `at_gate_count`, `in_ring_count`, `qualified_count`, `nq_count`
- Context: `trial_id`, `trial_date`, `show_id`, `license_key`

```sql
SELECT * FROM view_class_summary
WHERE license_key = 'myK9Q1-...'
ORDER BY trial_date, class_order;
```

### view_entry_with_results ⭐
Entries with all scoring data (post-migration 039 merge).

**Use for**: Entry lists, scoresheets, results display

```sql
SELECT * FROM view_entry_with_results
WHERE class_id = 123 AND is_scored = true;
```

### view_entry_class_join_normalized
Entries pre-joined with class, trial, and show context.

**Use for**: Entry lists needing full context

### view_trial_summary_normalized
Trial summary with show context.

**Use for**: Trial selection, trial lists

### view_entry_audit_summary ⭐
Human-readable audit log for score changes.

**Use for**: Dispute resolution, admin review

**Key columns**: `entry_id`, `field_name`, `old_value`, `new_value`, `changed_at`, `changed_by`, `change_source`, `handler_name`, `dog_call_name`

```sql
SELECT * FROM view_entry_audit_summary
WHERE entry_id = 123
ORDER BY changed_at DESC;
```

### Stats Views
- `view_breed_stats` - Breed statistics
- `view_clean_sweep_dogs` - Dogs with clean sweeps
- `view_fastest_times` - Fastest times by class
- `view_judge_stats` - Judge statistics
- `view_stats_summary` - Overall stats summary

### Admin Views
- `view_audit_log` - General audit log
- `view_failed_notifications` - Failed push notifications
- `view_combined_classes` - Combined class view
- `performance_metrics_today` - Today's performance metrics

---

## Database Functions

### Class Management
- **`update_class_status(p_class_id, p_license_key, p_status, p_time_value)`** - Updates class status and time fields
- **`calculate_placements(p_class_id, p_license_key)`** - Calculates placements for all entries in a class

### Entry Management
- **`score_entry(p_entry_id, p_license_key, p_time, p_faults, p_result_status)`** - Scores an entry (triggers push notifications)
- **`update_entry_status(p_entry_id, p_license_key, p_entry_status)`** - Updates entry check-in status

### Utility
- **`get_user_role()`** - Returns current user's role from JWT

---

## Database Triggers

### Auto-Timestamp (BEFORE UPDATE)
All major tables have `updated_at` triggers that auto-update on row changes.

### Push Notifications (AFTER INSERT/UPDATE)
| Trigger | Table | Fires When |
|---------|-------|------------|
| `trigger_notify_announcement_created` | announcements | New announcement created |
| `trigger_notify_class_started` | classes | Status → 'briefing' or 'in_progress' |
| `on_entry_scored` | entries | `is_scored` → true (sends "up soon" notifications) |
| `trigger_notify_come_to_gate` | entries | `entry_status` → 'come-to-gate' |

### Score Audit (AFTER UPDATE)
- **`trg_audit_entry_scores`** on entries - Logs all score field changes to `entry_audit` table

Set context before updates for attribution:
```sql
SET LOCAL myk9q.change_source = 'app';
SET LOCAL myk9q.changed_by = 'user_id_here';
```

### Auto-Calculation
- **`recalculate_placements_on_score()`** - Auto-recalculates placements when entries are scored

---

## Common Query Patterns

### Get All Classes for a Show
```sql
SELECT * FROM view_class_summary
WHERE license_key = 'your-license-key'
ORDER BY trial_date, class_order;
```

### Get Entries with Results
```sql
SELECT * FROM view_entry_with_results
WHERE class_id = 123
ORDER BY exhibitor_order;
```

### Update Class Status
```sql
SELECT update_class_status(
  123,                -- class_id
  'your-license-key',
  'briefing',         -- status
  '10:30 AM'          -- time value
);
```

### Score an Entry
```sql
SELECT score_entry(
  456,                -- entry_id
  'your-license-key',
  45.23,              -- time in seconds
  0,                  -- faults
  'qualified'         -- result_status
);
```

---

## Multi-Tenant Isolation

**Critical**: All queries MUST filter by `license_key`.

### License Key Format
`myK9Q1-a260f472-e0d76a33-4b6c264c`

### Passcode Generation
Extracts 4-character segments from license key:
- **Admin**: `a` + segment 2 chars → `aa260`
- **Judge**: `j` + segment 2 chars → `jf472`
- **Steward**: `s` + segment 3 chars → `se0d7`
- **Exhibitor**: `e` + segment 4 chars → `e4b6c`

### Test Credentials
License key: `myK9Q1-a260f472-e0d76a33-4b6c264c`

### RLS (Row-Level Security)
Most tables have RLS policies filtering by `license_key`. Always pass `license_key` to database functions.

---

## Key Enums

### class_status (8 values)
`'no-status'` | `'setup'` | `'briefing'` | `'break'` | `'start_time'` | `'in_progress'` | `'offline-scoring'` | `'completed'`

### entry_status (8 values)
`'no-status'` | `'checked-in'` | `'at-gate'` | `'come-to-gate'` | `'conflict'` | `'pulled'` | `'in-ring'` | `'completed'`

### result_status (6 values)
`'pending'` | `'qualified'` | `'nq'` | `'absent'` | `'excused'` | `'withdrawn'`

### visibility_timing_enum
`'immediate'` | `'class_complete'` | `'manual_release'`

---

## Important Notes

1. **No `results` table** - Merged into `entries` in migration 039
2. **`is_scoring_finalized`** on classes - Replaced former `is_completed` column
3. **`entries.license_key`** - Denormalized via trigger for efficient real-time subscriptions
4. **ID Types** - Most tables use `bigserial` (integers), not UUIDs

---

**Last Updated**: 2025-12-12
