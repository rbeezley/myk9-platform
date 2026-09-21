# Hermetic E2E fixtures for the PR-smoke UI specs

> **Status:** Active

## Problem

Three PR-smoke specs assert on UI that only renders when the shared staging
project holds seeded demo data. When that data moves, all three collapse at
once and every open PR becomes unmergeable, because `E2E PR Smoke` is a
required check.

This is not hypothetical. On 2026-09-20 the demo dataset was emptied between
16:10Z and 17:29Z. The same specs passed on `main` at 16:10Z (42 passed,
2.4m) and collapsed identically on every PR run afterwards — including PR
\#2376 and PR \#2381, two unrelated branches. Nine PRs were blocked on a
failure none of them caused, and \#2376 had to be merged on an admin bypass.

The specs already know this is their weak point. Their own failure messages
say so:

    MISSING SEED DATA, not a dialog regression: no show card on
    /exhibitor/entries. This spec needs an entry row to obtain an open Dialog;
    reseed the demo exhibitor or repoint this case at another Dialog trigger.

The coupling gets worse, not better, as clubs start putting real data into the
same project: a fixture the specs depend on is one secretary's cleanup away
from disappearing.

## Evidence the failure is data, not identity

Probed on 2026-09-21 by signing in as the demo exhibitor through the app's own
auth path (anon key + `E2E_DEMO_EXHIBITOR_*`, the same credentials the suite
uses) and counting what the client can see:

| probe             | result                   |
| ----------------- | ------------------------ |
| sign-in           | OK — `auth.uid` resolves |
| own `people` row  | present                  |
| `people` visible  | 1                        |
| `dogs` visible    | 0                        |
| `entries` visible | 0                        |
| `shows` visible   | 0                        |

Auth, RLS and the identity chain are intact. There is simply nothing to
render. Any fix that re-points the specs at different live data has the same
failure mode as today; the dependency itself is what has to go.

## Decision: keep a canary

Agreed with the owner 2026-09-21. Mocking all three specs would leave nothing
in PR smoke that exercises the real PostgREST query path against the real
schema, so a renamed column would ship green (LESSONS `source-text-tests`: a
test that no longer touches the thing it names certifies a no-op).

So: mock the three UI-assertion specs, and keep **one** live-data canary whose
whole job is to prove the exhibitor read path still works end to end against
the real database. The canary is allowed to fail when staging data moves —
that is what it is for — but it must fail _alone_ and say so, rather than
taking nine PRs down with it.

## The seam

`/exhibitor/entries` is offline-first. `MyEntriesPage` composes
`useMyEntriesData`, `useReplicationSync`, `useDogsByOwnerQuery`,
`useMyWaitlistEntries`, `useSelfCheckinMap`, `useExhibitorProfile` and
`useCurrentUserPersonId`. Rows reach the UI from IndexedDB, which replication
populates by syncing over PostgREST — so the network is still the origin of
every row, but it is one layer removed from the assertion.

Two candidate seams:

1. **Intercept PostgREST reads** (`page.route` on the REST endpoints) and
   serve fixture payloads, letting replication populate IndexedDB from them.
   This is the pattern `src/test/e2e/helpers/sharedStagingWriteGuard.ts`
   already uses for writes, so it is established in this codebase rather than
   novel. Risk: the fixture has to be relationally consistent across
   `entries` → `dogs` → `classes` → `shows`, and
   `areReplicationTablesPendingFirstSync` means a payload the sync layer
   rejects renders as a "pending first sync" empty state — which looks exactly
   like the bug we are removing.
2. **Seed IndexedDB directly** before navigation, bypassing sync. Fewer moving
   parts per spec, but it encodes the replication layer's private storage
   shape into the test suite, so an internal refactor breaks every spec at
   once and the specs stop proving the sync path composes at all.

**Recommendation: seam 1.** It keeps the app's real data path in the picture
and reuses an existing helper's technique. Seam 2 is the fallback if the sync
layer turns out to reject synthesized payloads for reasons the fixture cannot
satisfy.

This choice must be settled empirically in Phase 1, not by reading code — the
question "does replication accept a synthesized PostgREST payload" is not
answerable from the source with confidence.

## Phases

### Phase 1 — prove the seam (spike)

