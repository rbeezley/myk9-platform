# MYK9-110 cross-project recovery rehearsal — execution plan

> **Status:** Complete

Date: 2026-09-07

## Objective

Extend the existing nightly-backup rehearsal across a project boundary: use the disposable
restore `yltegnpcnqrtjurxdmon` only after verifying its identity and containment, transfer a
small selected set of backup rows into a separate disposable recovery destination, repair the
scoped scoring damage there, and test the isolated app plus browser replication flow. The source
project `sojmvhhwsjxmfistvzbe` and shared deployment settings remain read-only.

## Execution

1. Read the current runbook and issue evidence; verify the existing project still exists and has
   14 copied cron jobs with zero active before creating another disposable project.
2. Create or select a separately named disposable recovery destination, record its ref, and
   disable/verify copied jobs before any transfer. Keep outbound email/payment activity contained.
3. Export only selected backup records and relationship rows from the existing disposable restore
   through private local staging; import them into the destination with exact row-count and
   relationship assertions. Apply only the documented scoring-column repair in a transaction,
   recalculate placements, and verify replication version/timestamp advancement plus preservation
   of newer notes and unrelated shows.
4. Configure an isolated test app against the destination only. Identify and record Auth, API,
   Functions, Realtime, and Storage dependencies; do not change shared deployment settings.
5. Verify secretary login/role boundaries, show and entry access, scoring, placements, and public
   results. Exercise a separate test browser/device through the existing replication flow,
   including offline queue/reconnect, stale-overwrite, queued-score, and duplicate-mutation checks.
   Label browser simulation separately from physical-tablet evidence.
6. Record timestamps, total recovery time, manual configuration, failures/fixes, and untested
   dependencies. Do not convert an observed duration into an accepted RPO/RTO.
7. Update the runbook and MYK9-110 with sanitized evidence and remaining gaps. Delete only the
   exact disposable resources after evidence is saved and deletion is explicitly authorized.

## Testing phase and pass criteria

- Read-only source/destination identity, cron containment, counts, fingerprints, foreign-key
  relationships, placements, class status/finalization, and replication markers all match the
  intended repair; newer unrelated data survives.
- Isolated app workflows and permissions pass for secretary, judge/steward boundaries, scoring,
  placements, and public results; no source/shared app setting is touched.
- Replication passes on a second test browser/device with offline/reconnect and no stale overwrite,
  lost queued score, or duplicate mutation. Physical-tablet testing is explicitly recorded as
  untested unless an operator separately performs it.
- Any replication conflict, uncertain authorization behavior, outbound side effect, or target
  mismatch stops the rehearsal for operator review.

## Explicit non-goals

Do not enable PITR, implement hourly exports, restore over the source, run a whole-project
in-place restore, connect ordinary user tablets, or claim formal RPO/RTO acceptance.

## Observed results — 2026-09-07

- Existing restore `yltegnpcnqrtjurxdmon` was verified as `myk9-110-single-show-test-2026-09-07`; its
  14 copied cron jobs were all inactive. New destination `nzihqlfcqntxjvhdttzf` was created as
  `myk9-110-cross-project-recovery-2026-09-07`; its 11 migration-created jobs were also all inactive.
- Five selected backup score rows crossed from the existing restore into the destination's protected
  `dr_myk9110` staging table. Five rows were damaged, five repaired by scoring columns, and placements
  were re-derived. Counts: 5/5 recovered values, 5/5 placement matches, 5/5 relationship chains,
  5/5 unchanged non-scoring fields, 5/5 version advances, and 5/5 timestamp advances. The newer
  destination secretary note survived.
- The isolated app was run locally with destination URL/key environment variables only. Secretary
  login, show/entry management, ringside, scoring, placements, and a clean public show page passed.
  An exhibitor login was redirected away from `/secretary/dashboard`, confirming the tested boundary.
- Browser offline simulation showed the offline alert, saved one qualified score locally, and after
  reconnect the destination contained one qualified score with no duplicate visible mutation. This
  was then read in a separate authenticated browser: the class showed 65 pending, 1 completed, and
  Load 01 as qualified. This is browser evidence, not physical-tablet evidence. The offline attempt
  to load a previously uncached scoresheet hit a Vite dynamic-import failure, so that cold-cache path
  remains a failure/gap.
- Follow-up validation accepted one versioned destination write and rejected a second write carrying
  the stale version (`first_count=1`, `second_count=0`) inside a rolled-back transaction. The
  replication package's duplicate-insert and OCC suites passed: 23/23 and 94/94 tests. This is
  database/unit evidence, not a two-browser end-to-end conflict rehearsal.
- Manual configuration: six auto-confirmed contained Auth users; destination API URL and anon key in
  the local process; repository migrations plus `seed-demo.sql`; cron deactivation; protected staging
  table; no outbound invitations. Edge Functions deployed: 0. The destination has the required
  `ringside_update_entry` and `recalculate_class_placements` RPCs, plus `entries` and `classes`
  triggers for the private show-day Broadcast channel. The Postgres Realtime publication contains
  `shows`, `show_messages`, and `show_announcements`; show-day entry refresh uses Broadcast rather
  than `postgres_changes`, but live Broadcast delivery was not independently exercised after repair.
  Storage buckets exist, but uploaded file recovery was not tested. Seed/scoring produced expected
  warnings for missing Realtime message partitions and absent Edge Function push configuration.
- Handler identity remains unresolved: all five recovered rows have destination handler IDs, but
  none of the five source backup handler IDs matched a destination `people.id`. A mapping/export
  step is required before treating recovered ownership or official handler display as proven.
- A production build was inspected: the PWA service-worker manifest lists the at-show route chunks,
  so the observed cold-cache failure is specific to the Vite dev-server rehearsal. A deployed-PWA
  offline navigation test is still required; this inspection does not close the gap.
- Destination project metadata was created at 17:36:12.066870 UTC; the final post-reconnect server
  verification completed at 18:18:56.641254 UTC: 42m44.6s elapsed wall time including provisioning,
  migrations, configuration, repair, app checks, and the browser simulation. The prior physical clone
  measurement remains 4m05s. Neither is an accepted RTO.
- Source database and shared deployment settings were not changed. The destination remains disposable
  and was not deleted because exact-target deletion authorization was not yet recorded.

## Follow-up disposition

- Item 1 remains open for two-browser stale-overwrite/conflict and duplicate-mutation flows, deployed-PWA
  cold-cache navigation, source-to-destination handler identity mapping, and live private Broadcast
  delivery after repair.
- The current OCC probe and replication suites are supporting evidence only. No Edge Functions are
  deployed in the destination; ancillary email, payment, push, and premium flows remain untested.
- Physical-tablet synchronization and accepted RPO/RTO are pre-show gates. Storage-file recovery is
  separate work. Housekeeping is limited to reviewing/committing these docs and deleting only the
  explicitly authorized disposable project refs.
