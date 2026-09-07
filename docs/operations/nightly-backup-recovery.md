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
access was revoked from PUBLIC, anon and authenticated. The five-row staging set was later
transferred into a separate disposable destination and repaired there; no source or shared-system
data was changed.

### Cross-project and application rehearsal — 2026-09-07

The existing restore `yltegnpcnqrtjurxdmon` was verified before use: it was the named disposable
project and its 14 copied cron jobs were inactive. A separate Pro disposable destination was created:
`myk9-110-cross-project-recovery-2026-09-07`, ref `nzihqlfcqntxjvhdttzf`. Repository migrations and
the contained demo seed were applied there. The destination's 11 cron jobs were then confirmed
inactive (0 active). No invitation emails were sent and no payment or ordinary-user device was used.

The source staging contained 10 shows, 16 trials, 33 classes, and 1,278 entries. Only the five
damaged entry IDs were transferred across the project boundary into protected destination staging:

`dededede-0000-0000-0000-000000000051`, `...055`, `...058`, `...067`, and `...068`.

The destination simulation cleared `total_score`, `search_time_seconds`, `total_faults`,
`points_earned`, `is_scored`, `result_status`, and derived placement for those five rows. A
destination-only secretary note was added before damage. The column-scoped repair restored the
backup score values, set the qualifying status, and re-derived placements with
`recalculate_class_placements`. Observed report: 5 transferred, 5 repaired, 5 placement matches,
5 intact show→trial→class→dog relationship chains, 5 unchanged non-scoring-field comparisons, 5
version advances, 5 timestamp advances, and the newer note preserved. Other-show counts remained
756 entries and 12 classes.

The local isolated app used only the destination URL and anon key. Auto-confirmed contained accounts
were created for exhibitor, secretary, test admin, judge, chairman, and club admin. Secretary login
opened the destination dashboard; show entry management displayed 516 entries; ringside displayed
the recovered 1st/2nd/3rd podium with 38.50/41.20/45.80-second scores; and the unauthenticated
browser loaded the public Heartland show page with 516 runs claimed. An exhibitor login was redirected
away from `/secretary/dashboard` to onboarding.

Browser replication simulation set the Playwright context offline. A cached ringside scoresheet showed
the offline alert and `Offline ready`; one qualified score was saved while offline, then the context
was reconnected. The destination row became `is_scored=true`, `result_status='qualified'`, with one
server version update and no duplicate visible mutation. A separate authenticated browser then read
the same destination class as 65 pending / 1 completed and displayed the queued score as qualified.
This is a browser simulation only. A cold offline navigation to an uncached scoresheet failed to load
its Vite dynamic module and remains an untested/failing cold-cache path. No physical tablet was
connected.

Manual configuration and dependencies: migrations/seed, six Auth users, destination API URL/key,
cron deactivation, and protected staging. Edge Functions deployed: 0; seed/scoring notices confirmed
push notifications were skipped. Realtime publication contains `shows`, `show_messages`, and
`show_announcements`, not `entries`; the app therefore needs an explicit Realtime/replication review
before launch. Three Storage buckets exist, but uploaded-file recovery was not exercised. Observed
restore/repair times are measurements, not accepted RPO/RTO. Destination project metadata was created
at 17:36:12.066870 UTC and final post-reconnect server verification completed at 18:18:56.641254 UTC:
42m44.6s wall time including provisioning, migrations, manual configuration, repair, app checks, and
browser simulation. The database clone alone measured approximately 4m05s.
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

- Test a deployed-PWA cold-cache offline scoresheet and explicit stale-overwrite/conflict and
  duplicate-mutation flows in two browser profiles. The current OCC probe and unit suites are
  supporting evidence, not the end-to-end gate.
- Resolve source-to-destination handler identity mapping and verify recovered ownership/handler
  display, including the source handler's Auth/people relationship.
- Exercise live private show-day Broadcast delivery after repair and confirm the required database
  RPCs under the recovered Auth/role configuration. No Edge Functions are deployed in the destination;
  ancillary email, payment, push, and premium flows remain untested.
- Verify actual physical-tablet synchronization; the browser simulation is not tablet evidence.
- Check remaining ownership/handler relationship tables and explicit referential-integrity queries.
- Test any additional damaged columns and hard/soft-delete paths before calling them proven.
- Record actual retention and accepted RPO/RTO; resolve copied-job startup handling before launch.
- Plan independent Storage-file protection; database backups exclude uploaded file contents.
- Decide whether missing Edge Functions and the absence of `entries` from the Realtime publication are
  acceptable for the recovered app, then configure only inside a separately approved test destination.
- Implement/test the separately approved export direction later; this rehearsal does not prove it.

MYK9-110 remains open. A successful database rehearsal does not complete the launch durability gate.
