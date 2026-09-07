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

The export workflow wakes hourly in UTC. The TypeScript selector uses `MYK9_EXPORT_TIME_ZONE`
(default UTC), `MYK9_EXPORT_WEEKEND_DAYS` (default `0,5,6`), and `MYK9_EXPORT_NIGHTLY_HOUR`
(default `3`) to export hourly on selected show days and once overnight otherwise. Manual
dispatch forces an export regardless of the time. America/Chicago and 30-day R2 retention
are proposed options, not approved settings. Extra show days require changing the reviewed
day policy or manual dispatch; no show calendar is automatically consulted.

The separate health workflow wakes hourly at minute 15 and validates the newest stored payloads
against the latest due slot whose 30-minute grace has elapsed. Thus detection can take until
the next health run after grace, plus scheduler delays. A GitHub outage can hide both jobs;
operator checks remain necessary. Both scheduled jobs stay disabled until
`MYK9_EXPORTS_ENABLED=true`; explicit manual dispatch is available for activation testing.

## Activation checklist

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
manifest, rerun a manual export after fixing the cause, and record the gap. A retention deletion
must be dry-run reviewed against the documented policy and must never delete Supabase source
data. Rotate CI credentials and the encryption key through an owner-reviewed procedure; old
exports remain undecryptable after key loss, so retain the recovery key with the incident plan.

`scripts/backup/retention.ts` inventories whole three-object sets and preserves the newest complete
set even if it exceeds retention. Incomplete sets are kept for operator inspection. Dry-run is the
default; deletion requires both `BACKUP_RETENTION_APPLY=true` and the exact bucket/prefix
confirmation. No automatic deletion schedule or provider lifecycle rule is activated by this branch.

## Rollback and recovery

Set `MYK9_EXPORTS_ENABLED=false` and revoke the object-store credential to stop new uploads.
Keep existing private objects until the owner approves deletion. Recovery uses a disposable
database and the selected export's manifest/checksum; source writes remain stopped until the
operator has compared newer data and reconciled offline tablet queues.

The current implementation has no live provider credentials or measured source dump/provider
restore. A [synthetic two-cluster local restore passed](independent-database-exports-local-test.md).
The real Supabase/provider rehearsal remains an activation gate.

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