**This phase does not need a reseed.** That is the point of the approach: once
the reads are intercepted, the database's contents stop mattering, so the
empty staging database is a valid — in fact ideal — environment to develop
against. Sign-in still reaches real Supabase auth, which the probe above
confirms works.

- Author the smallest fixture that makes one show card render, typed (see
  below), and drive `my-entries-page-ui`'s first case against it locally.
- **Exit criterion:** one previously-failing assertion passes with the network
  intercepted and the database still empty. If seam 1 cannot clear this,
  switch to seam 2 and record why here before continuing.

#### Phase 1 findings (2026-09-21, spike in `exhibitorReadPathCapture.spec.ts`)

**The captured read path.** A signed-in exhibitor on `/exhibitor/entries`
issues one auth POST, four RBAC RPCs (`get_effective_permissions`,
`get_own_entitlement_context`, `get_user_permissions`, `get_user_roles`) and
reads across `armbands`, `classes`, `clubs`, `dogs`, `exhibitor_profiles`,
`judge_assignments`, `people`, `shows`, `trials`, `waitlist_entries`. The
replication sync shape is
`?select=*&updated_at=gt.1970-01-01T00:00:00.000Z&order=updated_at.asc`, plus
`HEAD …?select=id` count probes.

**There is no `entries` table read at all.** My Entries reads the view
`view_authenticated_entry_results`, filtered `is_own_entry=true` and paged
(`userEntriesRead.ts:72`). Any fixture that intercepts `entries` intercepts
nothing.

**Synthesized rows DO survive replication — seam 1 is viable.** Serving one
fabricated `dogs` row caused the app to issue a `dog_registrations` read that
does not otherwise occur. Replication accepted the row and drove dependent
behaviour from it. This was the main open risk in the seam analysis and it is
now retired.

**The remaining gate is sync status, not row data.** `MyEntriesPage`
(`index.tsx:157`) computes

    isInitialEntriesSyncing =
      entries.length === 0 &&
      areReplicationTablesPendingFirstSync(syncStatus, ['entries','dogs','classes','shows'])

and `areReplicationTablesPendingFirstSync` treats a table as pending while its
`tablesStatus` is `'idle'` or `'syncing'`. With the network intercepted the
`entries` replication table never leaves `'idle'`, because per-show entry sync
is scoped by the user's association with a show and nothing on this page
triggers it. So the page stays in its pending/zero state and never reads the
view, no matter how good the row fixtures are.

**Consequence for the design:** a pure network fixture is not sufficient for
this page. The fixture has to additionally satisfy the sync-status machinery —
either by driving `tablesStatus` directly, or by intercepting
`view_authenticated_entry_results` _and_ making the four gate tables report a
settled first sync. This is a hybrid of seams 1 and 2, and it should be
written as one helper so no spec has to know about it.

Note the silver lining: `'error'` is deliberately NOT pending. A table whose
sync failed is a settled answer. That may be a cheaper lever than faking
success, and it is worth trying first in Phase 2.

#### Type the fixture against the generated schema

`packages/supabase/src/types/database.types.ts` is generated from the live
database and re-exported as `Tables<'entries'>`, `Tables<'dogs'>` and so on.
Declaring every fixture row with those types means a renamed or dropped column
fails `pnpm typecheck` instead of silently producing a payload the app cannot
read.

This meaningfully narrows the canary's job. The canary still has to catch what
types cannot see — an RPC that moved, an RLS policy that now denies, a
PostgREST embed that lost its grant — but it no longer has to be the only
thing standing between a schema change and a green-but-broken suite.

### Phase 2 — fixture module

- Extract the Phase 1 payloads into a shared fixture helper beside
  `sharedStagingWriteGuard.ts`, with one relationally consistent dataset:
  an exhibitor, dogs, a published show with trials and classes, and entries
  spanning the statuses the specs assert on (paid, pending, upcoming,
  completed).
- The helper owns the route matching so specs declare intent
  (`useEntriesFixture(page)`), not URL patterns.

### Phase 3 — convert the three specs

- `my-entries-page-ui.spec.ts` — the largest consumer; stat cards, filter
  axes, status labels, mobile reflow.
