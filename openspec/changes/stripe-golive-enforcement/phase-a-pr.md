## Summary

- enforce class and judge-day capacity through one race-safe database decision
- preserve the self-service mail-in reserve while allowing authorized organizer and show-desk paths
- return mixed created, waitlisted, and denied outcomes without breaking legacy clients
- show accurate registration confirmation state and charge/assign armbands only for created entries

Tracked in openspec change: stripe-golive-enforcement

## Duplication check

This does not add a page or duplicate an existing workflow. Capacity outcomes remain in the existing
registration confirmation surface, and later waitlist payment work remains in My Shows / My Entries.

## Verification

- `pnpm openspec validate stripe-golive-enforcement --type change --strict --no-interactive`
- focused Vitest: 5 files, 39 tests passed
- full myK9Show suite: 1,339 files passed, 1 skipped; 12,124 tests passed, 9 skipped
- `pnpm typecheck`
- `pnpm lint`
- local PostgreSQL rolled-back behavior matrix covering reserve, class maximum, denial, show-desk
  override, duplicate waitlist, mixed outcomes, retry idempotency, and unauthorized source rejection
- two-session last-spot probe: one created entry and one waitlisted entry
- rolled-back representative `EXPLAIN (ANALYZE, BUFFERS)`: approximately 2.5 ms in the local fixture

## Required before merge

- database/security independent auditor review
- approved migration dry-run and staging push
- CI and required review checks

## Rollback

Restore `submit_show_entries` from migration `20260711190000` and
`create_online_paid_entry` from migration `20260628202146`, then drop
`evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean)`. The client tolerates the legacy
response, so a client rollback is not required.
