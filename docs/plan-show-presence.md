# Plan: Show-Day Presence & Live Awareness

**Status:** Draft for review — verified via /verify-plan 2026-06-07 (gaps patched; see `[ADDED]`/§12)
**Created:** 2026-06-07
**Author:** Claude (with R. Beezley)
**Related history:** PR #576 deleted the never-wired `services/collaboration/*` cluster. This plan rebuilds the *valuable* parts on the architecture the app already has, instead of the parallel engine that was removed. See `docs/DEFERRED-WORK.md` §9.

---

## 1. Why this exists (positioning)

Competitors stop at the transaction: online entries + recorded scores. The differentiator for myK9Show is **"the complete show experience"** — a show that feels *staffed and alive*. Presence and live awareness are the visible proof of that promise:

- An exhibitor sees the **secretary is online** and results are flowing → trust.
- A secretary sees **Judge Martinez is on Ring 3, scoring** → coordination without radios.
- Two club staff editing setup **don't silently overwrite each other** → integrity.

This is communication layered onto the data, not a second database with a form on top.

## 2. Architectural principle (the load-bearing decision)

The deleted feature failed because it stood up a **parallel real-time engine** that broadcast *data* peer-to-peer — which silently dropped offline clients and duplicated the sync concern. We do not repeat that. Three needs, three correct homes:

| Need | Nature | Home | Status today |
|---|---|---|---|
| **Presence** — who's online, where, doing what | Ephemeral, sub-second | Supabase **Realtime presence** | Primitive exists: `apps/myk9show/src/utils/realtimeOptimization.ts` (`.track()`, `presenceState()`, adaptive heartbeat) |
| **Live data** — results posted, class in progress, scratched | Persistent, must survive offline | **`@myk9/replication`** | Already syncs; only the *latency* (60s poll) needs improving |
| **Edit safety** — no silent overwrite | Persistent, offline-tolerant | **Optimistic version-conflict (OCC)** in the replication write path | `version` field + `ConflictResolver` exist; today resolves **silently last-write-wins** |
| **Edit coordination** — "X is editing this" | Ephemeral, advisory | Presence channel (soft warning) | New, small |

**Two rules that fall out of this:**

1. **Realtime is a *nudge*, never a data channel.** When a row changes, a realtime signal carries *no payload* — it only fires the app's existing `replication:sync-requested` CustomEvent so every online client pulls truth immediately. Offline clients still catch up on their own reconnect-sync. One source of truth, instant feel.
2. **No hard locks.** A pessimistic server lock cannot be acquired offline, so an offline editor edits anyway and you *still* need conflict handling on reconnect. Therefore OCC is mandatory regardless; locks would only ever be advisory. We build the advisory ("X is editing") soft signal and skip hard enforcement.

## 2.5 Robustness posture — what "as robust as possible" means here

We serve hundreds of clubs that all operate differently. We design for **arbitrary concurrency**, never for an assumed "how clubs usually work." But offline-first sets an honest ceiling, so we state the guarantee precisely:

- **Hard guarantee — no silent data loss, ever.** Any same-field collision, on **any** replicated table, by **any** role, **online or offline**, is detected and surfaced for a human to resolve. Nothing is ever silently overwritten. This lives as **one general mechanism at the replication layer** (Phase 4), not as per-surface special-casing — a general net is both more robust and simpler than hand-tuned rules per screen.
- **Best-effort — collisions are made rare.** Presence, live-nudge, and "X is editing" (Phases 1–3) let online users see each other and coordinate, so the safety net rarely has to fire.
- **The honest ceiling.** We cannot *prevent* two offline users from both editing the same record — no system can. "Robust" therefore means *guaranteed reconciliation*, not *guaranteed prevention*. This is exactly how Git, Google Docs offline, and every serious offline app behave.

