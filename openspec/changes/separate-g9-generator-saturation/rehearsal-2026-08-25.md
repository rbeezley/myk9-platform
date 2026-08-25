# G9 rehearsal attempt — 2026-08-25

Run: https://github.com/rbeezley/myk9-platform/actions/runs/32904006355

Target: approved prelaunch Supabase project `sojmvhhwsjxmfistvzbe`, Micro tier.

## Outcome

The protected environment gate was approved. Target confirmation, ringside scoring,
CPU telemetry, disk-I/O telemetry, and the database-clock ownership window all passed.
The canonical reseed then failed inside its transaction before any load shard ran:

- `trial_packet_snapshots_show_id_fkey` restricted replacement of the canonical show.
- The unconditional cleanup correctly stopped before reseeding, but its worker sample
  query failed because `datname` was ambiguous after joining `pg_stat_activity` and
  `pg_stat_database`.

## Recovery proof

The failed seed transaction rolled back. A read-only staging check immediately after
the workflow completed reported:

```text
entries | deterministic entries | scored deterministic entries | packet snapshots | active scoring workers
514     | 504                   | 0                            | 4                | 0
```

No load traffic ran and the canonical fixture remained intact.

## Follow-up

The repair removes canonical-show packet objects through the authenticated Storage API
before deleting their audit rows, makes the SQL seed refuse metadata-only cleanup, and
qualifies all `pg_stat_activity` columns in the cleanup SQL. Assertion-first paired
storage/metadata, seed-guard, workflow-ordering, and cleanup-query tests reproduce the
failures. A new approved remote rehearsal is still required; this attempt does not
satisfy G9.
