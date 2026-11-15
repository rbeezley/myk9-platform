# Recovery drills runbook (MYK9-110)

Owner: Richard Beezley. Prepared 2026-11-15 so the owner can run the four outstanding drills in
one sitting each. Nothing here has been run: every "Result" cell below is blank until you fill it.
PITR is deferred by owner decision (2026-09-07); the accepted targets are in
[independent-database-restore.md](independent-database-restore.md) (RPO 60 min on show weekends,
overnight interval on weekdays; RTO 60 min for database recovery).

This page only adds what is missing. Procedures that already exist are linked, not restated:

- Export, cadence, retention: [independent-database-exports.md](independent-database-exports.md)
- Database restore of an export (timed 25m12.54s on 2026-09-08): [independent-database-restore.md](independent-database-restore.md)
- Physical-backup clone, single-show score repair, devices after restore: [nightly-backup-recovery.md](nightly-backup-recovery.md)
- Show incident classes A to D and hard-delete catalog query: [go-live-runbook.md § 2.4.1](go-live-runbook.md#241-partial-recovery--one-show-without-rolling-back-the-project)

## Where each drill stands

| #   | Drill                         | Written, timed record today                                                                                                                                                          | Still missing                                                                                                         |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Fresh-project rebuild         | None from an export. 2026-09-07 built a new project from repo migrations + seed (42m44.6s, not an export). 2026-09-08 restored an export into an existing clone, not a fresh project | Export into a brand-new empty project, with schema from the export only                                               |
| 2   | Uploaded Storage recovery     | None. No Storage backup exists (see Drill 2)                                                                                                                                         | A decision to close the gap; the drill proves the gap size today                                                      |
| 3   | Full application failover     | Partial, 2026-09-07: secretary, ringside and public pages and one offline score against a recovered project. Not timed end to end, not from an export                                | Auth, Edge Functions, Realtime, Storage, secrets, DNS or env switch, tablet pull, with a clock                        |
| 4   | Single-show / partial restore | Partial, 2026-09-07: five scored entries repaired from a physical clone via staging (backup rows, not an export). Cross-project transfer of five rows                                | Whole-show restore from an **export** with `single-show-restore.ts`; hard-delete path (class C) at full show fidelity |

## Rules for every drill

- Disposable projects only. Never run anything here against `sojmvhhwsjxmfistvzbe`.
  `single-show-restore.ts` refuses that ref without `--i-understand-this-is-production`; do not use it in a drill.
- Create each target project yourself, in the Supabase dashboard, and write down its ref before starting.
- `umask 077`; work in a private directory outside the repository; never put keys, URLs with
  passwords or decrypted data in chat, command arguments or logs.
- Copy cron jobs off immediately in every restored project (see nightly-backup-recovery.md step 3);
  a copy must never dispatch exports for production.
- Record, for every drill: export timestamp used (this is the RPO evidence: now minus export
  `createdAt`), clock start, clock stop, and each step's elapsed time. RTO is stop minus start,
  excluding project creation wait only if you also record that wait separately.
- Evidence goes in a new section of this file under "Drill results", one dated block per run.
- Delete the disposable project last, only after evidence is saved.

## Common preparation (10 minutes, once)

1. Pick the newest complete export: list `s3://myk9-database-backups/myk9-platform/` (credentials
   from your recovery copy, per step 2 to 3 of the restore procedure). Note the snapshot folder.
2. Download `manifest.json`, `database.dump.enc`, `globals.sql.enc` from that one folder.
3. Decrypt (verifies checksum and authentication):

   ```bash
   BACKUP_ENCRYPTION_KEY="$(…from recovery copy…)" pnpm exec tsx scripts/backup/decrypt.ts \
     --manifest "$DIR/manifest.json" --dump "$DIR/database.dump.enc" \
     --globals "$DIR/globals.sql.enc" --out-dir "$DIR/decrypted"
   ```

4. Record `createdAt` from `manifest.json`. Pass: decrypt exits 0 and prints `status: decrypted`.
   Abort: checksum or authentication failure (the export is unusable; try the previous snapshot and
   file the failed one as a backup incident).

## Drill 1 — Fresh-project rebuild

**Goal:** prove the independent export alone can rebuild schema and data in a project that has never held myK9 data.

**Preconditions:** common preparation done; a new empty Supabase project (note: Pro, same region, Postgres major equal to the manifest's source); PostgreSQL client 18 on your machine (`pg_restore --version`).

**Steps**

1. Start the clock when the empty project reports **Healthy**. Record the ref.
2. Inspect before touching: `pg_restore --list decrypted/database.dump | head -50`; compare extensions
   and roles against the empty project (restore doc steps 5 to 7).
3. Build the reviewed restore inputs and run the single transaction exactly as in
   [Build and review the restore inputs](independent-database-restore.md#build-and-review-the-restore-inputs)
   and [Execute as one transaction](independent-database-restore.md#execute-as-one-transaction).
   The only difference from 2026-09-08: the destination has no application schema yet, so step 2 of
   that transaction (drop and recreate) is a no-op; record every statement that errors on a fresh project but did not on the clone.
4. Run the restore doc's [verification](independent-database-restore.md#verification-and-cleanup).
5. Stop the clock after verification passes.

**Record:** export `createdAt`; project ref; times for steps 2, 3, 4; total; every exclusion that
needed a different decision on a fresh project (roles, default grants, Vault, publications).

**Pass:** all imported tables match archive counts and fingerprints; RLS, policies, table and column
ACLs and sequences verified; zero active cron jobs; total under 60 minutes.
**Fail:** any count or fingerprint mismatch, or total over 60 minutes (record the real figure; the target then needs an owner decision).
**Abort:** transaction rolls back twice for the same cause you cannot name; the project ref on the connection is not the one you created.
**Cleanup:** remove decrypted files and generated SQL; delete the project after evidence is saved.

## Drill 2 — Uploaded Storage recovery

### What exists (verified by reading the repo on 2026-11-15)

- The exporter dumps the database only. `scripts/backup/export.ts` runs `pg_dump` and
  `pg_dumpall --globals-only`; no workflow under `.github/workflows` copies Storage objects.
- The database export contains `storage.objects` and `storage.buckets` **metadata rows** (the 2026-09-08
  restore matched 5 Storage metadata tables and 3 buckets) but not file bytes.
- Supabase physical backups likewise exclude file contents (nightly-backup-recovery.md, "Remaining evidence gates").
- Buckets created by repository migrations include `premium-published` and `trial-packets`; the
  restore evidence counted three buckets. Run the inventory below for the real list.

### Gap, stated plainly

**There is no backup of uploaded Storage files.** If a bucket or object is deleted, or the project is
lost, the files are gone; only their metadata rows can be restored. Anything not regenerable from the
database (logos, signature images, uploaded premium PDFs) is unrecoverable today.

**Smallest proposed fix (not built, needs an owner decision):** one scheduled workflow that runs
nightly after the database export, lists every bucket with the project's S3-compatible Storage
endpoint using a read-only key, and mirrors new or changed objects to a second private R2 bucket
(for example `myk9-storage-backups`, prefix `myk9-platform/<bucket>/`) with the existing R2
credentials pattern, plus a health check that compares object counts against `storage.objects`.
No encryption layer in the first version beyond R2 at-rest encryption, since the content is already
served to users; revisit if private signature images must be covered. Retention: keep deleted
objects 30 days via R2 object versioning or a delete-marker policy. Size it first from the inventory below.

### Drill (proves the gap and sizes the fix; read-only)

**Preconditions:** a disposable project restored from the export (Drill 1 output works).
**Steps**

1. On the **restored** project, in `psql` as `postgres` (never production):

   ```sql
   SELECT b.id AS bucket, b.public, count(o.id) AS objects,
          coalesce(sum((o.metadata->>'size')::bigint), 0) AS bytes
   FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id = b.id
   GROUP BY b.id, b.public ORDER BY b.id;
   ```

2. Pick one object from each bucket and request it through the restored project's Storage API.
   **Record:** the table above; for each bucket whether its files can be regenerated from database rows (name the generator, for example trial packets) or are original uploads.
   **Pass (the expected result today):** metadata rows are present and every sampled file request fails (404). That confirms the gap, and the byte total is the size input for the fix.
   **Unexpected:** a sampled file downloads. Stop and find out why; a Storage backup exists that this document missed.
   **Abort:** none needed (read-only). **Cleanup:** nothing beyond deleting the disposable project.

## Drill 3 — Full application failover

**Goal:** the app, pointed at a recovered project, works end to end, with the failover timed.

**Preconditions:** Drill 1 completed or repeated in the same sitting so you have a restored,
verified project; a staging or preview build of the app (never the production Vercel project; confirm with the owner before changing any Vercel setting); six test Auth users as in the 2026-09-07 rehearsal.

**Steps** (clock starts when you begin pointing the app at the project)

1. Collect the restored project's URL and anon key. Reset Auth passwords for the test users (role passwords are not in the export).
2. Edge Functions: list what production has (`supabase functions list --project-ref sojmvhhwsjxmfistvzbe` is read-only and allowed) and record which ones the recovered project would need. Deploying them to the **drill** project is allowed only with that project's ref explicitly; note elapsed time. Secrets and Vault values are not in the export; list each one you had to re-enter.
3. Realtime: check the publication membership on the drill project against production (`select * from pg_publication_tables`); record differences (entries is known to be absent, see nightly-backup-recovery.md).
4. Run the secretary, judge, exhibitor and public walks from the 2026-09-07 evidence (dashboard, entry list count, ringside podium, public show page, exhibitor redirect) and one **online** score save.
5. Device pull: use one real tablet on the test build, sync, confirm the restored value (nightly-backup-recovery.md, [Devices after an in-place restore](nightly-backup-recovery.md#devices-after-an-in-place-restore)). Cold offline load is a known failing path; record it again rather than skipping it.
6. Record what DNS or environment change production would need (the app's `VITE_SUPABASE_URL` and key, Auth redirect URLs, Stripe and email webhooks, the `pg_cron` export dispatch) and its time estimate; do not make it.
7. Stop the clock after step 5.

**Record:** each step's elapsed time; the list of things that needed manual reconfiguration; failures.
**Pass:** steps 4 and 5 pass; total (including Drill 1's restore time) under the 60 minute database RTO plus a stated application budget the owner sets after seeing the numbers.
**Fail:** any role cannot sign in, a score does not persist, or the tablet shows pre-restore values after a full sync.
**Abort:** the app build you are using reads a project ref you did not create. **Cleanup:** revoke test users, delete the project.

## Drill 4 — Single-show / partial recovery

**Goal:** restore one show's rows from an export into a target without rolling back the project.

**Tool:** `scripts/backup/single-show-restore.ts`. It reads the decrypted dump with `pg_restore`,
follows every `ON DELETE CASCADE` route from `public.shows` (so the nullable `show_id`, class and
trial routes are all covered), prints the per-table row counts and the rows that must already exist
in the target (dogs, people and so on), and can emit one transactional SQL plan. **Default is a dry
run that touches nothing.**

**Preconditions:** common preparation done; the show id (`select id, name from shows` on a project you may read); a target
project: for a realistic drill, a disposable project restored from an **older** export
(Drill 1) into which you then hard-delete the show (`delete from public.shows where id = '<id>'` there, never in production).

**Steps**

1. Dry run and keep the plan:

   ```bash
   pnpm exec tsx scripts/backup/single-show-restore.ts \
     --dir "$DIR/decrypted" --show-id <show-uuid> --out "$DIR/plan.sql"
   ```

   Record the counts. Read the WARNING lines: **money tables are excluded by default** (orders,
   show payments, payouts, money locks, refund requests and attempts, Stripe order refunds, payment links, Stripe
   accounts; whichever of these the schema has in the show's cascade). Stripe is the record for money, and restoring old rows
   can double-count. Pass `--include-money` only when the owner has decided the target must receive them; the plan then prints a warning and
   you reconcile against Stripe afterwards. `--exclude-table public.<name>` drops any other table.

2. Start the clock. Execute against the disposable target only (the URL stays in the environment, not on the command line):

   ```bash
   RESTORE_TARGET_DATABASE_URL='postgresql://…' pnpm exec tsx scripts/backup/single-show-restore.ts \
     --dir "$DIR/decrypted" --show-id <show-uuid> --execute --target-ref <drill-project-ref>
   ```

   `--execute` without `--target-ref`, a URL that does not name that ref, or the production ref all refuse.

3. Verify against the **decrypted archive**, not the live source: per-table counts equal the dry-run
   counts; entries with scores equal the archive's scored count; run `recalculate_class_placements`
   only if placements differ; every other show's entry count unchanged from before the run.
4. Stop the clock.

**Record:** export `createdAt`; dry-run counts; psql `INSERT 0 n` lines (rows skipped by
`ON CONFLICT DO NOTHING` are the difference from the dry-run count; explain any); elapsed time.
**Pass:** the missing-parent preflight passed, counts match, other shows unchanged, scored entries
match the archive, total under 60 minutes.
**Fail:** preflight reports missing parents (restore those rows first: dogs, people, clubs, Auth users;
then re-run), or any count differs without explanation.
**Abort:** transaction error (it rolls back; nothing is applied; fix the named cause and re-run), or you cannot name the target ref.
**Limits:** the script restores rows reachable by cascade from the show. It does not restore
Storage files, Auth users, Stripe state or rows referencing the show without a cascade. A show with
newer data in the target is not merged: existing rows win (`DO NOTHING`); use go-live-runbook.md
path D for overwritten scores. Delete `plan.sql` (it contains data) when finished.
**Cleanup:** delete plan and decrypted files; delete the disposable project.

## Drill results

Fill one block per run: date, drill number, export `createdAt` (RPO = clock start minus this),
project ref, elapsed times, pass/fail, deviations, follow-up issues filed.
