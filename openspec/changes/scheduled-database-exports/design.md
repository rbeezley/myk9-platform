## Context

The existing `docs/operations/nightly-backup-recovery.md` covers Supabase physical-backup
recovery and explicitly leaves independent exports as future work. The active myK9Show data
path is offline-first: exports read the database directly for disaster recovery and do not alter
replication, tablet queues, or application pages. A scheduled GitHub Actions job is a practical
operator surface because the repository already uses scheduled workflows and its failure issue
reporter, but its schedule is only an attempt: the job must verify freshness in storage.

## Goals / Non-Goals

**Goals:**

- Produce a complete, restorable PostgreSQL export plus globals/manifest without logging
  credentials or customer data.
- Encrypt before upload, use private object storage, verify object identity/checksum, enforce
  retention, and fail on stale/missing output.
- Use UTC schedules that are explicit about Friday–Sunday hourly and otherwise nightly cadence.
- Make an isolated restore rehearsal a required operator gate while keeping source Supabase
  unchanged.

**Non-Goals:**

- Selecting or provisioning a provider, bucket, paid service, GitHub secret, key, or schedule.
- Enabling PITR, changing Supabase backups, restoring production, or modifying schema/data.
- Protecting Supabase Storage object bytes; a separate file-backup design is required.
- Promising zero score loss: jobs can be delayed or fail, and tablets can hold unsynced writes.
- Adding a UI page; operators use the existing runbook and workflow summary.

## Decisions

1. **Use `pg_dump` plus `pg_dumpall --globals-only`.** A custom-format full dump preserves
   database schemas, app data, Auth/Storage database schemas, RLS policies, grants, and
   extensions as available to the database owner. Globals capture roles and tablespace-level
   grants that `pg_dump` omits. The workflow records tool versions and fails if either command
   fails. A schema-only public export is insufficient for Auth and policy recovery.

2. **Encrypt locally before object upload.** The script uses an operator-managed 32-byte key
   and authenticated AES-256-GCM envelopes, with a unique IV and a manifest containing only
   non-sensitive metadata and SHA-256 digests. Object-store SSE is an additional provider
   control, not a substitute for client-side encryption. Alternatives considered: plaintext
   uploads (rejected because the dump contains personal data) and provider-only SSE (rejected
   because storage-admin access would expose the export).

3. **Use the AWS CLI S3 protocol as a provider-neutral boundary.** AWS S3, Cloudflare R2, and
   Backblaze B2 expose compatible object APIs, but pricing, egress, lifecycle, and jurisdiction
   differ. The repository ships commands that accept an endpoint and bucket; owner selection is
   documented as an activation decision. Alternatives considered: provider SDKs (extra runtime
   dependency and lock-in) and GitHub artifact storage (short retention and unsuitable disaster
   recovery boundary).

4. **Schedule in UTC with two cron entries.** `0 2 * * 1-4` is the nightly attempt and
   `0 * * * 5,6,0` is hourly Friday through Sunday. Show-date exceptions cannot safely be
   inferred from a repository cron; activation must document the show calendar/timezone policy
   and use manual dispatch or an approved calendar-driven follow-up. Freshness checks use the
   latest successful manifest timestamp, not GitHub's nominal cron time.

5. **Verify freshness and retention in the same run.** A successful upload writes an immutable
   manifest after the encrypted payload is verified. A separate verification mode lists recent
   manifests, rejects missing/duplicate/invalid digests, and fails when age exceeds the cadence
   plus a bounded grace period. Retention is an explicit deletion command and/or provider
   lifecycle rule; no destructive lifecycle is activated by this change.

## Risks / Trade-offs

- [Credential exposure] Database URLs, passwords, keys, and dump content could leak in logs →
  pass secrets through environment/standard input, redact command errors, use temporary files,
  delete them on exit, and never print object bodies.
- [Incomplete privileges] A restricted database role may omit globals or protected schemas →
  preflight checks report the missing sections and activation requires an owner-level export
  credential plus restore evidence.
- [Schedule gaps] GitHub Actions can queue, fail, or be unavailable → freshness verification,
  issue notification, and a documented manual catch-up run make gaps visible; RPO remains the
  last verified manifest.
- [Offline writes] Tablet mutations may exist only locally between exports → preserve tablet
  queues and operate an independent score capture/reconciliation source; exports cannot claim
  zero loss.
- [Storage mismatch] Database rows do not include uploaded Supabase Storage files → track a
  separate Storage protection work item and call this limitation out in the runbook.

## Migration Plan

1. Merge code, tests, workflow, and runbook changes with the workflow disabled unless required
   secrets and provider approval exist.
2. Owner measures the live database dump size and restore duration using a disposable destination;
   choose provider, region, retention, object lock, and cost ceiling.
3. Owner creates a private bucket and least-privilege write/list/read/delete credentials,
   client-side encryption key, and GitHub secrets; verify no secret appears in logs.
4. Run one manual export and a clean isolated restore, then enable the schedule and record the
   first successful manifest/freshness check.
5. Rollback is disabling the workflow and revoking its credentials; existing exports remain
   private until an owner-approved retention deletion. The source Supabase project is untouched.

## Open Questions

- Which provider, region, jurisdiction, object-lock/versioning policy, and approved monthly
  cost ceiling should be used after measured export size is known?
- What show-date calendar and local timezone should trigger hourly coverage outside the fixed
  Friday–Sunday default?
- Which owner-controlled role can export `auth`, `storage`, policies, and globals without
  granting more application access than necessary?
- What RPO/RTO and grace interval constitute a launch gate, and who receives failure alerts?
