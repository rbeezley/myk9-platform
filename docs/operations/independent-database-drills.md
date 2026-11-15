# Recovery drills: one-sitting checklist (MYK9-110)

Prepared 2026-11-15 for the owner. Nothing here has been run. PITR is deferred by owner decision
(2026-09-07); the accepted targets are in [independent-database-restore.md](independent-database-restore.md)
(RPO 60 minutes on show weekends, overnight interval on weekdays; RTO 60 minutes for database recovery).

Run steps 1 to 6 in order, in one sitting, against **one drill project**. The owner creates it at the
start; step 6 deletes it, last. No drill deletes it and no drill cleans up another drill's input.
Procedures that already exist are linked, not restated:
[exports](independent-database-exports.md), [restore of an export](independent-database-restore.md)
(timed 25m12.54s on 2026-09-08, into an existing clone, not a fresh project),
[devices after restore](nightly-backup-recovery.md#devices-after-an-in-place-restore),
[show incident classes and hard-delete query](go-live-runbook.md#241-partial-recovery--one-show-without-rolling-back-the-project).

## Rules

- Never run a write against `sojmvhhwsjxmfistvzbe`. Read-only commands against it are allowed, for example
  `supabase functions list --project-ref sojmvhhwsjxmfistvzbe`.
- `umask 077`; work in a private directory outside the repository; keys, URLs with passwords and
  decrypted data never go in chat, command arguments or logs.
- No live secrets in the drill project. Leave Stripe, email (Resend), push (VAPID) and SMS secrets unset,
  or use test or sandbox keys only. Point no webhook at it. Never send email or push from it. Edge Function
  deploys use `--no-verify-jwt` (repo rule).
- A fresh project restored from the export has no `pg_cron` jobs (`cron.job` is excluded). Create none. The
  only cron check is zero active jobs: `select count(*) from cron.job where active;`.
- Cost: the owner creates the project, and it needs the plan tier the restore doc's destination used
  (Pro, same region as production, Postgres major equal to the manifest's source). The owner checks the
  cost before creating it. An agent never creates or deletes it.

## Clocks

- **Overall RTO** starts at the first download command (step 1) and stops when drill 1's restore
  verification passes (step 2). Threshold 60 minutes. Building the restore inputs counts.
- **Project creation wait** (click to Healthy) is recorded separately and is **out** of every RTO.
- Each later drill starts at its own first command and stops at its own stop event, stated in its step.
  Each is judged by its own threshold. Only drill 1 carries the 60 minute database RTO.

## Step 0. Create the project (owner)

Create the drill project in the Supabase dashboard. Note the click time, the Healthy time and the
**ref** (20 characters). Record the wait in the results block.

## Step 1. Common preparation (runnable as written)

Credentials come from your recovery copy (restore doc step 2), `~/.config/myk9-backups/credentials.env`,
which holds `MYK9_EXPORT_ACCESS_KEY_ID`, `MYK9_EXPORT_SECRET_ACCESS_KEY` and `MYK9_EXPORT_ENCRYPTION_KEY`.
Load it without echoing: the first command below does.

```bash
umask 077
DIR="$HOME/myk9-drill-$(date +%Y%m%d)"; mkdir -p "$DIR/dl"
set -a; . "$HOME/.config/myk9-backups/credentials.env"; set +a
export AWS_ACCESS_KEY_ID="$MYK9_EXPORT_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$MYK9_EXPORT_SECRET_ACCESS_KEY"
export BACKUP_ENCRYPTION_KEY="$MYK9_EXPORT_ENCRYPTION_KEY"
R2_ENDPOINT="$(gh variable get MYK9_EXPORT_S3_ENDPOINT)"   # not a secret; the repository variable
```

Then set the drill project's values (Dashboard, Project Settings: the ref, the database connection string,
and under API the `service_role` key). Type them at the prompts; they never go on a command line or in a log.
`drillsql` is the only way this page talks to a database: it refuses a URL that does not name the drill ref
or that names production.

```bash
read -r DRILL_REF                                   # the drill project's 20-character ref
read -rs DRILL_DB_URL && export DRILL_DB_URL        # its connection string (postgres user)
read -rs DRILL_SERVICE_KEY && export DRILL_SERVICE_KEY
drillsql() {
  case "$DRILL_DB_URL" in *sojmvhhwsjxmfistvzbe*) echo "REFUSED: production URL" >&2; return 1;; esac
  case "$DRILL_DB_URL" in *"$DRILL_REF"*) ;; *) echo "REFUSED: URL does not name $DRILL_REF" >&2; return 1;; esac
  psql "$DRILL_DB_URL" -X -v ON_ERROR_STOP=1 "$@"
}
drillsql -c '\conninfo'                             # check the host names the drill ref
```

Every SQL block below runs through `drillsql` (interactively: `drillsql`, then paste). Never paste them
into a dashboard SQL editor or a `psql` session opened another way.

Pick the newest snapshot folder (they are UTC timestamps, so the last in sort order is newest), then
**start the overall clock** at the first `cp`:

```bash
SNAP="$(aws s3 ls "s3://myk9-database-backups/myk9-platform/" --endpoint-url "$R2_ENDPOINT" --region auto \
  | awk '$1 == "PRE" {print $2}' | sort | tail -1)"; echo "$SNAP"
for f in manifest.json database.dump.enc globals.sql.enc; do
  aws s3 cp "s3://myk9-database-backups/myk9-platform/${SNAP}${f}" "$DIR/dl/$f" \
    --endpoint-url "$R2_ENDPOINT" --region auto
done
pnpm exec tsx scripts/backup/decrypt.ts --manifest "$DIR/dl/manifest.json" \
  --dump "$DIR/dl/database.dump.enc" --globals "$DIR/dl/globals.sql.enc" --out-dir "$DIR/decrypted"
```

(Run from the worktree root.) Decrypt verifies the checksum and authentication. It must exit 0 and print
`"status":"decrypted"`; otherwise the export is unusable: take the previous snapshot and file the failed
one as a backup incident. Output: `$DIR/decrypted/{database.dump,globals.sql,manifest.json}`.

**RPO.** `createdAt` is in `manifest.json`; RPO measured is now minus `createdAt`, at the first `cp`.
Threshold: for a Friday to Sunday daytime drill (06:00 to 22:00 America/Chicago) at most 60 minutes.
On any other day the threshold is "the export is from the latest 03:00 America/Chicago slot or later"
and the result is labelled "weekday, not a weekend RPO test".

## Step 2. Drill 1: fresh-project rebuild (the 60 minute RTO)

**Goal:** the export alone rebuilds schema and data in a project that never held myK9 data.
**Needs:** PostgreSQL client 18 (`pg_restore --version`).

1. Inspect first: `pg_restore --list "$DIR/decrypted/database.dump" | head -50`; compare extensions and
   roles with the empty project (restore doc steps 5 to 7).
2. Build the reviewed restore inputs and run the single transaction exactly as in
   [Build and review the restore inputs](independent-database-restore.md#build-and-review-the-restore-inputs)
   and [Execute as one transaction](independent-database-restore.md#execute-as-one-transaction). The
   destination has no application schema, so its drop and recreate step is a no-op. Note every statement
   that errors here but did not on the clone.
3. Run [verification](independent-database-restore.md#verification-and-cleanup). **Stop the overall clock
   when it passes.** Leave the project, the decrypted files and the restored data in place.

**Pass:** all imported tables match archive counts, and the restore doc's verification checks pass (where
it asks for per-row fingerprints and no query is provided, counts plus three sampled rows per core table
compared by eye is enough; note which you did); RLS, policies, table and column ACLs
and sequences verified; zero active cron jobs; overall RTO at most 60 minutes.
**Fail:** any mismatch, or over 60 minutes (record the real figure; the target then needs an owner decision).
**Abort:** the transaction rolls back twice for a cause you cannot name, or the connection's ref is not the one from step 0.

## Step 3. Drill 2: uploaded Storage files (read-only; proves the gap)

**Known:** the exporter dumps the database only (`scripts/backup/export.ts`: `pg_dump`, `pg_dumpall
--globals-only`); no workflow copies Storage files. The export holds `storage.objects` and
`storage.buckets` metadata rows, never file bytes, and Supabase physical backups exclude them too. So the
expected result is: metadata present, files absent. Proposed fix, not built and an owner decision: a
nightly workflow that mirrors every bucket to a second private R2 bucket with 30 day retention, sized
from the inventory below.

**Start** at the inventory query; **stop** after the last sampled request is recorded.

1. Through `drillsql` (Step 1):

   ```sql
   SELECT b.id AS bucket, b.public, count(o.id) AS objects,
          coalesce(sum((o.metadata->>'size')::bigint), 0) AS bytes
   FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id = b.id
   GROUP BY b.id, b.public ORDER BY b.id;
   SELECT DISTINCT ON (bucket_id) bucket_id, name FROM storage.objects ORDER BY bucket_id, name;
   ```

2. For one object per bucket, build the URL from the **drill project ref**, the `bucket_id` and `name`
   above, never from a stored URL column: restored rows embed production Storage URLs, and requesting
   one tests production, not the drill. Set `B` and `N` from one row of the second query
   (`B=premium-published; N='club/show/premium.pdf'`, for example), then:
   - Public bucket: `curl -sS -o /dev/null -w '%{http_code}\n' "https://$DRILL_REF.supabase.co/storage/v1/object/public/$B/$N"`
   - Private bucket: put the drill project's service key (Step 1) in a header file, then request with it:

     ```bash
     printf 'Authorization: Bearer %s\n' "$DRILL_SERVICE_KEY" > "$DIR/auth.hdr"
     curl -sS -w '\n%{http_code}\n' -H @"$DIR/auth.hdr" "https://$DRILL_REF.supabase.co/storage/v1/object/authenticated/$B/$N"
     ```

   **Reading the answer:** HTTP 404, or HTTP 400 whose body says `"statusCode":"404"`, is the expected
   "file is gone" signal. 401 or 403 means your auth is wrong: fix it and request again before recording.
   A 200 with bytes is unexpected: stop and find out why (a Storage backup exists that this document missed).

**Record:** the inventory table; per bucket, whether its files can be regenerated from database rows
(name the generator, for example trial packets) or are original uploads.
**Pass:** metadata rows present and every sampled request returned the 404 signal (gap confirmed; the byte
total sizes the fix). **Fail:** a sampled request returned a file, or no metadata rows exist.

## Step 4. Drill 3: application failover

**Start** at the first command below; **stop** after step 5 below. **Threshold:** 30 minutes, a
proposed application budget the owner may change before the run, not after seeing numbers.

**Auth in the export:** `export.ts` runs `pg_dump --format=custom` with no schema filter, so Auth schema
rows, `auth.users` with password hashes included, are in the dump (27 Auth users restored on 2026-09-08).
Database **role** passwords (`--no-role-passwords`) and the protected Auth tables listed in the restore
doc are not. Sign-in after restore is unverified until this drill shows it.

1. **Point a build at the drill project.** Dashboard, Project Settings, API: copy the URL and the anon key.
   Put them in an untracked `apps/myk9show/.env.local` as `VITE_SUPABASE_URL=...` and
   `VITE_SUPABASE_ANON_KEY=...` (names from `apps/myk9show/.env.example`), then serve it where the step 5
   tablet can reach it: `cd apps/myk9show && pnpm exec vite --host` (the LAN address it prints), or a
   staging build. Never the production Vercel project, and confirm with the owner before touching any
   Vercel setting.
2. **Sign-in.** Pick one restored Auth user per role you walk (secretary, judge, exhibitor). Set a known
   password on each directly in the drill project (dashboard Authentication, Users, or the Auth admin
   API with its service key). Never use "send recovery email".
3. **Edge Functions.** List production's (read-only, see Rules) and record which the drill project would
   need. Deploying to the drill project needs its ref explicitly and `--no-verify-jwt`. Secrets and Vault
   values are not in the export: list each you had to re-enter (test or sandbox values only).
4. **Walks.** Secretary dashboard, entry list count, ringside podium, public show page, exhibitor redirect,
   and one **online** score save that persists after reload. Compare Realtime
   (`select * from pg_publication_tables;`) with production and record differences (`entries` is known absent).
5. **Device pull.** One real tablet on the test build: sync and confirm a restored value is shown. **Stop the clock.**
6. After the stop: cold offline load. This is a known failing path. **Record it only; it is excluded from
   pass/fail and from the clock.** Then write down the DNS or environment change production would need
   (`VITE_SUPABASE_URL` and key, Auth redirect URLs, Stripe and email webhooks, the `pg_cron` export
   dispatch) with a time estimate. Do not make it.

**Pass:** every role in step 2 signs in, the online score persists, the tablet shows the restored value,
and elapsed time is at most 30 minutes. **Fail:** any of the first three, or over the budget.

## Step 5. Drill 4: single-show restore

**Goal:** restore one show's rows from the export without rolling back the project. Tool:
`scripts/backup/single-show-restore.ts` (a dry run unless `--execute`). **Start** at
the dry-run command; **stop** when the verification below passes. Threshold: 60 minutes.

1. **Make the gap, in the drill project only, through `drillsql`.** Show ids come from a production export,
   so the same id exists in production: never run this anywhere else. Pick a show with no payments, then
   hard-delete it:

   ```bash
   drillsql -c '\conninfo'                          # host must name $DRILL_REF
   drillsql -c 'select id, name from public.shows;'
   SHOW=<show-uuid>
   drillsql -c "select count(*) from public.show_payments where show_id = '$SHOW';"   # must be 0
   drillsql -c "delete from public.shows where id = '$SHOW';"
   ```

   Record every other show's entry count before and after.

2. **Dry run** (touches nothing):

   ```bash
   pnpm exec tsx scripts/backup/single-show-restore.ts \
     --dir "$DIR/decrypted" --show-id "$SHOW" --out "$DIR/plan.sql"
   ```

   Record the counts and read every WARNING. **Money tables are excluded by default**: the Stripe ledger,
   payouts, refunds and the cart and checkout tables, listed by exact name in
   `scripts/backup/single-show-restore-tables.ts`. Stripe is the record for money and restored rows can
   double-count, so add `--include-money` only on an owner decision. Classification is fail-closed: a table
   in the show's cascade that is in neither set makes the dry run refuse and name it; pass `--exclude-table`
   for it or classify it in that file.

3. **Messaging check, before `--execute`.** The summary prints `messaging: N pending lifecycle email
job(s) would be restored`: `show_lifecycle_email_jobs` rows with `status = 'ready'` (others are `sent`,
   `failed`, `skipped`, `dismissed`) that the email cron would send. The dedupe logs (`show_eve_nudge_log`,
   `sms_proximity_sends`, `waitlist_notification_events`) restore with the show, so nothing re-sends from
   them. If N is not zero, decide before `--execute` which of them must not send. Editing `plan.sql` does
   nothing: `--execute` rebuilds the plan from the export and never reads that file. The only control is to
   mark them `skipped` as the very next command after `--execute` (step 4), before anything else. The
   drill project runs no crons; production does, so there the gap is the seconds between the two commands.

   ```bash
   drillsql -c "select id, step_type, due_at, status from public.show_lifecycle_email_jobs
     where show_id = '$SHOW' and status = 'ready' order by due_at;"
   ```

4. **Execute** against the drill project (the URL stays in the environment, never on the command line):

   ```bash
   export RESTORE_TARGET_DATABASE_URL="$DRILL_DB_URL"
   pnpm exec tsx scripts/backup/single-show-restore.ts \
     --dir "$DIR/decrypted" --show-id "$SHOW" --execute --target-ref "$DRILL_REF"
   # next command, only if step 3 decided some ready jobs must not send:
   drillsql -c "update public.show_lifecycle_email_jobs set status = 'skipped', skipped_at = now()
     where show_id = '$SHOW' and status = 'ready';"
   ```

   It refuses a missing or unmatched `--target-ref`, a URL that does not name that ref, and the production ref.
   (`status` and `skipped_at` are the columns the app itself sets to skip a job, migration
   `20260708120000_show_lifecycle_emails.sql`.) Narrow it with `and id in (...)` to skip only some jobs.

5. **Verify against the decrypted archive**, not the live source: per-table counts equal the dry run's (rows
   skipped by `ON CONFLICT DO NOTHING` explain any difference); scored entries equal the archive's; other
   shows' entry counts unchanged from step 1; run `recalculate_class_placements` only if placements differ.
   **Stop the clock.**

**Pass:** the missing-parent preflight passed, counts match, other shows unchanged, scored entries match,
elapsed at most 60 minutes. **Fail:** missing parents (restore dogs, people, clubs and Auth users first,
then rerun) or an unexplained count difference. **Abort:** a transaction error (it rolls back; fix the
named cause) or you cannot name the target ref.
**Limits:** it restores rows reachable by cascade from the show, not Storage files, Auth users, Stripe state
or rows referencing the show without a cascade. Existing rows win (`DO NOTHING`); for overwritten scores see
go-live-runbook.md path D.

**Production incident use.** The same script restores into production only with
`--i-understand-this-is-production --target-ref sojmvhhwsjxmfistvzbe`, and the owner is the approver, in
the incident record before the run. Keep steps 3 and 4's skip update: production runs the email and SMS
crons, and the skip update must be the very next command after `--execute`. Follow the
go-live runbook (linked above) for classification and the rest; this page is not that procedure.

## Step 6. Clean up and delete the project (last)

1. Fill in the results block below and save it (a comment on MYK9-110) **before** deleting anything.
2. `rm -rf "$DIR"` (decrypted data, plans and `auth.hdr`), `unset BACKUP_ENCRYPTION_KEY AWS_SECRET_ACCESS_KEY
AWS_ACCESS_KEY_ID RESTORE_TARGET_DATABASE_URL DRILL_SERVICE_KEY`, remove the drill's `.env.local` values.
3. The owner deletes the drill project in the dashboard **the same day**. This is the last step.

## Results block (copy, fill in, paste)

```
Recovery drills, <date>  <weekday | weekend>
Export createdAt: <timestamp>   Snapshot: <folder>
RPO: measured <min>  threshold <60 min weekend daytime | latest 03:00 slot>  <pass|fail>
Project creation wait (out of every RTO): <min>   Drill project ref: <ref>

Drill 1 (rebuild):   start <hh:mm>  stop <hh:mm>  RTO measured <min>  threshold 60  <pass|fail>  notes:
Drill 2 (Storage):   start <hh:mm>  stop <hh:mm>  measured <min>  threshold none  <pass|fail>  notes (buckets, bytes, 404s):
Drill 3 (failover):  start <hh:mm>  stop <hh:mm>  measured <min>  threshold 30 (owner may change before the run)  <pass|fail>
                     cold offline load (recorded only, not pass/fail): <result>   notes:
Drill 4 (one show):  start <hh:mm>  stop <hh:mm>  measured <min>  threshold 60  <pass|fail>  messaging N: <n>  notes:
Project deleted by owner: <time>
```
