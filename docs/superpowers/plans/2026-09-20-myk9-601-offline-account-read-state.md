# MYK9-601 Offline Account Read State — Narrowed Implementation Plan

> This plan is the delivery record for MYK9-601. The issue is intentionally
> limited to making the existing account-entry reads reachable on a cold,
> offline boot and keeping My Shows truthful while identity is unresolved.

## Goal

Persist the authenticated exhibitor's confirmed `personId` alongside the
auth-user identity, restore it before the authoritative profile lookup settles,
and keep the existing account-entry reads from turning unresolved identity into
an empty-account claim.

## In scope

- Account-scoped person identity cache and AuthContext lifecycle.
- `useEntriesPersonId()` as the sole identity source for account-entry reads.
- The four existing `getUserEntries` consumers named by MYK9-601:
  - `useHasAnyEntryForShow`
  - `useExhibitorUpcomingShows`
  - `useAccountEnteredShowIds`
  - `useMyEntryBalanceSummary`
- My Shows (`useMyEntriesData`, `entriesIdentityState`, and its existing
  presentation surfaces), including cached rows and unresolved identity.
- Provider-level cold-offline evidence with a persisted session, a paused
  profile lookup, a restored `personId`, and one assertion that all four hooks
  call `getUserEntries` with that durable identifier.
- Unit, focused shuffled, typecheck, formatting, code-quality, OpenSpec, and
  diff verification.

## Explicit non-goals

- No Browse Shows behavior, page-level degraded membership notice, or Browse
  Shows-only tests.
- No ringside gate, chooser, page, or online account-today behavior change.
  The existing ringside hooks remain consumers of the durable resolver, but
  ringside UI behavior is not part of this issue.
- No `show-today` changes.
- No new page, dialog, navigation destination, direct PostgREST entry read, or
  alternate identity authority.
- No global payments, dogs, judge, favorites, anonymous-route, or MYK9-563
  stale-money behavior change. The balance hook is covered only as one of the
  four existing `getUserEntries` consumers and keeps its existing derivation.
- No staging cleanup, migration, edge-function deployment, or production
  write. Cold-offline staging replay remains the post-deployment evidence gate.

## Task 1 — Durable person identity

### Files

- Modify: `apps/myk9show/src/context/AuthContext.tsx`
- Modify: `apps/myk9show/src/context/authContextTypes.ts`
- Create: `apps/myk9show/src/context/personIdentityCache.ts`
- Create: `apps/myk9show/src/context/personIdentityCache.test.ts`
- Create: `apps/myk9show/src/context/usePersonIdentity.ts`
- Modify: `apps/myk9show/src/hooks/useEntriesPersonId.ts`
- Modify: `apps/myk9show/src/hooks/useEntriesPersonId.test.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/index.tsx`
- Test: `apps/myk9show/src/test/auth/AuthContext.rbacLifecycle.test.tsx`

### Contract

Store only `{ userId, personId, cachedAt }`, namespace the value by auth user,
reject malformed/future/expired values, and treat storage failures as
best-effort. A confirmed profile refresh overwrites the cache; a confirmed
missing profile, sign-out, or real account transition clears only the relevant
account's value. Pre-session boot must not clear the next account's cache.

`AuthContext.personId` is the only account-entry identity authority. A cached
ID unlocks replica reads but does not grant roles, permissions, or a resolved
profile claim. `useEntriesPersonId()` returns only `AuthContext.personId` or
`null`; it never consults RBAC or a people-store fallback.

### Tests

- Cache read/write, TTL, malformed/future timestamps, account switch,
  sign-out, and storage failure tests.
- AuthContext provider tests for persisted identity, paused profile lookup,
  confirmed profile overwrite, confirmed missing cleanup, and lifecycle
  isolation.
- Hook tests proving stale role/people IDs stay `null` while identity is
  unresolved or confirmed missing.

## Task 2 — Truthful My Shows read state

### Files

