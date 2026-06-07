# Phase 2 — Live-update nudge (`useShowLiveSync`)

**Date:** 2026-06-07 · **Status:** Ready to build
**Companion to:** [`plan-show-presence.md`](./plan-show-presence.md) §6 Phase 2,
[`plan-show-presence-phase2-scoping.md`](./plan-show-presence-phase2-scoping.md)

Phase 1 (presence) is merged and validated live (#579, #585). Phase 2 makes the
in-show data surfaces refresh **live** instead of waiting up to 60s for the
background poll: a Supabase Realtime subscription on the show's `entries` +
`classes` nudges the existing incremental replication sync within ~1–2s of a
change.

The scoping pass already proved this is **mostly wiring** existing primitives
(no migration; `entries`/`classes` already in the `supabase_realtime`
publication; `replication:sync-requested` handler + incremental `triggerSync`
already exist). This doc records the concrete implementation grounded in the
actual code.

---

## Design (grounded in real code)

### Mechanism

`useShowLiveSync(showId)` is a **pure side-effect hook** (returns `void`, holds
no React state → never re-renders its host). It:

1. Reads the show's trial IDs from the **already-synced** replicated cache
   (`replicatedTrialsTable.getTrialsByShow(showId)` — a local IndexedDB read,
   not a network call).
2. Opens one Realtime channel `show-live:<showId>` and subscribes to
   `postgres_changes`:
   - `entries` filtered `show_id=eq.<showId>` (high-volume: check-ins, scores,
     placements — all denormalized on `entries`, migration 003).
   - `classes` — `classes` has **no `show_id`** (FK is `trial_id`), so we scope
     by the show's trials with **one `.on()` binding per trial**
     (`trial_id=eq.<id>`). This avoids the cross-show traffic leak that
     `useTVRealtime` accepts by subscribing to `classes` unfiltered — important
     at "hundreds of clubs" scale. We use per-trial `eq` (not `trial_id=in.(…)`)
     deliberately: the realtime-js client passes `filter` to the server verbatim
     (`filter?: string`, no client-side validation), so `in`-operator support is
     unverifiable without a live run — exactly the Phase 1 class of bug (CI-green,
     dead on real Realtime). `eq` is the most basic, universally-supported
     operator; stacking multiple bindings on one channel is the standard pattern
     (`useTVRealtime` stacks two). Typical shows have 1–6 trials.
3. On any change, **debounces ~400ms** then dispatches a bare
   `window.dispatchEvent(new Event('replication:sync-requested'))`.
   `ReplicationSyncProvider` (line 384) already listens for this and calls the
   incremental `triggerSync` (uploads pending mutations, fans out
   `table.sync()` over replicated tables without `forceFullSync`, invalidates
   React Query). **We read nothing from the realtime payload** — the sync is
   what writes the cache. This keeps offline-first authority with the
   replication layer (CLAUDE.md "never bypass replication in core flows").
4. On Realtime **reconnect** (a second+ `SUBSCRIBED`), fires one catch-up nudge
   to pull anything missed during the gap. (First `SUBSCRIBED` does not nudge —
   provider startup sync already covers mount.)

### Robustness / failure modes

- **`getTrialsByShow` throws or returns `[]`** — wrapped in try/catch; on failure
  or empty result we still subscribe to `entries` and skip `classes` (degrades to
  the 60s poll for class-status only; entries stay live). A trials-read failure
  must never crash the host subtree.
- **Async race / StrictMode double-mount** — the trials read is async, so the
  effect guards channel creation behind a `cancelled` flag set in cleanup; if the
  effect is torn down before the read resolves, no channel is opened. Cleanup
  removes the channel (if created) and clears any pending debounce timer.
- **Realtime error/timeout (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`)** — not
  treated specially; the client auto-rejoins and the reconnect catch-up + 60s
  poll are the safety net. No bespoke retry path (avoids a parallel system).
- **Security** — the nudge carries no data; the client only learns "something in
  this show changed," then re-syncs through the normal RLS-authorized replication
  path. No new data exposure vs. the existing poll.

### Why no internal poll

The scoping doc said "flag off ⇒ falls back to the 60s poll." That poll already
exists at the provider level (`ReplicationSyncProvider` line 365,
`SYNC_INTERVAL_MS = 60000`) and runs **unconditionally**, independent of this
hook. So when live-sync is off, disconnected, or never connects, data still
refreshes every 60s + on tab-visibility. We do **not** add a second
`setInterval` (unlike `useTVRealtime`, which polls because it bypasses the
replication provider). The realtime nudge only makes the existing freshness
*faster* (≤~2s vs ≤60s).

### Kill switch

`features.showLiveSync` (dark by default) **||** `import.meta.env.VITE_SHOW_LIVE_SYNC === 'true'`
— exact sibling of the `showPresence` pattern (`useShowPresence.ts:37`).
Evaluated at call time so tests/E2E can toggle via env. When off, the hook is a
complete no-op (opens no channel).

### Mount

Call `useShowLiveSync(showId)` inside **`ShowPresenceProvider`** — the
established per-show realtime boundary, already mounted at all three in-show
seams (`ShowDetailsPage:486`, `ShowWorkbenchPage:383`, `atShowRoutes:56`). One
mount point ⇒ can't forget a seam; lifecycle is genuinely identical to
presence. The two features keep **independent kill switches** (each hook checks
its own flag), so they are not coupled at runtime — only co-located. Update the
provider's doc comment to say it now hosts both sibling realtime features
(presence + live-sync). No rename (would widen blast radius for no behavior
gain).

### Open decision — resolved

Scoping left "global `replication:sync-requested` reuse vs table-scoped trigger"
open. **Resolved: reuse the global event.** It's proven, incremental, and
zero-new-handler. The only cost (fan-out to all 9 replicated tables per nudge,
8 of them cheap empty-delta checks) is bounded by the 400ms debounce and is not
worth a parallel trigger path at this phase. Revisit only if profiling on large
shows shows the empty checks matter.

### Deliberate scope boundary — no toast/indicator in Phase 2

The scoping doc listed an optional "Results updated" toast (reviving the deleted
`LiveUpdateIndicator`). **Deferred deliberately, not as a rotting follow-up:**
the engine is complete and *lovable* on its own — data simply stays fresh
silently, which is the correct default for a live results board. A naive toast
firing on every entry change during a busy 500-entry show would be *anti*-lovable
(noise). A good indicator needs real "meaningful change" gating (debounced
count, dismissible, ARIA-polite) — its own small design exercise. It is **not**
integral to "live updates work." No `TODO` is left in code; this paragraph is
the record. Revisit as Phase 2.1 if users ask for visible confirmation.

---

## Files

| File | Change |
| --- | --- |
| `src/config/features.ts` | **[edit]** add `showLiveSync: false` + doc comment |
| `src/features/show-live-sync/useShowLiveSync.ts` | **[new]** the hook + `showLiveSyncEnabled()` + `liveSyncChannelName()` exports |
| `src/features/show-presence/ShowPresenceProvider.tsx` | **[edit]** call `useShowLiveSync(showId)`; update doc comment |
| `src/test/features/show-live-sync/useShowLiveSync.test.tsx` | **[new]** unit tests |

No migration. No shared-DB change. No new provider.

---

## Tests (assertion-first)

Unit (`useShowLiveSync.test.tsx`), mirroring the show-presence mock shape
(`vi.mock` of `@/supabaseClient` returning a fake channel with chainable `.on`,
`.subscribe(cb→'SUBSCRIBED')`, `topic`, `state`; mock `replicatedTrialsTable`):

1. **Off by default** — with the flag dark and no env override, the hook opens
   **no channel** (`supabase.channel` not called). *(write red first: assert
   not-called)*
2. **Subscribes to entries + per-trial classes when enabled** — with env
   override on and `getTrialsByShow` → `[{id:'t1'},{id:'t2'}]`, asserts
   `.on('postgres_changes', { table: 'entries', filter: 'show_id=eq.<id>' }, …)`
   **and** one classes binding per trial:
   `.on(... { table: 'classes', filter: 'trial_id=eq.t1' } …)` and
   `… 'trial_id=eq.t2' …`, with the exact filter strings (assertion-first on the
   filter value — the value-sensitive bit).
3. **Debounced single nudge** — firing N postgres_changes callbacks within the
   window dispatches **exactly one** `replication:sync-requested`
   (`window.addEventListener` spy), after the debounce elapses (fake timers).
4. **No classes subscription when show has no trials** — `getTrialsByShow` → `[]`
   ⇒ entries `.on` registered, classes `.on` **not** registered (degrades to
   poll for classes; entries still live).
5. **Reconnect catch-up** — second `SUBSCRIBED` fires one nudge; first does not.
6. **Cleanup** — unmount calls `supabase.removeChannel` and clears the pending
   debounce timer (no nudge after unmount).
7. **No payload trust** — the nudge is a bare `Event` with no `detail` (the
   sync, not the payload, writes the cache).

Run: `cd apps/myk9show && npx vitest run src/test/features/show-live-sync/useShowLiveSync.test.tsx`,
then `pnpm typecheck` + `pnpm lint`.

E2E (opt-in, deferred to live validation like Phase 1): two-context Playwright —
judge marks a class complete → secretary's board reflects within ~1–2s. Tracked
in the spec as `test.fixme` until run live (Phase 1's live-validation precedent).

---

## Rollout

1. Land dark (`showLiveSync: false`) behind the kill switch — zero runtime
   behavior change in prod until flipped.
2. Validate live with `VITE_SHOW_LIVE_SYNC=true` (two browsers, real Realtime),
   same as the Phase 1 live-validation pass that caught 3 real bugs.
3. Flip the flag in a follow-up once validated.
