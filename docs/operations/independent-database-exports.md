# Independent database exports (MYK9-110 item 2)

This runbook is the activation companion to the disabled workflow
`.github/workflows/independent-database-exports.yml`. It is separate from Supabase physical
backups and from the item 1 recovery rehearsal.

## Scope and boundary

The export contains a PostgreSQL custom-format dump and `pg_dumpall --globals-only --no-role-passwords`:
schema, application rows, Auth/Storage database metadata, extensions, policies/RLS, table grants,
and database role definitions where the approved export role can read them. Supabase-managed role
password hashes are intentionally excluded and must be recreated/reset on restore. The encrypted
objects are stored outside Supabase. The export does not contain bytes in Supabase Storage. It also cannot
recover a write after the last successful export, a delayed/failed scheduled job, or a score
still held in an offline tablet queue. Keep an independent score capture/reconciliation source
for those cases; do not claim zero score loss.

## Cadence

The export workflow wakes hourly at minute 7 in UTC, avoiding the congested top of the hour.
The TypeScript selector uses `MYK9_EXPORT_TIME_ZONE`
(default UTC), `MYK9_EXPORT_WEEKEND_DAYS` (default `0,5,6`), and `MYK9_EXPORT_NIGHTLY_HOUR`
(default `3`) to export hourly on selected show days and once overnight otherwise. Manual
dispatch forces an export regardless of the time. America/Chicago and 30-day R2 retention
were selected by the owner on 2026-09-08. The proposed nightly slot is 03:00 local time.
GitHub variable changes and scheduled activation still await the explicit confirmation required
by automatic approval review; the existing effective defaults remain UTC/03:00 until changed. Extra show days require changing the reviewed
day policy or manual dispatch; no show calendar is automatically consulted. Each scheduled
wake-up compares the latest successful manifest against the latest due slot and catches up
if that slot was missed, even when GitHub starts the job after its nominal hour. Invalid
timezone/day/hour settings fail explicitly in both the exporter and health check.
If daylight-saving time skips the configured nightly hour, the first available hour after
the gap is due. An unreadable or invalid marker cannot suppress a fresh export; the exporter
warns and proceeds, while the separate health check continues to report invalid markers.
R2 credential, network or bucket access errors stop scheduled runs before a database dump.

The separate health workflow wakes hourly at minute 22 and validates the newest stored payloads
against the latest due slot whose 30-minute grace has elapsed. Thus detection can take until
the next health run after grace, plus scheduler delays. A GitHub outage can hide both jobs;
operator checks remain necessary. Both scheduled jobs stay disabled until
`MYK9_EXPORTS_ENABLED=true`; explicit manual dispatch is available for activation testing.
The 30-minute grace is intentional: a delayed job beyond the monitored slot is a backup gap
that should alert, even when caused by GitHub scheduling. It is not a guarantee of hourly recovery.
The workflow installs PostgreSQL client 18 and defaults `MYK9_EXPORT_PG_CLIENT_MAJOR` to `18`;
any override must match the installed client. CI explicitly installs a PostgreSQL client and
runs `pnpm qa:backups:test`, including a locale-independent native-client argument test.

## Activation checklist

Selected provider (owner approved 2026-09-07): **Cloudflare R2 Standard**, private bucket.
Thirty-day retention was selected on 2026-09-08; the workflow follow-up applies it only after
a successful freshness verification in an independent daily workflow, preserving the newest complete set.
At the measured size, 1.9–2.2 GB fits within its 10 GB-month free allowance if that allowance
is available on the account. Estimated request counts also fit the published free allowances;
existing account usage and future growth must be checked. Standard (not Infrequent Access) is
required for those free allowances. The owner created `myk9-database-backups` with Standard
storage and public access disabled, and saved its bucket-scoped Object Read & Write S3
credential and a separately generated encryption key in GitHub Actions secrets. The owner
reports a local recovery copy of the key. GitHub secret names and the exact bucket, prefix,
endpoint and `auto` region variables were verified; download, authenticated decryption, and the scoped restore have since passed. See the
[tested recovery procedure and exclusions](independent-database-restore.md).
`MYK9_EXPORTS_ENABLED=false` remains verified. Scheduled activation is pending.

