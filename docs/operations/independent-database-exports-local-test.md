# Independent export local recovery evidence

MYK9-110 item 2; 2026-09-07. Reviewer: parent Codex, independently of Luna implementation.

## Test boundary

Two disposable PostgreSQL 18.3 clusters on private local Unix sockets, with TCP listening
disabled. All records were synthetic. The AWS CLI boundary used a local file-backed fixture
supporting object upload/download, metadata, and listing. No Supabase connection, paid provider,
GitHub schedule activation, or real customer data was used.

## Executed checks

1. Created source fixtures: one club, person, dog, Auth user and Storage metadata record;
   two entries (one scored 97.5 at version 3, one unscored at version 1).
2. Created a `show_reader` role with SELECT but no UPDATE privilege; an RLS policy exposes
   only scored entries.
3. Ran the actual `scripts/backup/export.ts` CLI with PostgreSQL 18 tools and a disposable
   AES key. Custom-format database dump and globals export completed. Encrypted uploads and
   byte-level download verification completed before success was reported.
4. Ran the actual local decrypt CLI against those uploaded artifacts. Authentication/checksum
   validation succeeded and produced `database.dump` and `globals.sql`.
5. Created a separate fresh PostgreSQL cluster with a different administrator. Restored globals
   using `psql -v ON_ERROR_STOP=1`, then the custom dump using
   `pg_restore --exit-on-error --no-owner` into its new `show_recovered` database. Both exited 0.
6. Verified restored counts: Auth users 1, Storage metadata 1, clubs 1, people 1, dogs 1,
   entries 2. Exact score/scored/version values were preserved. Entry→dog/club orphan count was 0.
7. Verified RLS remained enabled; restored `show_reader` had SELECT=true and UPDATE=false.
   `SET ROLE show_reader` exposed exactly the one scored entry.

The successful export at 21:36:36 UTC exercised encryption, upload/download, decryption and
full local role/database recovery. A second successful export at 21:39:21 UTC exercised the
updated manifest with separate snapshot-start and completion timestamps.

## Review findings

The initial four unit tests passed despite an invalid positional `pg_dumpall` URL, insufficient
alert permissions, metadata-only remote verification, and a freshness check dependent on export
success. The parent reproduced the command error locally and requested fixes and regression
coverage. Follow-up review also identified mismatched export/monitor timezone semantics and a
transition allowance that could hide missed weekend backups. Final code review and tests must
confirm these corrections before shipping.

## Limits and remaining gates

- This proves local PostgreSQL mechanics; it is not a successful restore of a real Supabase export.
- The object-store fixture does not prove cloud credentials, bucket privacy, lifecycle behavior,
  network handling, or provider compatibility.
- Managed Supabase schemas/roles, Vault encryption-root-key recovery, Functions, Auth configuration,
  Realtime, and app/tablet behavior need their own applicable evidence. Storage file bytes are excluded.
- Actual export size, operating cost (including GitHub Actions runtime), retention, timezone,
  provider choice, source export privileges, and activation remain unapproved/unmeasured.
- The source and item-1 recovery projects were not changed by this test.
