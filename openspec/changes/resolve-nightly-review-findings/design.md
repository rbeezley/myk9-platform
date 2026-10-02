# Design

## Context

See proposal.md and canonical Linear contracts MYK9-939/938/834/940/936/937. Repair current boundaries, preserve offline-first writes and role intent in docs/INTENT.md. Secretary saves stay truthful; ringside recovery stays invisible during normal offline use.

## Goals / Non-Goals

Restore the six confirmed contracts with red-to-green focused proof. No new surfaces, mutation queues or authority grants. No payments, shared fixture writes, production migration/deploy, issue closure or merge without applicable gates.

## Decisions

1. SQL ownership must explicitly be TRUE; coalesce nullable handler comparison and deny any overall unknown predicate. Append a migration with the complete current function, retaining ACL, lock, lifecycle and OCC behavior. Existing SQL fixtures carry related table values; no new seed values assumed.
2. Trials use the replication engine's established tombstone mechanism, with active-row counts and row refetch semantics aligned. Preserve pending writes and newer authorized restores; no UI-only filtering fix.
3. Same-user SIGNED_IN is session reaffirmation, not identity change. Compare the persisted claim's auth user to confirmed session identity; actual sign-out, new identity and revocation invalidate cache. Never trust a stale grant for a new account.
4. Judge assignment preparation/enqueue is required before class save; separate later cache refresh errors as best-effort after write success. Rejection stays in the existing panel error path, retaining edits.
5. Wizard persisted schema version advances; migration splits legacy local ISO day/time without UTC conversion or replacing existing new fields. Version-0 name normalization still occurs. Invalid/missing dates remain visibly incomplete, never defaulted.
6. Deploy tests use cheap Git plumbing fixtures, preserving a real first-parent merge, and a narrowly justified budget if 51 script subprocesses still require it. No production algorithm or global timeout changes.

## Risks / Trade-offs

- Tombstone and unsynced row interaction → real replication integration tests across incremental/full/cold/restore, keep engine authority rules.
- Claim identity races → real auth/store/hook controls for same identity, sign-out, switch, revocation and reload.
- Partial judge save → required assignment runs first; cache refresh never masquerades as a required write.
- Old draft timezone → retain local wall clock from serialized legacy field; roundtrip named dates/times and payload tests.
- SQL minimal local schema proof differs from migration chain → behavioral SQL registered for CI; do not claim applied database proof.

## Migration Plan

Commit/review SQL and auth/offline changes as separate risk units from app and harness. Run focused checks and repo validation ladder, independent review where required; obtain approval only after concrete reviewable fixes for push/PR/merge/deploy operations that need it. Keep issues In Progress until each closure proof is met. No app deployment implied; main and production differ.
