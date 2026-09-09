# Supabase Disk IO remediation plan

## Objective

Identify and reduce the write amplification observed during the last load rehearsal before running another rehearsal. Keep the rehearsal correctness work in MYK9-109 and MYK9-126; track database workload remediation separately.

## Evidence to validate

- `pg_stat_statements` is cumulative since its last reset, so collect a bounded before/during/after window for each suspect workload.
- Realtime subscription inserts and dirtied blocks suggest channel churn or reconnect churn may be generating avoidable writes.
- `cron.job_run_details` and health snapshots may be writing at a higher cadence than needed.
- Range deletes on `entries` touch many indexes, so fixture cleanup may create short-lived write spikes.

## Work phases

1. **Baseline and attribution**
   - Capture Disk IO, connection, Realtime channel, cron, and snapshot rates over a quiet control window.
   - Repeat during a non-load seed/cleanup window to separate fixture writes from application workload.
   - Confirm whether the reported budget alert is platform capacity pressure, application churn, or both.

2. **Realtime lifecycle audit**
   - Inventory `channel()` and `subscribe()` call sites and their teardown paths.
   - Verify stable channel reuse, removal on unmount/disconnect, and bounded reconnect behavior.
   - Add focused regression coverage for duplicate subscriptions and teardown.

3. **Scheduled-write audit**
   - Enumerate cron jobs and record frequency, retries, and `cron.job_run_details` retention.
   - Measure health-snapshot cadence and whether writes can be coalesced or limited to state changes.
   - Avoid deleting history or changing shared schedules until the evidence and ownership are explicit.

4. **Fixture cleanup review**
   - Profile `entries` cleanup and index usage before changing SQL or indexes.
   - Prefer bounded batches and low-traffic execution if cleanup is confirmed as the spike source.
   - Do not drop or add indexes without usage, dependency, and write-cost evidence.

5. **Guarded rehearsal**
   - Add a preflight Disk IO budget check and capture the bounded evidence window.
   - Run the rehearsal only after the remediation is reviewed and the preflight is green.
   - Record the result on MYK9-109, MYK9-126, and this issue.

## Testing and acceptance

- Unit tests cover any Realtime lifecycle changes.
- Targeted load/cleanup tests demonstrate bounded write behavior.
- A rehearsal completes with canonical restoration and no Disk IO budget alert.
- Evidence includes before/during/after measurements and identifies remaining write sources.

## Non-goals

- No blind index changes.
- No destructive retention or historical-data deletion.
- No rehearsal dispatch until the user approves the reviewed remediation and preflight.
