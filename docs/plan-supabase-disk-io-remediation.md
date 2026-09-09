# Supabase Disk IO remediation plan

> **Status:** Active

## Objective

Identify and reduce the write amplification observed during the last load rehearsal before running another rehearsal. Keep the rehearsal correctness work in MYK9-109 and MYK9-126; track database workload remediation separately.

## Evidence to validate

- `pg_stat_statements` is cumulative since its last reset, so collect a bounded before/during/after window for each suspect workload.
- Realtime subscription inserts and dirtied blocks suggest channel churn or reconnect churn may be generating avoidable writes.
- `cron.job_run_details` and health snapshots may be writing at a higher cadence than needed.
- Range deletes on `entries` touch many indexes, so fixture cleanup may create short-lived write spikes.
- Supabase logs show repeated `40001 Version conflict ... (expected 1)` errors for generated `entries` IDs, indicating concurrent writers are contending on the same rows with stale optimistic-concurrency tokens.

## Work phases

1. **Baseline and attribution**
   - Capture Disk IO, connection, Realtime channel, cron, and snapshot rates over a quiet control window.
   - Repeat during a non-load seed/cleanup window to separate fixture writes from application workload.
   - Confirm whether the reported budget alert is platform capacity pressure, application churn, or both.

2. **Realtime lifecycle audit**
   - Inventory `channel()` and `subscribe()` call sites and their teardown paths.
   - Verify stable channel reuse, removal on unmount/disconnect, and bounded reconnect behavior.
   - Add focused regression coverage for duplicate subscriptions and teardown.

3. **Load-write contention audit**
   - Map each generated entry ID to the load shard or client that writes it.
   - Verify shards partition entry ownership and do not issue overlapping updates.
   - Confirm optimistic-concurrency retries are bounded, back off, and do not recreate a conflict storm.
   - Measure conflict rate beside Disk IO and Realtime write volume; treat conflicts as a possible amplifier, not proof that Disk IO caused them.

4. **Scheduled-write audit**
   - Enumerate cron jobs and record frequency, retries, and `cron.job_run_details` retention.
   - Measure health-snapshot cadence and whether writes can be coalesced or limited to state changes.
   - Avoid deleting history or changing shared schedules until the evidence and ownership are explicit.

5. **Fixture cleanup review**
   - Profile `entries` cleanup and index usage before changing SQL or indexes.
   - Prefer bounded batches and low-traffic execution if cleanup is confirmed as the spike source.
   - Do not drop or add indexes without usage, dependency, and write-cost evidence.

6. **Guarded rehearsal**
   - Add a preflight Disk IO budget check and capture the bounded evidence window.
   - Run the rehearsal only after the remediation is reviewed and the preflight is green.
   - Record the result on MYK9-109, MYK9-126, and this issue.

## [ADDED] Failure handling and recovery

- If telemetry is unavailable, stale, or incomplete, fail the preflight closed and do not start load.
- If a partial seed, cleanup, or rehearsal leaves shared data uncertain, run the existing canonical-restoration path and verify its postcondition before retrying.
- Keep remediation changes independently reversible; do not combine retention deletion, index changes, and application changes in one rollout.
- Record failed measurements, alerts, and rollback actions with the bounded evidence window.

## [ADDED] Operational rollout

- Define the owner for each change to Realtime lifecycle, scheduled jobs, health snapshots, and fixture cleanup.
- Add alerting thresholds for conflict rate, Realtime write rate, and Disk IO budget consumption during the rehearsal window.
- Validate environment-specific configuration and secrets without logging credentials or raw connection strings.
- Roll out one remediation at a time, compare against the control window, and stop if Disk IO or conflict rates regress.

## Testing and acceptance

- Unit tests cover any Realtime lifecycle changes.
- Targeted load/cleanup tests demonstrate bounded write behavior.
- A rehearsal completes with canonical restoration and no Disk IO budget alert.
- Evidence includes before/during/after measurements and identifies remaining write sources.

## Non-goals

- No blind index changes.
- No destructive retention or historical-data deletion.
- No rehearsal dispatch until the user approves the reviewed remediation and preflight.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The plan can change replication behavior, scheduled writes, fixture cleanup, and rehearsal gating across shared production infrastructure.
