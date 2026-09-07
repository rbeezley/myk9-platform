# Nightly backup recovery — operator procedure and rehearsal

Owner: Richard Beezley. Tracking: [MYK9-110](https://linear.app/myk9-platform/issue/MYK9-110).
Evidence recorded 2026-09-07. Source: `myK9-platform` (`sojmvhhwsjxmfistvzbe`).

## Current decision

Keep daily physical backups; defer paid PITR until revenue. Separate hourly Friday–Sunday
exports are planned, not configured. A nightly backup cannot recover changes made after its
timestamp. Use the actual timestamp shown in the dashboard, not an assumed midnight cutoff.
Formal accepted data-loss and recovery-time objectives remain outstanding.

## Recover from a nightly backup

1. Contain the incident: stop affected writes and coordinate connected/offline tablets. Preserve
   queued scores before manual repairs; do not clear browser storage. Identify the last good
   backup and the affected show, rows, and columns. Preserve current data for comparison.
2. Open source project → Database → Backups → Restore to new project. Select a backup before
   the damage, record its timestamp, and create a disposable recovery project. Check the project
   ref before every query. Wait for **Restoration complete**, not merely **Healthy**.
3. Disable copied cron jobs immediately on the recovery project and verify zero active jobs:

   ```sql
   SELECT cron.alter_job(jobid, active := false) FROM cron.job;
   SELECT count(*) AS jobs, count(*) FILTER (WHERE active) AS active_jobs FROM cron.job;
   ```

   Copied jobs may run before this step. The owner accepted that risk for these prelaunch tests;
   startup suppression remains unresolved with Supabase support. Do not assume a clone is inert.

4. Verify restored core tables, relationships, and the affected records. For a single-show
   incident, follow [the partial-recovery procedure](go-live-runbook.md#241-partial-recovery--one-show-without-rolling-back-the-project).
   Select membership through entry.show_id OR class→trial→show OR entry.trial→show.
5. For overwritten scores, compare backup and current values first. Stage only the needed
   backup rows privately, then update only damaged scoring columns by reviewed entry IDs in a
   transaction with an exact affected-row assertion. Preserve newer secretary notes, check-in,
   payment, and other unrelated fields. Keep normal triggers enabled and advance `updated_at`.
   Resolve legitimate unsynced scores before overwriting them. Cross-project transfer/import
   still needs a rehearsal; the test below used staging inside one disposable database.
6. Recalculate placements using `public.recalculate_class_placements` for the affected show's
   non-deleted classes and its actual `is_nationals` value. Verify scoring values, placements,
   class status/finalization, version/timestamp advancement, and unchanged other-show data.
7. Before reopening writes, test role-based app access, public results, and a real tablet pull.
   Reconcile external payments and any post-backup changes separately. Record elapsed time and
   unrecovered data. Delete the disposable project after evidence is saved and deletion approved.

For a whole-database failure, Dashboard → Backups → Scheduled backups → Restore is the in-place
route. It rolls the entire database back and requires downtime and explicit incident approval.
That route was **not tested** here. A new-project clone is also not application failover: Auth
configuration, API keys, Functions, Realtime and Storage require separate checks/reconfiguration.
See [Supabase restore documentation](https://supabase.com/docs/guides/platform/backups) and
[clone coverage](https://supabase.com/docs/guides/platform/clone-project).

## Rehearsal evidence

Both restores used the physical backup at **2026-09-07 11:27:09 UTC**. Source application data
was not changed by these tests. These are observed clone durations, not accepted recovery targets.

| Test                                     | Observed evidence                                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database clone `xnnraqzhyvoflmzzfahg`    | Started 16:15:07 UTC; complete observed 16:19:23 (~4m16s)                                                                                                 |
| Core data validation                     | Counts and full-row digests matched source: 10 shows, 16 trials, 33 classes, 1,278 entries, 266 dogs                                                      |
| Other database checks                    | 27 auth users; no orphan entry→class, class→trial, trial→show; RLS enabled on five core tables; 337 public-schema policies                                |
| First clone jobs                         | 14 disabled; one recorded containment-sampler execution during startup                                                                                    |
| First clone cleanup                      | Deleted with owner approval; source and legacy project remained                                                                                           |
| Single-show clone `yltegnpcnqrtjurxdmon` | Started 16:30:30 UTC; complete observed 16:34:35 (~4m05s); 14 cron jobs disabled, zero active                                                             |
| Test show                                | Heartland Scent Work Classic, `dededede-0000-0000-0000-000000000010`, 516 entries                                                                         |
| Simulated damage                         | Five scored entries had `total_score`, `search_time_seconds`, `total_faults`, `points_earned` cleared and `is_scored` set false; 5/5 confirmed damaged    |
| Recovery                                 | 5/5 exactly matched backup scoring values; 5/5 advanced version and timestamp                                                                             |
| Preservation                             | Newer secretary note survived; zero non-scoring-field changes against pre-damage baseline; zero changes to other-show entries/classes or any shows/trials |
| Placements                               | Zero mismatches against independent ranking; Container Novice A [1,2,3], Interior Advanced Preliminary [1,2]; both completed and finalized                |
| Second clone cleanup                     | Awaiting owner confirmation for permanent deletion                                                                                                        |

The second test saved backup rows in private `dr_myk9110` staging, added a newer secretary note,
saved a pre-damage baseline, committed damage, then recovered five columns by ID. Staging schema
access was revoked from PUBLIC, anon and authenticated. No cross-project export/import occurred.
Verification compared full rows for unaffected entities and all non-scoring columns for entries,
excluding derived placement and replication markers. No hard-delete path was exercised.

### Dogs, people and clubs — operator-assisted verification

On 2026-09-07, browser control was unavailable. Richard ran the same read-only aggregate query
in the temporary restore and `myK9-platform`, identified each project, and supplied both results.
All six counts and fingerprints matched. Fingerprints used
`md5(string_agg(to_jsonb(t)::text, '' ORDER BY id))`, covering every column in each row.

| Table              | Rows in each project | Matching fingerprint               |
| ------------------ | -------------------- | ---------------------------------- |
| dogs               | 266                  | `ca05243eeb8da96fac7ea31275ac67b9` |
| people             | 17                   | `1ed139d9908c1c856c23dbc4cde27c14` |
| clubs              | 5                    | `6e04a8a44a9493c783ca86028903a905` |
| club_members       | 9                    | `1a648e68267b48014a6220724beb41c2` |
| club_officers      | 0                    | NULL in both (empty tables)        |
| exhibitor_profiles | 15                   | `c0a4b78a63e14834c14555ef84480fce` |

This verifies the stored rows, including their relationship-ID values, match the source.
It does not independently establish absence of pre-existing orphan references, validate separate
relationship tables, or test login, role permissions, or application behavior. Empty officer tables
confirm parity but do not exercise restoration of populated officer records.

## Remaining evidence gates

- Rehearse transfer of selected backup records into a separate recovery destination.
- Verify authenticated/anonymous app behavior and actual tablet synchronization after repair.
- Check remaining ownership/handler relationship tables and explicit referential-integrity queries.
- Test any additional damaged columns and hard/soft-delete paths before calling them proven.
- Record actual retention and accepted RPO/RTO; resolve copied-job startup handling before launch.
- Plan independent Storage-file protection; database backups exclude uploaded file contents.
- Implement/test the separately approved export direction later; this rehearsal does not prove it.

MYK9-110 remains open. A successful database rehearsal does not complete the launch durability gate.
