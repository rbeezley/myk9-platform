# Offline Readiness — indicator and show-eve nudge (MYK9-203)

> **Status:** Active

Companion to MYK9-200 (offline RBAC cache) and MYK9-202 (sign-out guard). The
offline stack only works if the device was **primed while online**; today that
state is invisible. Two deliverables, one PR each.

## PR 1 — "Offline ready" badge (client)

A per-show readiness badge on the two staff show-day surfaces, answering "would
this device survive airplane mode for THIS show?"

### Readiness signals

| Signal          | Source                                                                                                                                                                                                                                                                                                          | Ready when                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Permissions     | `loadRbacPermissionsCache(userId)` (localStorage, MYK9-200)                                                                                                                                                                                                                                                     | entry present (7-day TTL enforced by the loader) |
| Show data       | `replicatedEntriesTable.getSyncMetadata(showId)`, `replicatedTrialsTable.getSyncMetadata(showId)`, and `replicatedClassesTable.getSyncMetadata(trialId)` fanned over `getTrialsByShow(showId)` — `totalRows === undefined` means never hydrated (the `timeline.ts:58` / `useJudgeAssignments.ts:176` precedent) | every scope hydrated                             |
| As-of timestamp | oldest `lastIncrementalSyncAt` across the scopes                                                                                                                                                                                                                                                                | shown in the badge title                         |

The session is implicitly present (the surfaces are auth-gated), and the global
provider's `lastSyncAt` is deliberately NOT used — it is unscoped and can say
"synced" while show X is cold.

### Structure

`apps/myk9show/src/features/offline-readiness/`

- `computeOfflineReadiness.ts` — pure decision: `{ ready, missing[], asOf }`.
- `useOfflineReadiness.ts` — gathers the async signals; recomputes on mount,
  window focus/online, and after priming.
- `OfflineReadyBadge.tsx` — pill in the style of `ShowDeskSyncStatus`
  (`role="status"`). Green: "Offline ready". Amber/red: "Not offline ready" —
  **clicking it primes the show** via `syncAtShowData(showId)`
  (`atShowDataAdapter.ts`), then re-checks. The warning is its own fix.

### Mounts (no new pages)

1. `ShowDeskCompactContext.tsx` action row (secretary Show Desk), beside
   `ShowDeskSyncStatus`.
2. `AtShowClassListPage.tsx` top row (staff at-show surface).

### Testing (PR 1)

- Pure-fn tests: every missing-signal combination, as-of = oldest watermark.
- Hook tests with mocked replication tables: cold store, partially hydrated
  (one trial's classes missing), fully hydrated, prime-then-ready transition.
- Badge component tests: green/red rendering, click-to-prime calls
  `syncAtShowData` and flips on success.
- All new/touched tests 6× under `--sequence.shuffle`.

## PR 2 — show-eve push nudge (server)

Edge function `push-trigger-show-eve` + pg_cron schedule.

- **Query:** `trials` where `date` = tomorrow (UTC-evening cron at 23:00 UTC ≈
  US evening; per-trial timezone refinement deferred, noted as limitation) →
  join `shows` → staff = active `user_roles` rows (secretary / judge / steward
  / club_admin / chairman / site-admin excluded) scoped to `show_id` or the
  show's `club_id`, with `auth_user_id` present.
- **Send:** webpush loop per user over `push_subscriptions`, the
  `send-push-notification` pattern (410/404 endpoint cleanup). Copy: "<Show>
  starts tomorrow — open the show now so it works without internet."
- **Idempotency:** `show_eve_nudge_log (trial_id, auth_user_id, sent_at)` with
  a unique constraint; cron re-runs skip logged pairs. Migration includes
  explicit GRANTs/REVOKEs per the anon default-privileges rule.
- **Auth:** cron invokes via Vault-stored secret, the waitlist/webhook pattern.
- Starts **unconditional** for staff (no device-readiness heartbeat), per the
  issue's fallback design.

### Testing (PR 2)

- Deno-free helper module with vitest coverage (registered in
  `apps/myk9show/vitest.config.ts` include list if placed under
  `supabase/functions/_shared/`): targeting query shaping, idempotent skip,
  payload copy.
- Migration through `migration-auditor` + `src/test/database/` contract suite
  before push; ACL verified against the applied DB (`relacl` + column ACLs).

## Follow-ups filed during review

- **MYK9-205** — RingsideShowBoundary blocks a cold device before the badge/prime action can render (judge-only accounts have no other recovery path).
- **MYK9-206** — replication `totalRows` is rewritten from the local count, so partial quota eviction is undetectable; PR 1 works around it by rewinding scope watermarks before priming.

## Out of scope

- Device-readiness heartbeat for targeted nudges (revisit if unconditional is
  noisy).
- MYK9-198 paper packet (separate issue).
