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

`useShowLiveSync(showId)` returns `void` and re-renders its host only when the
show's trial **set** actually changes (React Query structural sharing dedupes
equal refetches), so it stays effectively render-free. It:

1. Reads the show's trial IDs **reactively** from the offline-first replicated
   cache via `useQuery({ queryKey: ['trials', 'live-sync', showId], queryFn: () =>
   replicatedTrialsTable.getTrialsByShow(showId) })` (a local IndexedDB read, not
   a network call). Keying under `['trials']` is deliberate: the incremental
   `triggerSync` invalidates `['trials']` on every sync, so on a **cold start**
   (fresh device, cache not yet synced) the first read returns `[]` → we bind
   entries-only; when the startup sync fills the cache and invalidates, this
   refetches, the trial-id key changes, and the effect **rebinds** with the class
   subscriptions. This closes the gap where a cold mount would otherwise be
   stranded entries-only until remount (Codex PR #587 review, P2). The subscribe
   effect waits for `isFetched` so a warm mount opens exactly one channel.
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

- **Cold start (trials cache empty)** — handled reactively (see Mechanism #1):
  bind entries-only, then rebind with classes when the `['trials']` invalidation
  refetches a now-populated cache. Regression-tested.
- **`getTrialsByShow` throws** — React Query owns the async; an error leaves
  `data` undefined → entries-only, and the next sync invalidation refetches
  (self-healing). No manual try/catch needed; the host subtree never crashes.
- **StrictMode double-mount / navigation** — React Query owns the async read, so
  no manual `cancelled` guard is needed; the effect's channel setup is now
  synchronous (created from already-fetched `trialIdKey`). Cleanup removes the
  channel and clears any pending debounce timer.
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

### Phase 2.1 — the ambient freshness indicator (shipped, NOT a toast)

Phase 2 shipped live-sync silent on purpose. Phase 2.1 adds the *visible*
confirmation — but as an **ambient indicator, deliberately not a toast.**

`LiveUpdateIndicator` (`features/show-live-sync/LiveUpdateIndicator.tsx`) sits
beside the presence stack at the two in-show seams (`ShowWorkbenchPage`,
`ShowDetailsPage`). It shows "Updated just now" → "Updated N minutes ago".

**Honest freshness (Codex #591 P2).** The `replication:sync-requested` nudge is
only a *pre-sync* signal — `triggerSync` can skip (offline / unauthenticated /
already syncing) or fail mid-download — so the nudge alone is **not** proof the
cache refreshed. The badge therefore treats the nudge as "a change was detected"
(arms `pending`) and confirms "Updated" only when a sync has actually
**completed**: the provider advances `status.lastSyncAt` on success only, never
on skip/failure. A pure 60s poll advances `lastSyncAt` too, but with no pending
nudge it is ignored, so the badge stays scoped to *this show's* live activity.
Read via a non-throwing `useContext(ReplicationSyncContext)` so the widget
degrades to nothing (never crashes) outside the provider; confirmation uses the
adjust-state-during-render pattern (not an effect) to satisfy the
`set-state-in-effect` / `refs` lint rules.

Design constraints (from `docs/INTENT.md` §3 "Calm Over Clever" / "No
notification overload"; §4 litmus — nothing reads as broken on show day):

- **Not a toast.** A toast per change on a busy 500-entry show is anti-lovable
  noise. This is a quiet, glanceable badge that never interrupts.
- **Positive-only.** No offline / error / "syncing…" states — those live in the
  global sync dashboard (`components/sync/*`), not on the show-day surface.
- **Never claims live without proof.** Renders nothing until a real update
  arrives, so an idle show shows nothing.
- **Natural a11y throttle.** Relative-time bucketing keeps the string at "just
  now" through a burst, so the `role="status"` region doesn't spam screen
  readers. No bespoke debounce needed.
- Gated by the `showLiveSync` kill switch; an `// INTENT:` comment guards it
  against being "upgraded" into a spinner/status badge.

Reuses `formatRelativeTime` (`utils/format.ts`) — no new time helper. 8 unit
tests (nothing-before-activity, **nudge-alone-does-not-claim-fresh**,
shows-only-after-sync-completes, **ignores-poll-with-no-pending-change**, decays,
inert-when-off, ARIA region, listener cleanup).

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

Unit (`useShowLiveSync.test.tsx`, 11 tests), mock `@/supabaseClient` (fake
channel capturing `.on` bindings + the `.subscribe` callback), `@/config/features`
(toggle the flag), and `replicatedTrialsTable`; render under a `QueryClient`
(real timers + `waitFor`, since trial IDs now resolve through React Query):

1. **Off by default** — flag dark, no env override ⇒ **no channel**
   (`supabase.channel` not called).
2. **No showId** ⇒ no channel.
3. **Subscribes to entries + per-trial classes** — `getTrialsByShow` →
   `[{id:'t1'},{id:'t2'}]`: asserts the entries binding `filter: 'show_id=eq.s1'`
   **and** one classes binding per trial (`'trial_id=eq.t1'`, `'trial_id=eq.t2'`),
   exact filter strings (assertion-first on the value-sensitive bit).
4. **No classes binding when the show has no trials** — `[]` ⇒ entries-only.
5. **Cold-start rebind (regression for Codex P2)** — start with trials `[]`
   (entries-only), then set trials `['t1']` and `invalidateQueries(['trials'])`
   (what `triggerSync` does): asserts the classes binding appears **and** the old
   channel is `removeChannel`'d — proving the `['trials']` invalidation rebinds.
6. **Debounced single nudge** — N callbacks within the window ⇒ **exactly one**
   `replication:sync-requested`.
7. **Reconnect catch-up** — second `SUBSCRIBED` fires one nudge; first does not.
8. **Cleanup** — unmount calls `supabase.removeChannel` and clears the pending
   debounce timer (no nudge after unmount).
9. **No payload trust** — the nudge is a bare `Event` with no `detail` (the
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