- `dialogContainsLongContent.spec.ts` — case 1 only. Case 2 (`Clear Cache` on
  `/account?section=data`) documents itself as having no data dependency, yet
  failed in the same run; establish why before assuming the fixture fixes it.
- `header-wordmark-fits.spec.ts` — needs the cart-count response to fire and
  the secretary Actions button to render, so it needs a secretary-side fixture
  as well as the exhibitor one.

### Phase 4 — the canary

- One spec, live data, explicitly named so its failure is self-describing
  (e.g. `exhibitorReadPathCanary.spec.ts`).
- It must assert the real read path end to end and carry a failure message
  that says "staging data moved, this is not a verdict on the diff" — the
  distinction that cost a day on 2026-09-20.

#### Required or advisory — decision

Neither, as a binary. Both options are bad for the same reason each way:

- **Required** rebuilds today's coupling with one spec instead of three. A
  staging wipe blocks every PR again, which is precisely the failure this plan
  exists to remove.
- **Advisory** only works if someone watches it. On a one-person team an
  advisory red is an advisory red forever, and the canary silently stops being
  a canary.

**Decision: required, but it distinguishes absence from breakage.**

The canary's first act is to ask whether the data it needs exists at all:

- **Data absent** → `test.skip()` with a loud annotation naming the condition
  ("staging fixture data is missing; the exhibitor read path was not
  exercised"). The PR is not blocked, because an empty database is not a
  verdict on anyone's diff.
- **Data present but the read path errors** — a 403 from a tightened policy, a
  404 from a moved RPC, a payload that no longer matches the schema → **fail**.
  That is a real regression and it should block.

This is the distinction that cost a day on 2026-09-20: the suite could not
tell "the database is empty" from "the code is broken", so it reported the
first as the second nine times over.

The skip must not become invisible, or we have shipped advisory-by-another-
name. So the "is staging populated?" question moves to where it belongs —
**a nightly check whose only job is to assert the demo fixtures exist**, and
which is allowed to be loud about it. Staging being empty is an operational
condition, not a pull-request condition, and it should page the operator once
a night rather than nine PRs at random.

### Phase 5 — testing

A phase is not complete until its tests pass.

- Run each converted spec against the **empty** staging database. They must
  pass — that is the whole point, and it is testable right now precisely
  because staging is empty.
- Run each converted spec against a **reseeded** database. They must still
  pass, proving the fixture overrides live data rather than racing it.
- Positive control per spec: break the fixture and confirm the spec goes red.
  A mocked spec that passes with an empty fixture is asserting nothing
  (LESSONS `mutation-actually-mutated`).
- Confirm no spec writes to the shared project: assert an empty write ledger
  via `sharedStagingWriteGuard`'s existing mechanism.
- Full shuffled unit run is not required — these are Playwright specs — but
  `pnpm qa:code-quality-ratchet` applies if any existing file grows.

## Explicit non-goals

- **The four service-role specs stay as they are.** `show-live-sync`,
  `uat/shared/secretaryData`, `show/atShowOfflineScoring` and
  `show/secretaryCockpitSharedSync` hold `SUPABASE_SERVICE_ROLE_KEY` and write
  to the live project with RLS bypassed. They are the real hazard once clubs
  have data in there, and they need project isolation, not fixtures. Tracked
  separately.
- **This does not make CI safe to run against real club data.** It removes a
  fragile read dependency. It does not address that PR CI authenticates
  against the same Supabase project that will hold production data — there is
  exactly one project ref in this repo (`sojmvhhwsjxmfistvzbe`), and the code
  calls it `SHARED_STAGING_PROJECT_REF` while it is simultaneously production.
- **No reseed is performed by this work.** Staging still needs one to unblock
  the other nine PRs; that is independent and more urgent.

## Risks

| Risk                                                                   | Mitigation                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Mocked specs go green against a broken app (renamed column, moved RPC) | The Phase 4 canary exists solely for this; it must assert the real path          |
| Fixture drifts from the real schema over time                          | Type every row as `Tables<'…'>` so a column rename fails typecheck, not a CI run |
| Replication rejects synthesized payloads and renders "pending sync"    | Phase 1 exit criterion catches this before any spec is converted                 |
| The conversion hides a real regression the specs would have caught     | Positive controls in Phase 5 — break the fixture, watch each spec go red         |
