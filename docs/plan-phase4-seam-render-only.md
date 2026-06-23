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

## Live spike findings — 2026-06-23

A throwaff Playwright probe (signed-in secretary, real staging auth, harness
serving the sync-down reads) proved the approach **renders live** and surfaced
two things the unit tests can't:

1. **Authz RPCs must pass through.** The app loads RBAC via
   `POST /rpc/get_user_permissions` → `get_effective_permissions`; the harness
   blocked them as "unhandled mutations" → "You don't have permission." Fix: pass
   `allowWritePaths: [/rpc\/[a-z_]*permission/, /rpc\/[a-z_]*role/, /rpc\/can_manage_show/, /rpc\/is_show_manager/]`
   to `installPhase4SeamRoutes` — these are READS (the real signed-in user's real
   permissions), safe to reach staging.
2. **The fixture's `PHASE4_ROUTES` were stale.** Real secretary entry management
   is `/secretary/entries/:showId` (redirects to `/shows/:id/entry-management`),
   NOT `/secretary/shows/:showId/entries`. Show detail `/shows/:id` and
   `/secretary/shows/:showId` (→ `/shows/:id/setup`) render too.

**Proven (secretary):** `/shows/:id`, `/secretary/entries/:id`,
`/secretary/entries/:id?entryTab=scratches` (entries Scout/Alice/Ziva/Ben render),
`/secretary/shows/:id` — all show the fabricated "Autumn Classic" with show name +
fixture entries, RBAC passing, **zero blocked mutations**. Screenshot evidence
captured.

### Committed render-only spec — 2026-06-23

`phase4CrossRoleSeams.spec.ts` is now a **secretary render-only walk** (replaces
the gated propagation tests): pre-sets every seam state in one fixture, signs in
as the real secretary, and screenshots each surface. Gated by
`PHASE4_SEAM_FIXTURE_READY` (off in CI — flaky e2e path); the seam logic stays
proven by `src/test/phase4-seam/*`. Captured live (passing):

| Screenshot | Surface | Result |
| --- | --- | --- |
| `phase4-dynamic-show-detail` | `/shows/:id` | Full render |
| `phase4-dynamic-entry-management` | `/shows/:id/entry-management` | Full render — 5 fixture entries, statuses, $150 revenue |
| `phase4-dynamic-scratch-pull` | `…?entryTab=scratches` | Pull Management with the pending pull request (reason, handler, Approve/Deny) + Pending(1)/Processed(1) |
| `phase4-dynamic-results-control` | `/shows/:id/results-control` | Page loads; Results Visibility list is skeleton (needs more served reads) |

**Two known cosmetic gaps (not blockers):**
1. **"Unknown Dog"** on the Pull card — that card joins the replicated `dogs`
   table, which the harness does NOT serve (the entry-view's `dog_call_name`
   renders fine elsewhere). Fix: add `dogs` to `SYNC_READ_TABLES` with a fixture
   dog-row transform.
2. **Results Control visibility list renders as skeleton** — needs the per-class
   visibility/results reads served too.

### Remaining (EXHIBITOR side — deferred)

Standalone `/exhibitor/entries` and the show-scoped My Entries tab are
**identity-scoped**: `getUserEntries` matches `handlerId === userId` (person id)
OR `ownedDogIds.has(dogId)` from the **real account's real dogs** — so a fabricated
entry won't appear without bridging to a real owned dog (set a fixture entry's
`dog_id` to one of `DEMO_EXHIBITOR`'s real synced dog ids, read from IndexedDB at
runtime) or serving fixture `dogs` owned by the real person id. Exhibitor
`/messages/:id` renders (the audit's known-blank state) and class-level results
are servable. Show detail already renders for the exhibitor.

## Residual / out of scope

- Real-browser propagation **latency numbers** are intentionally NOT produced
  (owner accepted the unit suite as the propagation proof).
- The 5 UX findings the audit raised (exhibitor post-deadline dead-end, blank
  `/messages/:showId`, cross-role refund disagreement, etc.) are separate
  remediation items, not part of this harness work.
