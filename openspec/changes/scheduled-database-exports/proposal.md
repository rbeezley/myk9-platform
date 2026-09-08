## Why

Supabase's daily physical backups provide a useful recovery floor, but they leave a show-day
window in which newly recorded entries, scores, and secretary changes can be lost. MYK9-110
needs an independently operated export path before launch so the team can detect a missing
backup, retain copies outside Supabase, and prove that an exported database can be restored.
This directly supports fall 2026 launch readiness and the secretary/show-day reliability goal.

## What Changes

- Add an operator-owned PostgreSQL export command that captures the complete database needed
  for recovery: schemas, app data, Auth and Storage database metadata, policies/RLS, grants,
  and database globals/roles where the source credentials permit them.
- Add a GitHub Actions workflow with an explicit UTC schedule: hourly Friday through Sunday
  and nightly Monday through Thursday, plus a guarded manual run. The workflow uploads
  encrypted exports and manifests to a private S3-compatible object store, verifies the upload,
  and fails loudly on missing or stale output.
- Add deterministic schedule, manifest, encryption, upload failure, retention, and stale-backup
  tests, plus a documented restore procedure and an isolated restore verification gate.
- Document retention, credential rotation, show-date exceptions, operating costs, and the
  remaining data-loss boundary for delayed jobs, unsynced/offline tablet mutations, and files
  in Supabase Storage.

The initial implementation is provider-neutral at the command boundary; no storage account,
GitHub secret, live schedule, paid service, production restore, or source-project mutation is
created by this change.

## Capabilities

### New Capabilities

- `scheduled-database-exports`: Scheduled encrypted PostgreSQL exports with verification,
  retention, stale-backup detection, and restore evidence requirements.

### Modified Capabilities

- None.

## Impact

- New TypeScript export/verification utilities and focused tests under `scripts/backup/`.
- New disabled-until-configured GitHub Actions workflow and operator documentation under
  `docs/operations/`.
- Requires a future private S3-compatible bucket, server-side/object-lock policy decision,
  encryption key, GitHub Actions secrets, and an approved retention budget. The candidate
  provider is not selected here.
- Database exports do not include Supabase Storage object bytes and cannot guarantee zero loss
  for writes made after the last successful export or held only in an offline tablet queue.
