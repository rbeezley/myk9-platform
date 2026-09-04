# ADR-010: Cold-Offline Query Semantics (Errors, Not Pauses)

## Status

Accepted

## Date

2026-09-03

## Context

ADR-004 establishes offline-first data access. A recurring question sits
underneath it: when a device has no connectivity, what state should a React
Query read be in? The answer had never been decided, and the codebase carried
two incompatible beliefs about it at once.

**What TanStack actually does.** `onlineManager` in `@tanstack/query-core` 5.x
initialises `#online = true` unconditionally and only ever changes on a window
`online` / `offline` **event**. It never reads `navigator.onLine`:

```js
// node_modules/@tanstack/query-core/build/modern/onlineManager.js
var OnlineManager = class extends Subscribable {
  #online = true;
  // setup() only adds window online/offline listeners
};
```

A page that **boots** with no connectivity therefore receives no `offline`
event, and TanStack believes it is online. With the client default
`networkMode: 'online'` (`lib/queryClient.ts`), every query fetches, fails, and
lands in `status: 'error'`. It does **not** reach the paused state. The paused
state is only reachable after a connectivity **transition** against a page that
is already open.

Measured on `/exhibitor/entries`, cold boot with the backend unreachable and
`navigator.onLine` forced false:

```
{authLoading:true,  profileLoading:true,  hasUser:true,  profileError:"null"}
{authLoading:false, profileLoading:false, hasUser:true,  profileError:"[object Object]"}
```

**The belief this contradicts.** Several fixes and comments were written from
"the query pauses offline". Two examples, both wrong in the same direction:

- MYK9-347 described the cold-boot mechanism as a paused query. The guard it
  shipped is still correct, but it addresses a state a cold boot does not reach.
- `pages/admin/UserManagementPage.tsx` carried
  `isOfflineColdLoad = isLoading && fetchStatus === 'paused'` with a comment
  asserting "React Query parks the request with isLoading true". That condition
  is **unsatisfiable** — query-core derives `isFetching = fetchStatus ===
'fetching'` and `isLoading = isPending && isFetching` — so the calm offline
  state it gated could never render, and offline admins saw a raw
  `TypeError: Failed to fetch` (MYK9-365, PR #2014).

**The obvious fix, and why it was rejected.** One line at startup —
`onlineManager.setOnline(navigator.onLine)` — would make cold-offline queries
pause and would make the already-configured `refetchOnReconnect: 'always'`
meaningful. It would also move every query in the app from `error` into
`pending`/`paused` while offline.

MYK9-372 is the evidence against that trade. An unbounded pending state is what
this codebase demonstrably mishandles: `areReplicationTablesPendingFirstSync`
treated `'idle'` as "first sync still coming", which offline meant _forever_, and
My Shows plus both at-show entry lists rendered a skeleton with no exit. The
guard had been hand-rolled correctly at two call sites and missed at three, on
show-day surfaces, without anyone noticing. Error states, by contrast, are
handled well here — `EntriesLoadErrorCard` and its siblings are bounded and offer
a retry.

Deliberately converting ~123 `useQuery` call sites from the state this app
handles into the state it mishandles is the wrong direction, and it walks into
the "a paused query renders as a confident zero" family (MYK9-104, MYK9-252,
MYK9-262, MYK9-347) rather than away from it.

## Decision

**Cold-offline reads ERROR. We do not sync `onlineManager` from
`navigator.onLine`.**

1. `networkMode` stays `'online'` and `onlineManager` is left at its default.
   A read attempted with no connectivity fails fast and lands in `error`.
2. Recovery is driven explicitly, not by TanStack's reconnect handling.
   `useRefetchQueriesOnReconnect` (mounted in `QueryProvider`) replays the
   offline→online transition into `onlineManager` once per drop, seeded from
   `navigator.onLine` so a boot that _started_ offline still counts its first
   reconnect. Replaying the transition — rather than calling
   `invalidateQueries()` — is required for correctness: `refetchOnReconnect`
   governs TanStack's own trigger and has no effect on an explicit invalidation,
   so an unfiltered invalidation silently overrides queries that opted out.
   Ringside's entry list is one (`useEntryListData` sets
   `refetchOnReconnect: false` and skips refreshes during a drag).
3. **Both** states must be handled by any surface that reads offline. `paused`
   remains reachable on a connectivity transition against an open page, so a
   guard written for only one of `error` / `paused` is incomplete. Prefer
   pairing them, as `useFastShowDetails` and `useReportDogOptions` already do.
4. An unresolved read is **unknown**, never "none". This is the standing rule
   ADR-004 implies and this decision makes explicit: do not render a confident
   empty state from a read that has not settled.

## Consequences

### Positive

- No unbounded pending states are introduced across the app's query surface,
  which is the failure mode MYK9-372 showed reaching show-day pages unnoticed.
- Offline reads fail fast and visibly, and the app's error affordances already
  offer a retry.
- Reconnect recovery is explicit and testable. Measured on `/exhibitor/entries`:
  full content returned in under 20s after signal returned, against up to 60s
  previously (the replication provider's periodic re-sync was doing it by
  accident).
- Per-query `refetchOnReconnect` opt-outs keep working, so ringside drag
  behaviour is unaffected by reconnect refetching.

### Negative

- Offline reads still perform a doomed network round trip before failing. This
  is accepted: it is bounded, and it is what makes the error state prompt.
- Two states (`error` and `paused`) must be considered instead of one. The
  mitigation is this ADR plus the pairing convention in Decision 3.
- `refetchOnReconnect: 'always'` in `lib/queryClient.ts` remains inert on a cold
  boot by itself; recovery depends on the hook. That indirection is deliberate
  and documented at the hook.

### Neutral

- Replicated reads are unaffected. They do not go through React Query's network
  mode, and their own "failed read vs empty table" problem is MYK9-252.
- If a future change makes pausing preferable, it requires the loading-surface
  audit this ADR declined to skip — every offline-reachable route must render a
  bounded offline affordance rather than a spinner.

## References

- MYK9-365 — the `onlineManager` finding, and the decision recorded here
- MYK9-372 — the unbounded-pending failure that decided the trade
- MYK9-347 — the guard whose stated mechanism this ADR corrects
- PRs #2006, #2012, #2014
