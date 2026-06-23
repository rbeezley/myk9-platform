# Phase 4 Cross-Role Seams — Render-Only Read Strategy

> **Status:** Active

Resolves the deferred "read strategy" decision that blocked three `[~]` items in
[`OPEN-TODOS.md`](../OPEN-TODOS.md) (UX Journey Audit § Phase 4): **[UX] Exhibitor
confirmation/results leg**, **Phase 4 — cross-role seams**, **[UX P2] Seed Phase 4
seam fixtures**. Source audit: [`docs/audits/2026-06-ux-journeys/03-cross-role-seams.md`](audits/2026-06-ux-journeys/03-cross-role-seams.md).

## Decision

**Render-only via REST read-interception (Option A-lite).** Owner chose this over
local-Supabase (Option B / full propagation latency) on 2026-06-23: the 18-case
unit suite already proves the seam transition logic + cross-role state agreement
deterministically, so the remaining gap is **per-role render evidence**
(screenshots of each seam state), not real-browser propagation timing.

Rejected alternatives:

- **B — local Supabase.** Highest fidelity (real propagation latency through a
  real backend), but needs Docker and treats the unit-proven propagation as
  un-trusted. Overkill for render evidence.
- **Pre-seed IndexedDB directly.** Couples to replication store internals (DB
  name, compound key `[table, id]`, `{syncStatus,isDirty,data,version}` row shape,
  TTL math) and fights the app's own sync, which `batchSet`-overwrites seeded rows
  on first load. Brittle.

## Why read-interception is clean (verified)

The replication layer (`@myk9/replication`) is **pure REST sync-down, no realtime**
(`ReplicatedTable.subscription.test.ts:52-57` — `subscribe` is IDB-local only).
On show load, `ReplicationSyncProvider` calls `.sync()`, whose adapter issues a
PostgREST `GET …?select=*&updated_at=gt.<since>&order=updated_at.asc` and
`batchSet`s the response into IndexedDB; `getAll()` then serves those rows. So a
fixture row returned from an intercepted GET is **indistinguishable from server
truth** — zero coupling to store internals.

The harness already intercepts every **write** (proven write-safe by the unit
suite) and already serves the non-replication reads (`show_messages`,
`show_message_threads`, `waitlist_entries`, `view_entry_with_results`). The
authors deliberately punted the replication-backed reads
(`phase4SeamHandlers.ts:467-471` — "let them continue rather than racing the
IndexedDB layer"); **that punt is exactly this decision.**

## Sync-down endpoints to serve (from the live app)

| Table | Endpoint | Scope filter | Min columns (mapper never throws) |
| --- | --- | --- | --- |
| Entries | `GET /rest/v1/view_authenticated_entry_results` | `show_id=eq.` | `id`, `updated_at` (+ render fields: `entry_status`, `check_in_status`, `payment_status`, `class_id`, `dog_id`, `handler`, `armband`, `is_scored`, `final_placement`, `dog_call_name`) |
| Classes | `GET /rest/v1/classes` | `trial_id=eq.` | `id`, `trial_id`, `name`, `updated_at` (+ `element`/`level`/`section`, `entry_fee`, `max_entries`, `results_released_at`) |
| Trials | `GET /rest/v1/trials` | `show_id=eq.` | `id`, `show_id`, `name`, `date`, `updated_at` |
| Shows | `GET /rest/v1/shows` | (global sync) | `id`, `name`, `organization`, `start_date`, `end_date`, `updated_at` |

Column inventory cited from `ReplicatedShowsTable.ts:76-117`,
`ReplicatedTrialsTable.ts:65-90`, `ReplicatedClassesTable.ts:127-218`,
`ReplicatedEntriesTable.mapper.ts:124-230`.

## Implementation slices

1. **Read-table set** (`phase4SeamHttp.ts`): add `SYNC_READ_TABLES`
   (`shows`, `trials`, `classes`, `view_authenticated_entry_results`) used on the
   READ branch only — writes stay gated on `FIXTURE_TABLES` so a stray write to a
   read-only table still trips `assertNoUnhandledAppDataMutations`. Add a
   `extractGtFilter(url, column)` helper for the `updated_at=gt.<iso>` watermark.
2. **Sync-read handler** (`phase4SeamHandlers.ts`): `handleSyncRead(state, table, req)`
   emits DB-shaped (snake_case) rows from fixture state, honoring the `eq` scope
   filter and the `gt` watermark (`updated_at > since`). Fixture→DB-row transforms
   for show / trial / class / entry-view.
3. **Fixture constants** (`phase4SeamFixture.ts`): add the few mapper-required
   fields the model lacks — `show.organization`, `show.start_date`/`end_date`,
   `show.club_id`, and a synthesized `trial` row (`date`, `name`).
4. **Identity remap** (optional, for live capture): `installPhase4SeamRoutes`
   gains `{ asExhibitorUserId, asExhibitorPersonId }` so served exhibitor rows
   adopt the **real** signed-in `TEST_USERS.EXHIBITOR` id — otherwise client-side
   "my entries" filters drop them. Defaulted off; unit-tested.
5. **Spec** (`phase4CrossRoleSeams.spec.ts`): gate flips to render+screenshot per
   role per seam state; drop the propagation/latency asserts (now unit-owned);
   set `PHASE4_SEAM_FIXTURE_READY=1`. Writes stay blocked for safety.

## Testing

- **Assertion-first unit tests** (`src/test/phase4-seam/phase4SeamSyncReads.test.ts`):
  for each of the 4 tables, assert the served row carries the mapper's required
  columns with the fixture values, that the `eq` scope filter narrows correctly,
  that the `gt` watermark excludes older rows / includes on full sync (`since=0`),
  and that identity remap rewrites ownership. Run red first where it pins a
  specific column value.
- Existing 18-case write-safety suite must stay green (no regression).
- **Live screenshot capture** runs where a dev server is reliable (not this
  worktree — Preview MCP serves `main`; see
  [`feedback_preview_mcp_pinned_to_main`]). Documented as the final step; not a
  blocker for landing slices 1-4 + tests.

## Residual / out of scope

- Real-browser propagation **latency numbers** are intentionally NOT produced
  (owner accepted the unit suite as the propagation proof).
- The 5 UX findings the audit raised (exhibitor post-deadline dead-end, blank
  `/messages/:showId`, cross-role refund disagreement, etc.) are separate
  remediation items, not part of this harness work.