**Consequence:** the conflict-surfacing safety net (Phase 4) is the integrity backbone — built **general**, on its **own track**, and **landing before GA** (sequencing in §11; it doesn't have to be coded first because the silent-LWW it fixes is pre-existing). Scoring and exhibitor check-in — the surfaces most likely to see real contention — are simply *covered instances* of the general net, not bespoke code. Cross-field cases (judge writing scores while a steward writes check-in) are *already* field-merged today (§4); the general net adds same-field safety on top.

## 3. Non-goals

- ❌ No parallel sync/broadcast engine for data (the PR #576 mistake).
- ❌ No hard/pessimistic edit locks with blocking + stale-lock recovery UX.
- ❌ No new pages or routes. Presence threads into **existing** surfaces (header, ring board, edit panels).
- ❌ No persisting "who was online at 2:14pm" history. Presence is ephemeral.

## 4. Existing primitives to reuse (do not reinvent)

- `apps/myk9show/src/utils/realtimeOptimization.ts` — Realtime channel helper with `.track()` / `presenceState()` / adaptive heartbeat and reconnect backoff. **This is the presence transport.**
- `apps/myk9show/src/providers/ReplicationSyncProvider.tsx` — owns the sync loop and already listens for a `replication:sync-requested` CustomEvent and a `replication:recovery` event. **This is the nudge target.**
- `packages/replication/src/syncReplicatedTable.ts` (dirty-row path, ~lines 99–119) + `packages/replication/src/conflict/ConflictResolver.ts` — **this is where conflict surfacing is hardened.**
- `apps/myk9show/src/hooks/useAuthContext` — current user id / name / role for the presence payload (the replication layer has no user identity; presence gets it from React).
- Deleted-code references in PR #576 history — crib the **heartbeat cadence + reconnect backoff** (`PresenceService`) and the **lock-expiry math + typing-indicator** (`CollaborativeEditingService`). Crib algorithms, not architecture.

---

## 5. The realtime presence contract

One channel per show. Payload tracked per connected client:

```ts
// channel name: `presence:show:${showId}`
interface ShowPresence {
  userId: string;
  name: string;
  role: 'secretary' | 'club_admin' | 'judge' | 'exhibitor' | 'steward';
  avatarUrl?: string;
  location: {
    page: string;             // e.g. '/at-show/ring/3'
    entityType?: 'show' | 'trial' | 'class' | 'entry';
    entityId?: string;
  };
  activity: 'viewing' | 'scoring' | 'editing' | 'checking-in';
  editing?: { entityType: string; entityId: string }; // drives "X is editing"
  ts: number;
}
```

- **Heartbeat:** Supabase presence keeps the socket alive and auto-drops on disconnect; we re-`track()` on route/activity change plus a ~20s keepalive fallback (cadence cribbed from the deleted `PresenceService`).
- **Identity:** assembled in the presence hook from `useAuthContext` + current route.
- **Security:** the channel is scoped to a single `showId`. Presence payload contains no secrets (name/role/page only). If Realtime Authorization is enabled, gate channel join to authenticated users with a role on that show; otherwise rely on the show-scoped channel name + non-sensitive payload. **Decision flagged in §10.**

---

## 6. Phased delivery

Each phase is independently shippable and leaves the app in a better state. Each phase is **not complete until its tests are written and passing** (per CLAUDE.md).

### Phase 1 — Presence foundation (no DB, no migration)

**Goal:** "who's here" works and is visible.

- `useShowPresence(showId)` hook wrapping `realtimeOptimization.ts`: joins `presence:show:${showId}`, tracks the local `ShowPresence`, returns the deduped list of present users (deduped by `userId` across tabs/devices, newest `ts` wins).
- `<PresenceStack />` — avatar cluster ("3 here", overflow "+2"), placed in the show header / `AppHeader` show context. Reuses the avatar component already used in `AppHeader`.
- Wire `location`/`activity` from the current route (a thin `usePresenceActivity()` that maps pathname → activity).

**Surfaces:** show header avatar stack; per-ring "judge online" dot on the secretary ring board / show map (reads the same presence list, filtered by `location.entityId`).

**Tests:**
- `useShowPresence` — mock the Realtime channel; assert track payload, dedupe-by-userId, and cleanup on unmount (mirror the PR #576 `PWAInstallBanner` class-toggle test style).
- `<PresenceStack />` — renders N avatars + overflow; empty state renders nothing.

**Done when:** opening the same show in two browsers shows each other in the stack within ~1s, and closing one drops it.

### Phase 2 — Live-update nudge (no DB, no migration)

**Goal:** lists/results update near-instantly instead of on the 60s poll.

- A `useShowLiveSync(showId)` hook subscribes to Supabase `postgres_changes` (or a lightweight broadcast) for the active show's hot tables (`entries`, `classes`, `results`/scoring) and, on any event, dispatches `window.dispatchEvent(new CustomEvent('replication:sync-requested'))` — the event `ReplicationSyncProvider` already honors. **No data is read from the realtime payload.**
- Debounce nudges (~250–500ms) so a burst of row changes triggers one sync.
- Optional subtle "Results updated" toast (revives the deleted `LiveUpdateIndicator` UX) gated to meaningful changes.

**Prerequisites [ADDED]:**
- **Enable Realtime on the hot tables** by adding them to the `supabase_realtime` publication (migration or dashboard). `postgres_changes` delivers nothing otherwise — Phase 2 silently no-ops without this step. RLS still governs the subscription; confirm a show participant can subscribe to their show's rows (and a non-participant cannot).
- **Confirm the nudge triggers an *incremental* sync** (uses `lastIncrementalSyncAt`), not a full table pull. Otherwise a 500-entry show re-pulls everything on every change — the debounce limits frequency, incremental limits payload.

**Tests:**
- Assert that a simulated realtime event dispatches exactly one `replication:sync-requested` within the debounce window (assertion-first).
- Assert no data from the realtime payload is trusted (the sync is what writes the cache).

**Done when:** a judge marking a class complete in one session causes the secretary's board in another session to reflect it within ~1–2s, and an *offline* client still converges on its own reconnect-sync (regression guard).

### Phase 3 — Soft edit awareness ("X is editing")

**[STATUS 2026-06-08] — SHIPPED & ENABLED (`features.showEditAwareness: true`).** Landed
dark in #593 (impl + Codex-found first-mount race fix) and enabled in #594. On the wire:
producer setters `setEditing`/`clearEditing` on the existing presence channel
(`useShowPresence`, with a `pendingEditRef` that survives the child-before-parent effect
ordering on first mount), the `whoIsEditing` selector, the `useEditingPresence`
(set-on-open/clear-on-close) and `useIsEntityBeingEdited` hooks, and the advisory
`<EditingBadge>` (`role="status"`, calm amber dot, `// INTENT:`-guarded as advisory-only —
never a lock, Save stays enabled). Env override `VITE_SHOW_EDIT_AWARENESS`; flip the const
back to `false` to instantly close it. **Wired surfaces:** (1) `ShowEditPanel`
(`entityType: 'show'`), already inside a `ShowPresenceProvider`; (2) `EditEntryDialog`
(`entityType: 'entry'`) on `ClassDetailsPage` — that page is show-scoped (`/shows/:showId/…`)
so it was wrapped in a `ShowPresenceProvider showId={parentShow?.id}` to host it. **§2
entry-level acceptance is met:** two staff opening the same `EditEntryDialog` each see the
other's badge — both key on the same `entries.id`. (3) **[ADDED 2026-06-07]** the
*exhibitor*-side `EntryEditDialog` on the **cross-show** `MyEntriesPage` now also participates,
closing the *exhibitor↔secretary* cross-surface case. **Id-equality finding:** `EntryData.id`
is **not** a safe shared key — `groupEntriesByShowAndDog` collapses a dog's N class rows into
one card whose `id` is only the **first** row's `entries.id`, so a single header badge keyed on
it would silently miss a secretary editing any non-first class. The correct shared id space is
the **per-class** `EntryClass.id` (each *is* a real `entries.id`; proven by the save path and
`EntryEditDialog.test.tsx:122`). Wiring respects that and the single `editing` slot per user:
(a) a per-dialog `ShowPresenceProvider showId={entry.showId}` wraps just the open dialog (the
cross-show page can't take a page-level one); (b) **read** = per-class-row
`<EditingBadge entityId={classEntry.id}>`, exact for every class; (c) **write** =
`useEditingPresence('entry', entry.id)` advertises the group's *primary* id only (the model
broadcasts one slot), so for multi-class groups a secretary sees the exhibitor on the primary
class — a graceful, advisory-only gap, never a wrong-entity badge. Covered by
`EntryEditDialog.editAwareness.test.tsx` (incl. a multi-class read case). The two dialogs are
**not** duplicates (exhibitor pre-deadline self-edit vs staff results/handler edit). The flag
is already flipped (#594) — run the two-browser validation on staging if not yet done.
**Phase 3 is complete (show + entry, staff + exhibitor). Next major phase: Phase 4 (conflict
surfacing) — its own track, pre-GA; see `docs/handoffs/2026-06-08-presence-edit-awareness-followups.md`.**

**Goal:** reduce wasted/colliding edits without hard locks.

- Edit panels (entry edit, show setup) call `presence.setEditing({ entityType, entityId })` on open and clear on close/unmount.
- `useIsEntityBeingEdited(entityType, entityId)` derives, from the presence list, whether *another* user is editing it.
- `<EditingBadge />` — "Jane is editing this" inline warning (revives the deleted `EditingIndicator` UX). Advisory only; the Save button stays enabled.

**Tests:**
- `useIsEntityBeingEdited` — present user editing same entity → true; self editing → false; nobody → false.
- Badge renders the other editor's name; hides for self.

**Done when:** two users opening the same entry-edit panel each see the other's "editing" badge.

### Phase 4 — Conflict surfacing — the integrity backbone (general; own track; land before GA)

**Goal:** a genuine same-field collision is *surfaced*, never silently lost — on **every** replicated table, by **any** role, online or offline. This is the §2.5 hard guarantee. It is **not** scoped to specific surfaces; scoring and check-in are covered automatically as instances. Runs as its own track independent of Phases 1–3 (see §11); it is the data-integrity foundation and is **non-negotiable before GA**, but it does not gate the visible presence work (the silent-LWW it fixes is a pre-existing behavior, not one Phases 1–3 introduce).

Today `syncReplicatedTable`'s dirty-row path (`packages/replication/src/syncReplicatedTable.ts` ~99–119) either field-merges (`mergeDirtyRow`) or resolves LWW silently. We add a **general collision detector** at this single chokepoint so every table inherits it:

- When a dirty local row and the incoming remote row have **both changed the same field(s)** since the local base version (compare `version` / `updated_at` + a changed-field set), mark the row `syncStatus: 'conflict'` and emit a `replication:conflict` event with `{ tableName, id, fields }` instead of silently resolving.
- A small `<ConflictBanner />` (or toast) listens for `replication:conflict` and prompts the user to reconcile ("This changed while you were editing — keep yours / take theirs / review"). The default action **never silently discards** the local edit.
- Field-level merge (e.g. judge-scores vs secretary-check-in) stays as-is for **non-overlapping** fields — that cross-role case is already safe. The new detector only fires on genuine **same-field** races, so it adds safety without regressing the existing merge.

**Why general beats per-surface:** putting the detector at the one `syncReplicatedTable` chokepoint means a club doing something we never anticipated — two judges sharing a scoring tablet, an exhibitor and a steward both checking in, a co-secretary editing mid-show — is covered without new code. Per-surface rules would each be a place to forget.

**Conflict ↔ pending-mutation interaction [ADDED] (closes the hole in the guarantee):** the detector runs on the *download* path, but the local edit also lives in the *upload* `pending_mutations` queue. Define the ordering explicitly or "no silent loss" leaks:
- If the local mutation **has not uploaded yet** and a conflicting remote arrives → mark the row `conflict` and **hold** the queued mutation (do not auto-drop it, do not blindly push it) until the user reconciles.
- If the local mutation **already uploaded** (won or lost server-side) → reconcile the local intent against the server result, never silently discard.
- Add tests for *both* orderings; this is the part most likely to silently lose data if unspecified.

**Use `version`, not wall-clock `updated_at`, as the primary collision signal [ADDED]:** client clocks skew, so timestamp-only comparison can mis-resolve. Compare the row `version` against the base version the local edit was made from; use `updated_at` only as a tiebreaker.

**Scoring UX caveat [ADDED]:** a conflict prompt must **not** modal-block a judge mid-score (see §7 INTENT). For the scoring instance, queue/defer the reconcile affordance (non-blocking banner) and integrate with the existing ringside scorer-of-record session (§7) rather than interrupting the run.

**Covered instances to verify explicitly during this phase:**
- **Scoring:** two writers on the same score field of the same entry → surfaced, not LWW. (Check whether ringside already establishes a scorer-of-record session — see §7 — and integrate rather than duplicate.)
- **Exhibitor check-in:** self-check-in vs steward check-in on the same entry's `checkInStatus` → surfaced if the transitions genuinely conflict; live-nudge (Phase 2) keeps both views current so it rarely does.

**Tests (assertion-first, per CLAUDE.md value-sensitive rule):**
- A dirty row + remote that changed the **same** field → `syncStatus === 'conflict'` and a `replication:conflict` event fires with the right fields. Write this red first.
- A dirty row + remote that changed a **different** field → still merges, no conflict event (no regression to the existing field-merge behavior).
- Offline edit → reconnect → same-field server change → conflict surfaced on sync (not LWW).
- Applies across tables: add the same red-first assertion for at least `entries` (scoring + check-in fields) and one setup table (`shows`/`classes`).
- **[ADDED]** Both mutation-queue orderings (not-yet-uploaded vs already-uploaded) surface/hold correctly.
- **[ADDED]** With the Phase 4 flag OFF (§12), the existing field-merge/LWW path is byte-for-byte unchanged (regression guard).

**Review [ADDED]:** Phase 4 edits the shared offline-first sync chokepoint that *every* table depends on — as high-stakes as a migration. Run `/codex:review` + a second reviewer before merge, and ship it behind the §12 flag.

**Done when:** two users editing the same field of the same record — on any surface, including an offline editor reconnecting — produce a visible "reconcile" prompt for the second writer, and neither edit is silently dropped.

### Phase 5 — (Optional) advisory `edit_locks` table

**Not a safety requirement** — Phase 4 (general OCC) already guarantees no silent loss on *every* surface including show setup, and Phase 3 ("X is editing") already warns proactively on *any* entity via presence. A dedicated lock table only adds value if a surface needs an advisory lock that **persists across a page reload / brief disconnect** (presence drops when the tab closes; a lock row outlives it). Decide per-surface if/when that need is demonstrated; do not build speculatively. Soft, steal-able advisory locks (never hard blocks):

```sql
create table public.edit_locks (
  entity_type text not null,
  entity_id   uuid not null,
  show_id     uuid,
  user_id     uuid not null references auth.users(id),
  user_name   text not null,
  session_id  text not null,
  locked_at   timestamptz not null default now(),
  expires_at  timestamptz not null,   -- locked_at + ~90s, renewed by heartbeat; stale => steal-able
  primary key (entity_type, entity_id)
);
-- REQUIRED per CLAUDE.md: explicit GRANTs + RLS.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.edit_locks TO authenticated;
-- RLS: a user may upsert/delete only their own lock rows; SELECT scoped to show participants.
```

Expiry math + acquisition/steal cribbed from the deleted `CollaborativeEditingService`. Realtime nudge notifies on lock change. Still advisory — Phase 4 OCC remains the safety net for the offline case the lock can't cover.

**Tests:** acquire when free; steal when expired; renew bumps `expires_at`; release on close; migration audited (GRANT + RLS + steal-able predicate). Run `/codex:review` on the migration (high-stakes: RLS).

---

## 7. Cross-cutting concerns

- **Identity:** presence payload built from `useAuthContext`; never trust a userId from a realtime payload for any authorization decision (display only).
- **Privacy:** presence shows name + role + current page to other show participants only. No location data leaves the show-scoped channel. Confirm this is acceptable for exhibitors (they may not want other exhibitors seeing their movements — see §10).
- **Performance:** one channel per show (not per entity); debounce nudges; cap rendered avatars with overflow; unsubscribe on show change. Reuse the adaptive-heartbeat throttling already in `realtimeOptimization.ts`.
- **Offline:** presence simply shows fewer people when the socket is down; the live-nudge degrades to the existing 60s poll; OCC still works on reconnect. No feature hard-fails offline.
- **Security review:** Phase 5 migration is high-stakes (new table + RLS) → `/codex:review` + the migration-auditor. **[ADDED]** Phase 4 is equally high-stakes (shared sync path) → same review bar.
- **Realtime connection & auth [ADDED]:** the Realtime socket needs a valid JWT. Re-authenticate the channel on Supabase `TOKEN_REFRESHED` (sessions refresh ~hourly) and handle channel-join errors with reconnect backoff (crib from `PresenceService`). On repeated failure, fall back silently to polling — never block or error the page.
- **Conflict state lifecycle [ADDED]:** a row left in `syncStatus: 'conflict'` must not wedge future syncs. Define: the conflict persists and re-prompts until the user picks keep/take/merge; *other* rows keep syncing meanwhile; navigating away preserves the conflict for next visit; nothing auto-resolves. Provide a "discard local & take server" escape so a user can never get stuck.
- **Show-scoped role [ADDED]:** the presence `role` must be the user's role *in this show* (RBAC scope), not a global role — a `club_admin` at their own club may be an `exhibitor` at another club's show. Resolve via the show-scoped role; default to least-privileged applicable.
- **Incremental sync [ADDED]:** nudges trigger incremental sync (see Phase 2 prereq) to stay cheap on large shows.
- **Accessibility [ADDED]:** the "results updated" toast and `<EditingBadge />` announce via an ARIA live region (`polite`); presence avatars carry accessible names; the conflict prompt is keyboard-navigable and focus-managed.
- **INTENT review [ADDED]:** before threading presence into the header, ring board, and edit/scoresheet panels, read `docs/INTENT.md` for each surface and preserve any `// INTENT:` behavior. Hard rule: a conflict prompt must **not** interrupt a judge mid-score — defer the reconcile UI for active scoring (see Phase 4 scoring caveat).
- **Capacity & cost [ADDED]:** estimate peak Realtime concurrent connections (≈ active users × concurrent shows) against the Supabase plan's limits before GA; one channel per show (not per entity) keeps this bounded. Document the ceiling and the per-channel payload size.
- **Observability [ADDED]:** emit a metric/log on every `replication:conflict` (table + fields) to measure how often the safety net actually fires in the field, plus Realtime connection-health logging. A rising conflict rate is signal that a real club workflow needs first-class design.

## 8. Testing strategy (summary)

| Phase | Unit | Integration / manual |
|---|---|---|
| 1 Presence | hook track/dedupe/cleanup; PresenceStack render | two-browser visibility check |
| 2 Live nudge | event dispatched once per debounce; no payload trust | judge→secretary propagation; offline catch-up regression |
| 3 Edit awareness | `useIsEntityBeingEdited` truth table; badge | two-user same-panel check |
| 4 Conflict surfacing | same-field → conflict (red-first); diff-field → merge; offline path | two-user same-field review prompt |
| 5 Locks (opt) | acquire/steal/renew/release; migration audit | setup-contention check |

Use the custom render from `src/test/utils/testUtils.tsx`. No `await` outside `async`; remove unused vars.

**Automated multi-client E2E [ADDED]:** the "two-browser" rows above must not stay manual — they're the regressions most likely to bite across hundreds of clubs. Add Playwright **two-context** specs (two browser contexts on the same show) for: presence appears/drops (Phase 1), nudge propagation + offline catch-up (Phase 2), and a same-field conflict surfaced to the second writer (Phase 4). Also add a token-refresh/reconnect test for the Realtime channel (§7).

## 9. What to crib from PR #576 history (and what to leave)

- **Crib:** heartbeat cadence + reconnect backoff (`PresenceService`); lock-expiry/steal math + typing-indicator debounce (`CollaborativeEditingService`); the indicator component UX (`PresenceIndicator`, `EditingIndicator`, `LiveUpdateIndicator`).
- **Leave:** `CollaborationHubService` orchestration, the standalone channels, and **all** broadcast-based data sync. Data rides replication; realtime only nudges.

## 10. Open decisions (need product input)

1. ~~Multi-person show setup — real workflow?~~ **RESOLVED 2026-06-07.** Setup is single-secretary in the common case, but we design for arbitrary concurrency anyway (§2.5): the general Phase 4 net covers setup contention if it ever happens, so no setup-specific code is needed. Phase 5 stays optional (proactive nicety only).
2. **Exhibitor presence visibility:** should exhibitors see *each other's* presence/location, or only see staff (secretary/judges)? Privacy-leaning default: exhibitors see staff presence; staff see everyone.
3. **Live-update transport:** `postgres_changes` (needs Realtime enabled on those tables + RLS-aware) vs a broadcast emitted by writers. `postgres_changes` is more robust (catches all writers) — recommended.
4. **Realtime Authorization:** turn on channel-join authorization (RLS for Realtime), or rely on show-scoped channel + non-sensitive payload for v1? **Recommendation [ADDED]:** for the "robust across hundreds of clubs" posture, lean to **authorized channel join** (gate on a role in that show) before GA — the show-scoped-name-only approach leaks name/role/page to anyone who learns a `showId` (which appears in URLs). Acceptable behind the §12 flag for an internal dark-launch; not for GA.

## 11. Suggested sequencing

Order by **dependency + risk + value**, not by "most important." Phase 4 is the *most important* for robustness, but it does not have to be *first*: the silent last-write-wins it fixes **already exists today**, and Phases 1–3 add no new write paths — so they don't worsen data loss and aren't gated by Phase 4. Lead with the visible, low-risk win; run the high-blast-radius core change as its own track.

1. **Phase 1 — presence.** The visible "staffed and alive" differentiator. Additive client code on an existing primitive; touches no core. Fastest validation of the product direction, lowest risk.
2. **Phase 2 — live-nudge.** Completes the "alive" feel. No migration (needs the one-time publication enablement in its Prerequisites).
3. **Phase 3 — editing awareness.** Rides Phase 1's presence channel.
4. **Phase 4 — integrity backbone.** Its **own parallel track**, independent of 1–3 (no dependency either way). It is the **highest-blast-radius change** (edits the shared `syncReplicatedTable` path), so it gets the most review and ships behind the §12 flag. **Non-negotiable before GA / before encouraging heavy concurrent multi-editor use** — but it does not block the visible work.
5. **Phase 5** — only if a specific surface demonstrates the need for a reload-surviving advisory lock. Not built speculatively.

**Guardrail:** until Phase 4 lands, data-loss behavior is exactly today's (silent LWW) — acceptable for build, internal validation, and a flagged dark-launch; **not** acceptable for a hundreds-of-clubs GA. Phases 1–4 need no migration; Phase 4 changes existing replication code paths, Phases 1–3 are new client code on existing primitives.

## 12. Rollout, flags & recovery [ADDED]

Robustness includes *operational* robustness — being able to turn it off fast.

- **Feature flag / kill switch.** Gate presence + live-nudge behind a flag (mirror the existing `shows.unified_ringside_enabled` pattern): dark-launch, ramp by club, and **instantly disable Realtime in production without a redeploy** if it misbehaves. Flag off ⇒ the app falls back to the existing 60s polling, fully functional.
- **Phase 4 behind its own flag.** Phase 4 edits the shared `syncReplicatedTable` path every table uses — the riskiest change in this plan. Keep the new collision branch behind a flag, ship it dark, watch the conflict-rate metric (§7) until it looks sane, then enable. **Rollback = flip the flag back to the existing field-merge/LWW behavior** (regression test guards that the off-path is unchanged).
- **Recovery escape hatches.** The conflict UI offers "discard local & take server"; `ClearCacheButton` must still fully reset replication state if a client ever wedges. Neither requires a deploy.
- **Staged ramp.** Internal show → one friendly club → cohort → GA, gated on the observability signals (conflict rate, Realtime connection health, no rise in sync errors).
