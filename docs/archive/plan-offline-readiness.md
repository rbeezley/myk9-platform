# Offline Readiness — indicator and show-eve nudge (MYK9-203)

> **Status:** Complete

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

## PR 2 — show-eve push nudge (server) — as built

Edge function `push-trigger-show-eve` + `show_eve_nudge_log` + pg_cron. The
shape changed materially during review; this records what shipped.

**Audience.** One push per **show per date**, not per trial — the copy names the
show, so a show running two trials on one day must not buzz anyone twice.
Recipients are the union of:

- club-scoped staff roles (secretary / club_admin / chairman / steward) that
  ALSO have an active `club_members` row, per
  `20260802120000_enforce_club_membership_role_boundaries.sql`;
- show-scoped official rows, which that migration exempts from membership and
  which migration 099 wrote with `club_id` NULL — so they need their own query;
- judges, only via `judge_assignments` for a trial running that date. Class-level
  assignments store `trial_id` NULL, so the day is resolved through
  `classes(trial_id)`, and soft-deleted classes and people are excluded.

`notification_preferences.push_enabled` is honoured. Copy reads "starts
tomorrow" on the first day and "continues tomorrow" thereafter.

**Delivery.** Deep link is `data.actionUrl` (the only field
`swClickNavigation.readActionUrl` reads), tagged per show so two shows do not
collapse into one notification. Per-call 8s timeout, ≤10 subscriptions per
recipient, 120s whole-run deadline.

**Idempotency.** `show_eve_nudge_log` is keyed `(show_id, trial_date,
auth_user_id)` and separates `claimed_at` from `delivered_at`: a claim is taken
before sending, stamped only on real delivery via compare-and-swap, and released
when nothing was delivered. A stale undelivered claim is reclaimable after a
5-minute lease — deliberately longer than the worst-case send (~80s) and shorter
than the smallest gap between cron runs (10 min), so each run can rescue its
predecessor. Cron runs at :00/:15/:30/:45/:55 of the 23:00 UTC hour.

**Accepted residuals** (documented at the code):

- A timed-out push cannot be cancelled, so in a rare case a recipient may get a
  duplicate. Chosen over suppressing the nudge.
- A crash during the final run of the window misses that evening; no later run
  targets the date.
- Per-trial timezone precision is a follow-up; 23:00 UTC is evening in the US.

### Testing (PR 2)

- 35 unit tests on the Deno-free helper module, registered in
  `apps/myk9show/vitest.config.ts` (root-`supabase` tests are an allowlist, so
  an unregistered file silently never runs in CI).
- Full DB contract suite green; 659 tests × 6 shuffled runs; typecheck + lint.
- Migration reviewed by `migration-auditor` AND the contract suite — the suite
  caught a missing `FORCE RLS` and an RLS-without-policy disposition that the
  agent passed. The tests are the authority.

## Follow-ups filed during review

- **MYK9-205** — RingsideShowBoundary blocks a cold device before the badge/prime action can render (judge-only accounts have no other recovery path).
- **MYK9-206** — replication `totalRows` is rewritten from the local count, so partial quota eviction is undetectable; PR 1 works around it by rewinding scope watermarks before priming.

## Out of scope

- Device-readiness heartbeat for targeted nudges (revisit if unconditional is
  noisy).
- MYK9-198 paper packet (separate issue).