The repository was verified **public** on 2026-09-08. Both workflows use standard
`ubuntu-latest` runners, which are [free for public repositories](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
The billing API could not be read with the existing token; no additional token scopes were
requested. The earlier private-repository minute-budget concern therefore does not apply to
these standard public-repository jobs. Reassess if repository visibility or runner class changes.

The first R2 set contains 6,444,539 encrypted dump bytes, 6,031 encrypted globals bytes, and
694 manifest bytes. At roughly 306–352 exports per 30 days this is approximately 2.0–2.3 GB,
within R2 Standard's 10 GB-month allowance if available on the account. Scheduled object
operations should also fit its free operation allowances. This is an estimate, not a billing cap:
check other account usage, database growth, manual exports, source-provider egress, and the
separately billed disposable Supabase projects. The newest complete backup is retained even
past 30 days, so outages do not delete the only usable set. No paid PITR or plan upgrade is enabled.

On 2026-09-07, read-only CLI inventory confirmed both item-1 recovery projects still exist:
`yltegnpcnqrtjurxdmon` and `nzihqlfcqntxjvhdttzf`. Repurposing the former for this rehearsal
was explicitly authorized by the owner, including replacement of its test data; the latter
and the source must remain untouched.
The owner performed Cloudflare setup through the UI; subsequent R2 downloads and verification
used the scoped S3 credentials.

1. Run a manual `pg_dump` against the source using a disposable local destination and record
   compressed/encrypted size, dump duration, and restore duration. Confirm the required `auth`,
   `storage`, public application schemas, policies/RLS, grants, and globals are present.
2. Choose a provider and region/jurisdiction. Candidate pricing checked 2026-09-07:
   Cloudflare R2 Standard is `$0.015/GB-month`, with 10 GB-month free, `$4.50/million`
   Class A and `$0.36/million` Class B operations, and no Internet egress fee; see the
   [R2 pricing table](https://developers.cloudflare.com/r2/pricing/). Backblaze B2 publishes
   pay-for-usage storage/download/transaction pricing with no minimum retention in its
   [pricing overview](https://www.backblaze.com/cloud-storage/pricing); exact current rates
   must be recorded after the measured size. AWS S3 pricing remains region and request-class
   dependent and needs a current estimate before selection.
3. Set the retention period, legal/data jurisdiction, versioning/object-lock requirement,
   restore-access procedure, and monthly cost ceiling. Estimate monthly storage as
   `measured encrypted export size × retained successful exports`; hourly weekends yield about
   72 attempts/week before failures and retries, so do not assume a daily-copy cost.
   Include GitHub Actions runtime, storage API operations, download verification traffic and
   source egress in the estimate; free object-storage capacity does not imply free operation.
4. Create a private bucket and least-privilege CI credential that can put/list/head/get objects in
   the export prefix and delete only after an approved retention review. Do not grant public
   access. Create a random 32-byte encryption key and store it as
   `MYK9_EXPORT_ENCRYPTION_KEY`; keep a separately controlled recovery copy.
5. Add the GitHub repository secrets/variables named by the workflow, run one manual export,
   inspect only metadata and checksums, and verify no secret appears in logs.
6. Download one encrypted export into a disposable destination, decrypt it, restore it with
   `pg_restore`/`psql`, and verify core row counts, Auth metadata, RLS/policies, grants, and a
   representative scored entry. Record source ref, export timestamp, elapsed time, and any
   missing objects. Never point the restore at `sojmvhhwsjxmfistvzbe`.
7. Only after the isolated restore evidence is accepted, set `MYK9_EXPORTS_ENABLED=true`.
   Re-run the freshness check after the first scheduled attempt and record the manifest.

## Failure and retention operation

An export job failure is actionable even if an older object exists. Preserve the last known good
manifest, rerun a manual export after fixing the cause, and record the gap. The retention policy must be dry-run reviewed before activation or a policy change;
approved daily runs then apply it unattended. Retention must never delete Supabase source data. Rotate CI credentials and the encryption key through an owner-reviewed procedure; old
exports remain undecryptable after key loss, so retain the recovery key with the incident plan.

`scripts/backup/retention.ts` requires `BACKUP_PROJECT_REF` and validates every manifest in the prefix before selecting any deletions. A foreign-project or invalid manifest aborts both dry-run and apply. It inventories whole three-object sets and preserves the newest complete
set even if it exceeds retention. When no complete set exists, the newest incomplete set is
preserved for recovery investigation. Incomplete sets containing only recognized export artifacts
are eligible once all their objects exceed retention; fresh sets and sets containing unknown
objects remain protected. Dry-run is the
default; deletion requires both `BACKUP_RETENTION_APPLY=true` and the exact bucket/prefix
confirmation. The workflow follow-up runs this policy in a separate daily workflow at 10:22 UTC,
after its own successful freshness verification, using
a reviewed 30-day window fixed in the workflow. Verification and cleanup use the same bucket/prefix
variables as exports. An explicit preflight compares that configuration to the approved
`myk9-database-backups/myk9-platform` destination, account endpoint, and region before either step. Destination drift deliberately
requires renewed review rather than silently authorizing deletion in a new bucket: pause
`MYK9_RETENTION_ENABLED`, review the new target, update both the guard and deletion confirmation,
and dispatch a dry-run before re-enabling cleanup. The diagnostic identifies this approval mismatch.
Scheduled cleanup requires both `MYK9_RETENTION_ENABLED=true` and `MYK9_EXPORTS_ENABLED=true`; disabling cleanup alone leaves backups enabled. The :22 schedule uses the same 30-minute freshness grace as the independent health job.
Manual dispatch runs verification and a retention dry-run only, even when cleanup is enabled. Cleanup failures
open a separate **Independent Database Retention** issue and do not change the independent export result.
An invalid or foreign manifest stops cleanup safely and requires inspection; it does not stop
future exports. The daily scan has its own 60-minute timeout, avoiding an hourly scan of every
retained manifest on the export job's time budget. Its separate concurrency group cannot evict queued exports.
Each successful deletion is logged immediately, so a later failure preserves the partial audit trail. No provider lifecycle rule is installed.

## Rollback and recovery

Set `MYK9_EXPORTS_ENABLED=false` and revoke the object-store credential to stop new uploads.
Keep existing private objects until the owner approves deletion. Recovery uses a disposable
database and the selected export's manifest/checksum; source writes remain stopped until the
operator has compared newer data and reconciled offline tablet queues.

The source export was measured successfully on 2026-09-07 (below). The first live R2
export and a scoped restore into the existing disposable Supabase clone passed on 2026-09-08:
160 imported tables matched the downloaded archive. See the [actual restore procedure](independent-database-restore.md)
for timing and material provider-managed exclusions. A fresh-project rebuild remains untested.
The earlier [synthetic two-cluster local restore](independent-database-exports-local-test.md)
is supporting evidence, not a substitute for those limitations.

## Measured source export — 2026-09-07

Operator authorized a read-only export of `sojmvhhwsjxmfistvzbe` to private local files.
The saved session-pooler connection was verified against the source ref without printing credentials.
Only SELECT queries, `pg_dump`, and `pg_dumpall` were executed. The pooler did not preserve
the requested `default_transaction_read_only` option (preflight reported off); no server-side
read-only enforcement is claimed for that option. No source mutation commands were executed.

| Measurement                             | Result                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Source server                           | PostgreSQL 17.6                                                                   |
| Native dump clients                     | PostgreSQL 18.3                                                                   |
| Database disk size                      | 124,923,027 bytes (~119 MiB)                                                      |
| Compressed custom-format dump           | 6,284,328 bytes                                                                   |
| Globals export, role passwords excluded | 6,003 bytes; 17 role definitions                                                  |
| Database dump duration                  | 45.594 seconds                                                                    |
| Dump, globals and encryption duration   | 47.999 seconds (excludes preflight)                                               |
| Encrypted payload total                 | 6,290,387 bytes (~6.3 MB)                                                         |
| Archive inventory                       | 178 table-data entries; public, auth, storage and supabase_migrations represented |
| Security object inventory               | 378 policy entries, 156 row-security entries, 827 ACL entries                     |

The encrypted files were validated with the branch's decrypt CLI. Authenticated decryption
succeeded, and `pg_restore --list` on the decrypted dump exactly matched the original inventory.
This is archive validation, **not a restore of the source data**. Managed-role behavior, Vault
key recovery, and compatibility with the actual destination must still be rehearsed.

Artifacts are in private temporary directory `/private/tmp/myk9-live-export.rCG2z0` (0700),
with encrypted dump/globals, manifest, local recovery-key file, and measurement metadata (0600).
Plaintext dump/globals and the temporary decryption outputs were removed. The key has not been
uploaded or committed. This temporary local directory is not durable independent backup storage.
At this one measured size, 306–352 exports across 30 days would occupy roughly 1.9–2.2 GB,
excluding versions, growth, overhead and manual reruns. Total operating cost remains unapproved.

## Local decrypt and validation

The encrypted artifacts can be validated without database writes:

```bash
BACKUP_ENCRYPTION_KEY='base64-32-byte-key' pnpm exec tsx scripts/backup/decrypt.ts \
  --manifest ./manifest.json \
  --dump ./database.dump.enc \
  --globals ./globals.sql.enc \
  --out-dir ./decrypted-export
```

This checks the manifest format, future timestamp, nonempty ciphertext, and SHA-256 digests before
authenticated decryption. It only writes the requested local output directory. The dump still
does not contain Supabase's encryption root key. Encrypted Vault rows may be present but cannot
be assumed decryptable without the separately approved key-recovery procedure. Supabase's logical restore guidance also
warns that custom-role passwords may need resetting and managed-role ownership/grants can fail;
the isolated restore gate must record those limitations rather than claim a complete project
reconstruction. See [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

### Transport and growth limits

The exporter forces PostgreSQL `sslmode=verify-full` with the public Supabase CA bundled in `scripts/backup/supabase-prod-ca-2021.crt`. An untrusted certificate or hostname mismatch fails the export; there is no plaintext fallback.

The current encryption path buffers files in memory and rejects combined dump/globals files larger than 256 MiB before reading their contents. Crossing that limit fails the run and triggers the existing failure notification. Implement and test streaming encryption before increasing the limit or approaching that size; the measured export is approximately 6.3 MB.

The CA was downloaded over HTTPS from [Supabase's certificate distribution](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). Its SHA-256 certificate fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`, expiring April 26, 2031. Update the bundled public certificate through review if Supabase rotates its CA. A read-only source globals export with this CA and hostname verification passed on September 8, 2026: 17 roles, 6,003 bytes, 3.062 seconds; temporary SQL was removed. System CA trust alone failed for this pooler.