- Create: `apps/myk9show/src/features/account-entry-read/accountEntryReadState.ts`
- Create: `apps/myk9show/src/features/account-entry-read/accountEntryReadState.test.ts`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/index.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/entriesIdentityState.ts`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/EntriesIdentityPendingCard.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts`
- Test: `apps/myk9show/src/pages/MyEntriesPage/modules/entriesIdentityState.test.ts`
- Test: `apps/myk9show/src/pages/MyEntriesPage/modules/EntriesIdentityPendingCard.test.tsx`
- Test: `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.test.ts`
- Test: `apps/myk9show/src/test/pages/MyEntriesPage.test.tsx`

### Contract

Use one pure `AccountEntryReadState` model for identity unresolved, identity
missing, read pending, confirmed, unconfirmed, and error. My Shows must:

1. keep known rows visible while the authoritative profile refresh is
   unresolved;
2. show identity-pending when a cached `personId` exists but the profile
   lookup is unresolved, even if the entry read returned an empty replica
   result; and
3. show confirmed-empty only after both identity and the entry read are
   authoritative.

In particular, cached person + unresolved authoritative profile + confirmed
empty entry read is `identity-pending`, never `confirmed-empty`.

Keep `useMyEntriesData` request identity/generation fencing so a late response
from account A cannot populate account B's rows, balance, source, error, or
loading state.

## Task 3 — Four-hook cold-offline provider evidence

### Files

- Modify: `apps/myk9show/src/test/auth/AuthContext.rbacLifecycle.test.tsx`

Render `AuthProvider` with a persisted authenticated session, set the profile
lookup to a never-resolving request, and set the browser offline. Mount exactly
these four hooks in one provider-backed test:

- `useHasAnyEntryForShow('show-heartland')`
- `useExhibitorUpcomingShows()`
- `useAccountEnteredShowIds()`
- `useMyEntryBalanceSummary()`

The test must assert the provider restores `personId`, leaves its authoritative
identity state unresolved, and calls `getUserEntries` exactly four times with
the cached person ID. It must also retain a no-cache case proving unresolved
identity does not call the entry read or claim an empty account.

## Task 4 — Narrowed verification

Run from `apps/myk9show`:

```bash
pnpm vitest run --sequence.shuffle \
  src/context/personIdentityCache.test.ts \
  src/hooks/useEntriesPersonId.test.tsx \
  src/features/account-entry-read/accountEntryReadState.test.ts \
  src/pages/MyEntriesPage/modules/entriesIdentityState.test.ts \
  src/pages/MyEntriesPage/modules/EntriesIdentityPendingCard.test.tsx \
  src/pages/MyEntriesPage/modules/useMyEntriesData.test.ts \
  src/test/pages/MyEntriesPage.test.tsx \
  src/test/auth/AuthContext.rbacLifecycle.test.tsx
```

Also run the smallest applicable app typecheck, any test typecheck that is
practical, `pnpm qa:code-quality-ratchet`, `pnpm format:check:changed`,
`pnpm exec openspec validate persist-offline-person-identity --type change
--strict --no-interactive`, and `git diff --check`. If a broad suite hangs for
30 seconds without useful output, stop it and report the limitation.

## Task 5 — Delivery evidence

Update `openspec/changes/persist-offline-person-identity/tasks.md` only for work
actually completed. Keep adversarial review, PR/CI, and post-deployment staging
replay explicitly pending until their evidence exists. The controller opens the
PR and owns the review gate; this implementation commit must not push or merge.

## Self-review checklist

- [ ] No branch-only Browse Shows tests or behavior remain.
- [ ] No branch-only ringside/show-today behavior remains.
- [ ] No direct entry read or fallback identity was added.
- [ ] Only the four named `getUserEntries` hooks are asserted by provider-level
      cold-offline coverage.
- [ ] Cached person + unresolved profile + empty read cannot be
      `confirmed-empty`.
- [ ] Staging evidence remains a post-deployment gate and MYK9-601 remains
      In Progress until it is recorded.
