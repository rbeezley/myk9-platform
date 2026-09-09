# Restore an independent R2 database export

Owner: Richard Beezley. [MYK9-110](https://linear.app/myk9-platform/issue/MYK9-110).
This complements [independent exports](independent-database-exports.md) and
[daily physical-backup recovery](nightly-backup-recovery.md).

## What was actually tested

On 2026-09-08, the encrypted R2 export from `sojmvhhwsjxmfistvzbe` at
`2026-09-08T15:18:44.532Z` was downloaded, authenticated-decrypted with the owner's
separately saved key, and restored into the existing disposable physical clone
`yltegnpcnqrtjurxdmon`. [Export run](https://github.com/rbeezley/myk9-platform/actions/runs/34243841652).

The successful atomic restore took **1,512.54 seconds (25m12.54s)** over the Mac connection.
An earlier full attempt took 879.26 seconds and rolled back on a reserved-role default grant;
an initial schema-setup attempt also rolled back. Preparation, failed attempts, provisioning,
and verification are outside the successful-attempt time. This is not an accepted RTO.

All **160 imported tables** matched archive counts and exported-column row fingerprints:
131 public tables, 22 Auth tables, 5 Storage metadata tables, and 2 migration-history tables.
This included 266 dogs, 17 people, 5 clubs, 9 club members, 15 exhibitor profiles, 10 shows,
16 trials, 33 classes, 1,278 entries (6 scored), 27 Auth users, and 3 Storage buckets.
The empty club_officers table also matched.

Verified after commit: 131 public tables with RLS and table ACLs; 337 public policies;
16 Storage policies; 136 column ACL entries; public schema usage for anon/authenticated;
all 5 public/Auth sequence values and is_called flags; zero active cron jobs.
Three custom Auth triggers were recreated. Application objects remained owned by postgres.

## Scope boundaries

This restores application schema/data and supported Auth/Storage metadata into an already
provisioned Supabase destination. It does **not** prove reconstruction into a fresh project
or complete provider-independent failover. Provision and inspect the destination first;
do not assume the following retained provider objects can be recreated by postgres.

The rehearsal excluded 18 table-data entries:

- auth.schema_migrations.
- storage.migrations, storage.buckets_vectors, storage.vector_indexes.
- Nine Realtime runtime/migration entries (including dated message partitions).
- cron.job and cron.job_run_details; destination jobs stayed inactive.
- supabase_functions.hooks and supabase_functions.migrations.
- vault.secrets.

Supabase's schema definitions, extensions, roles, and provider-owned objects were retained.
The globals archive was inspected, not blindly applied over managed roles. Role password
hashes are intentionally absent from that archive. Twelve default-grant statements for
supabase_admin were excluded because postgres cannot apply them. Existing-object grants and
the postgres default grants were restored; the omitted managed-role defaults remain a gap.

Publication membership was not restored/retested. Uploaded Storage bytes, Edge Functions,
provider settings/API keys, Vault/root-key independence, live Realtime, and app login after
this logical restore were not tested. A physical clone can inherit encryption keys that
a fresh project lacks. See [Supabase logical restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Operator procedure

This is a supervised procedure for an explicitly approved disposable destination. Never run
it against `sojmvhhwsjxmfistvzbe`. A whole-database rollback needs its own incident approval;
single-show recovery should use the narrower procedure linked above.

1. Record the incident, chosen snapshot, destination ref, and recovery start time. Coordinate
   app writes and preserve unsynced tablet queues. A snapshot cannot recover later changes.
2. Obtain R2 credentials and the **original** encryption key from the recovery copy outside
   GitHub. The local rehearsal file was `~/.config/myk9-backups/credentials.env` (0600 in a
   0700 directory), containing MYK9_EXPORT_ACCESS_KEY_ID, MYK9_EXPORT_SECRET_ACCESS_KEY,
   and MYK9_EXPORT_ENCRYPTION_KEY. Keep a separate durable recovery copy; do not put secrets
   or decrypted database files in the repository, chat, command arguments, or logs.
3. Use a private working directory (`umask 077`). Download manifest.json, database.dump.enc,
   and globals.sql.enc from the **same** snapshot folder in private bucket
   `myk9-database-backups`, prefix `myk9-platform`. Use the R2 S3 endpoint recorded in the
   export configuration and region `auto`; map credentials to AWS_ACCESS_KEY_ID and
   AWS_SECRET_ACCESS_KEY without displaying their values.
4. Set BACKUP_ENCRYPTION_KEY from the saved MYK9_EXPORT_ENCRYPTION_KEY and run the checked-in
   decrypt CLI. This verifies SHA-256 and AES-GCM authentication before writing plaintext:

   ```bash
   pnpm exec tsx scripts/backup/decrypt.ts \
     --manifest "$RECOVERY_DIR/manifest.json" \
     --dump "$RECOVERY_DIR/database.dump.enc" \
     --globals "$RECOVERY_DIR/globals.sql.enc" \
     --out-dir "$RECOVERY_DIR/decrypted"
   ```

5. Confirm manifest.projectRef is the source ref, and inspect `pg_restore --list` using a
   client compatible with the archive (client 18 was tested against server 17.6). Inventory
   required extensions, roles, table/column definitions, and permissions on the destination.
   Compare the exclusions above against this snapshot; new objects require a reviewed decision.
6. Verify destination identity from its connection hostname/user and project configuration.
   Use PGSSLMODE=verify-full and the bundled public Supabase CA at
   `scripts/backup/supabase-prod-ca-2021.crt`. The rehearsal used the supported CLI's temporary
   login role, which expires; refresh it before connecting. Explicitly `SET ROLE postgres`
   inside psql; the pooler did not honor a requested role through PGOPTIONS.
7. Confirm zero active destination cron jobs. Before importing, preserve any destination-only
   work that must survive. The tested destination was explicitly disposable and its data was
   authorized for replacement. Do not copy active source jobs into a recovery project.

### Build and review the restore inputs

Keep generated SQL private. Do not execute the complete raw archive/globals against Supabase:
managed schemas/roles cause permission conflicts. Do not ignore arbitrary restore errors.

- Extract application pre-data, data, and post-data separately with pg_restore:
  `--no-owner --no-publications --no-subscriptions --schema public --schema private
--schema supabase_migrations --section <pre-data|data|post-data>`.
- Use a reviewed TOC list (`pg_restore --use-list`) for supported Auth/Storage TABLE DATA and
  SEQUENCE SET entries, the three custom Auth triggers, and the Storage policies. Exclude the
  four protected Auth/Storage tables named above. Restore no other managed data implicitly.
- Extract the `ACL - SCHEMA public` TOC entry separately; a schema filter alone did not
  preserve that schema ACL in this rehearsal.
- In application post-data only, exclude the 12 `ALTER DEFAULT PRIVILEGES FOR ROLE
supabase_admin ...` statements. Preserve explicit table, column, function, and schema grants
  and the postgres defaults. Record the exclusions. Do not filter or rewrite COPY row text.

### Execute as one transaction

Use psql with `-X` and `ON_ERROR_STOP=1`, an explicit target connection, and private logs.
The reviewed input order is:

1. SET ROLE postgres; BEGIN; SET LOCAL session_replication_role=replica.
2. Assert zero active cron jobs. Drop only public, private, and supabase_migrations with
   CASCADE in the disposable destination. Recreate public owned by pg_database_owner and the
   other two schemas owned by postgres. CASCADE also removes dependent custom objects, which
   is why their inventory and restoration are required.
3. Remove destination Storage policies before recreating those from the archive. Truncate
   the 27 selected Auth/Storage data tables together with CASCADE, after reviewing dependencies.
4. Load application pre-data, then the selected managed input (data/sequences/custom objects),
   application data, and application post-data. Replica mode suppresses normal data triggers
   during loading; do not leave it enabled in application connections.
5. Apply the extracted public schema ACL. Restore normal session_replication_role, assert
   zero active cron jobs, then COMMIT. An error must roll back the transaction.

Do not open the app against the destination until verification below passes. Reconfigure
publications, provider settings, integrations, and app endpoints only within separately
approved failover work; committing database rows does not switch production traffic.

## Verification and cleanup

- Compare every imported table against **the downloaded archive**, not the changing live
  source. Check counts and all exported-column values, including scores and relationship IDs.
  The rehearsal sorted per-row SHA-256 fingerprints so row order did not affect the result.
  Canonicalize PostgreSQL output consistently: inet-to-text adds a netmask that COPY can omit;
  using inet_out resolved the initial auth.sessions comparison difference without data edits.
- Verify ID sequences and is_called, foreign-key/constraint restoration, RLS, policy definitions,
  table **and column** ACLs, schema usage, and required SECURITY DEFINER function ownership.
- Record imported/excluded objects, successful and failed elapsed times, remaining gaps,
  and the chosen snapshot. Test application login and required live flows before actual failover.
- Remove plaintext dumps, SQL containing data, and temporary connection credentials after
  verification. Retain encrypted backups, safe evidence, and the separately saved recovery key.
- Delete the disposable project only with exact-target authorization after evidence is saved.
  Keep MYK9-110 open until the remaining recovery and operational acceptance criteria pass.
