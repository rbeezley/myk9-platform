# Phase 2 (Live-update nudge) — Scoping Findings

**Date:** 2026-06-07 · **Status:** GREEN to build, migration-free, low risk
**Companion to:** [`plan-show-presence.md`](./plan-show-presence.md) §6 Phase 2 / §11

Scoping pass run before writing any Phase 2 code, to satisfy CLAUDE.md's
"consolidate, don't duplicate" rule and "don't guess — verify" principle. Every
finding below is cited to actual code.

---

## 1. Consolidation: `useRealTimeUpdates` — RESOLVED, no conflict

The plan flagged a risk that Phase 2 would stand up a second realtime path
parallel to existing infra (the PR #576 mistake). Verified:

- `useRealTimeUpdates` is mounted in **exactly one place**: `BrowseShowsPage.tsx:221`
  (the public "browse shows" list). It is **not** in the at-show / secretary /
  scoring path.
- It uses the legacy **payload → Zustand store** pattern (`updateShowLegacy`,
  `updateRegistrationLegacy` into `showStore`/`entryStore`) — the exact pattern
  the plan says to *leave*, not extend.

**Verdict:** Phase 2's `useShowLiveSync` does **not** duplicate it at runtime —
different surface, different mechanism, never co-mounted with the in-show
surfaces. Leave `useRealTimeUpdates` as-is (page-scoped legacy). Optional future
cleanup: migrate `BrowseShowsPage` onto the nudge pattern too — **out of Phase 2
scope.** The "parallel system" risk is contained.

## 2. Realtime publication membership — core tables already covered

Tables in the `supabase_realtime` publication (grep of all migrations):
`entries`, `classes`, `show_messages`, `show_message_threads`.

- **Score *results* are denormalized on `entries`** — `is_scored`,
  `result_status`, `total_score`, `final_placement` (migration `003`). `entries`
  is published, so **live results propagate for free** — no migration needed for
  Phase 2's "lists/results update instantly" goal.
- Granular `scores` / `placements` tables (subscribed by `RealtimeScoringService`
  for the live scoresheet) are **not** added to the publication by any migration.
  That is RealtimeScoringService's concern, separate from Phase 2's list/results
  nudge — **see the latent-bug flag in §5.**

**Verdict:** Phase 2 core needs **no migration** (entries + classes already
published). No shared-DB change to confirm with the user.

## 3. Incremental sync — CONFIRMED incremental

- `replication:sync-requested` is honored at `ReplicationSyncProvider.tsx:384` →
  calls `triggerSync` (`:182`).
- `triggerSync` uploads pending mutations, then fans out `table.sync(licenseKey)`
  over all `REPLICATED_TABLES` **without** `forceFullSync`.
- `syncReplicatedTable.ts:71`: `const rawSince = forceFullSync ? 0 :
  metadata?.lastIncrementalSyncAt || 0;` — each table pulls only rows changed
  since its last sync (with an `incrementalBufferMs` overlap to avoid boundary
  misses). **Genuinely incremental**, not a full pull.

**Caveat (cost, not correctness):** the trigger fans out to **all 9** replicated
tables per nudge (shows, trials, classes, entries, dogs, clubs,
judge_assignments, armbands, waitlist_entries) — each incremental. On a 500-entry
show, one entry change = 1 real delta + 8 cheap empty-delta checks. Acceptable;
the debounce bounds frequency. *Optional* optimization: a table-scoped nudge to
skip the 8 empty checks — a design choice, **not a blocker.**

---

## 4. Tightened Phase 2 shape

- **`useShowLiveSync(showId)`** — subscribe via the existing `subscriptionManager`
  to `postgres_changes` on `entries` + `classes`, filtered to the active show;
  debounce ~250–500ms; dispatch `window.dispatchEvent(new
  CustomEvent('replication:sync-requested'))`. Reuses the existing handler +
  incremental sync — minimal new code, **reads no data from the realtime payload**
  (the sync is what writes the cache).
- **Mount** at the same in-show provider seams presence uses (at-show boundary /
  Workbench / Show Details), so the two realtime features share lifecycle.
- **Kill switch** — gate behind a flag (sibling to `features.showPresence`, e.g.
  `features.showLiveSync`); flag off ⇒ falls back to the existing 60s poll.
- **Optional toast** — "Results updated" (ARIA-polite live region), gated to
  meaningful changes; revives the deleted `LiveUpdateIndicator` UX.

**Open design decision (record at build time):** reuse the global
`replication:sync-requested` (simplest, proven, incremental) vs add a
table-scoped sync trigger (surgical, skips empty-delta checks). **Recommend:**
start with global reuse; add table-scoping only if profiling shows the empty
checks matter on large shows.

**Tests (assertion-first):**
- A simulated realtime event dispatches **exactly one** `replication:sync-requested`
  within the debounce window.
- No data from the realtime payload is trusted (sync writes the cache).
- Offline client still converges on its own reconnect-sync (regression guard).
- Two-context Playwright: judge marks a class complete → secretary's board
  reflects it within ~1–2s.

---

## 5. Side flags (out of Phase 2 scope, worth tracking)

1. **Latent bug — `scores`/`placements` realtime may silently no-op.**
   `RealtimeScoringService` subscribes to `postgres_changes` on `scores` and
   `placements`, but no migration adds them to `supabase_realtime`. Either they
   were enabled via the dashboard (then it works) or the live scoresheet's
   granular updates are silently dropped. **Verify publication membership in the
   live DB** independent of Phase 2.
2. **Phase 1 live validation still un-run.** The opt-in two-context browser spec
   (`RUN_PRESENCE_E2E=1`) hasn't been executed against real Realtime — cheapest
   de-risk before flipping `features.showPresence` on and before stacking Phase 2
   on the same socket.

## 6. Readiness verdict

**GREEN.** Build foundation verified, migration-free, low blast radius. Phase 2
is mostly *wiring* existing primitives (subscriptionManager + the existing
incremental-sync handler), not greenfield. Proceed when ready.
