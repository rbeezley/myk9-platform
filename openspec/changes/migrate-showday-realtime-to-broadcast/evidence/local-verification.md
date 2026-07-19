# Verification Report: migrate-showday-realtime-to-broadcast

## Summary

| Dimension | Status |
|-----------|--------|
| Completeness | 19/23 tasks complete; four shared-system shipping gates remain |
| Correctness | 6/6 requirements and 15/15 scenarios covered locally |
| Coherence | Design decisions followed; no contradictory transport or data-authority path found |

## Requirement mapping

- Minimal show-scoped signal: the SQL trigger emits only the table discriminator,
  routes entry/class inserts, updates, deletes, and old/new scope moves, and
  isolates all Broadcast failures. Covered by the SQL source-contract tests.
- Broadcast is not a data authority: consumers call replication sync, page
  refresh, or React Query invalidation; the notification monitor refetches its
  authorized snapshot before evaluating alerts. Covered by focused hook tests.
- One channel per show: the registry fans out one private channel, removes it
  after the final listener, protects rapid re-subscription, and replays current
  status to late consumers. Covered by six registry tests.
- Fallback correctness: the replication poll, notification query poll, TV error
  poll, at-show foreground/manual refresh, and reconnect nudges remain intact.
- Publication narrowing: reachable Postgres Changes code now covers only
  `shows`, `show_announcements`, and `show_messages`; guarded SQL removes only
  `entries`, `classes`, and `show_message_threads`.
- Private authorization: the policy admits only `anon`/`authenticated` SELECT on
  `show:<uuid>:changes`; payload filtering rejects extra keys and row data.

## Verification run

- Focused Vitest: 9 files, 40 tests passed.
- Broad myK9Show suite: no failures observed before the repository's mandatory
  60-second stop threshold.
- Full monorepo typecheck and lint: passed.
- Explicit ESLint over every changed/new myK9Show TypeScript file: passed.
- Ringside typecheck: passed.
- Supabase linked-project dry run: passed; exactly the MYK9-25 migration would run.
- OpenSpec strict validation: passed.
- Diff checks: no whitespace errors, touched production files remain under 500
  lines, and no entry/class Postgres Changes consumer survives.
- Scoped security review: no findings; see
  `docs/security-review-2026-07-18-codex-myk9-25-realtime-broadcast.md`.

## Critical gates before archive

1. With owner approval, commit/push and open the PR.
2. Run required CI and resolve actionable results.
3. With owner approval after the client deploy, push the migration to staging
   and record two-context delivery plus before/after load evidence.
4. Merge, update MYK9-25, archive the change, and clean up the branch/worktree.

## Warnings

- Linked-schema lint reports three pre-existing function errors in
  `insert_show_passcodes`, `regenerate_show_passcodes`, and
  `_account_ringside_show_id`; the pending migration is not applied during lint.

## Final assessment

Local implementation verification passes with no requirement, scenario,
security, or design-coherence issue. The change is ready for the owner-approved
shipping gates, but not ready to archive until those four tasks complete.
