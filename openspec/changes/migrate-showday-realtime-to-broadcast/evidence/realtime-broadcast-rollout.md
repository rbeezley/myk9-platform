# Realtime Broadcast rollout evidence

This is the repeatable staging runbook for MYK9-25. Do not run the migration,
workload, or rollback against a linked Supabase project without owner approval.

## Pre-deploy capture

Record the following immediately before the staging migration:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

select slot_name,
       active,
       pg_size_pretty(
         pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)
       ) as retained_wal
from pg_replication_slots
where plugin = 'pgoutput';

select queryid, calls, total_exec_time, mean_exec_time, rows, query
from pg_stat_statements
where query ilike '%realtime%'
   or query ilike '%pg_logical_slot%'
order by total_exec_time desc;
```

Also record the observation timestamp and the Realtime service CPU/event/lag
charts for the same window. Do not reset shared `pg_stat_statements` counters;
compare snapshots by `queryid` and subtract the earlier counters.

## Repeatable workload

1. Open the same staging show in two independent browser contexts: a gate or
   steward view and a TV or public display view.
2. Record the chosen show, entry, and class IDs. Confirm both contexts are on
   `show:<show-id>:changes` and that only one channel exists per context.
3. From the normal application UI, repeat a representative set of 20 entry
   check-in changes and 20 class/status changes. Restore the original values
   through the same UI.
4. Record received `showday_change` counts by table, authoritative refresh
   counts, first-signal-to-visible-refresh latency, channel errors, and whether
   either context missed the final state.
5. Repeat the pre-deploy SQL capture. Compare `calls`, `total_exec_time`, WAL
   retained, Realtime CPU/event volume, and observed delivery latency over an
   equal-duration window.

Pass criteria:

- both contexts converge on every final authoritative state;
- signal payloads contain only `{"table":"entries"}` or
  `{"table":"classes"}`;
- no entry/class row payload is delivered;
- retained Postgres Changes still update shows, announcements, and messages;
- no sustained Realtime replication lag or channel-error fallback occurs; and
- the measured Realtime decode/event load is lower than the pre-deploy window.

## Post-deploy database evidence

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

select event_object_schema,
       event_object_table,
       trigger_name,
       action_timing,
       event_manipulation
from information_schema.triggers
where trigger_name in (
  'broadcast_entries_showday_change',
  'broadcast_classes_showday_change'
)
order by event_object_table, event_manipulation;

select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'realtime'
  and tablename = 'messages'
  and policyname = 'show-day change signals are readable';
```

Expected publication membership is `shows`, `show_announcements`, and
`show_messages`; `entries`, `classes`, and `show_message_threads` must be absent.

## Corrective rollback

Restore Postgres Changes first so deployed clients retain a live path. The
guards make this safe to run when a table has already been restored.

```sql
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'classes'
  ) then
    alter publication supabase_realtime add table public.classes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'show_message_threads'
  ) then
    alter publication supabase_realtime add table public.show_message_threads;
  end if;
end;
$$;
```

After a client rollback is deployed and verified, remove the Broadcast objects:

```sql
drop trigger if exists broadcast_entries_showday_change on public.entries;
drop trigger if exists broadcast_classes_showday_change on public.classes;
drop function if exists public.broadcast_showday_change();
drop policy if exists "show-day change signals are readable" on realtime.messages;
```

Re-run the publication, trigger, policy, and lag queries after either corrective
step and attach the results to MYK9-25.
