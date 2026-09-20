# MYK9-601 Offline Account Read State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a cached exhibitor identity unlock every replica-backed account-entry surface offline without letting unresolved, missing, or unconfirmed reads become false empty-account claims.

**Architecture:** `AuthContext.personId` remains the sole identity authority for account-entry reads; role and people-store fallbacks are deleted from those consumers. A shared pure read-state model separates identity availability from data confirmation, and My Shows, Find Shows, and `/at-show` consume that model consistently. The online-only account-today RPC remains an optional positive accelerator and never blocks the canonical replica-backed entry path.

**Tech Stack:** TypeScript, React, React Query, Vitest, Testing Library, Supabase auth, `@myk9/replication`.

**Spec:** `openspec/changes/persist-offline-person-identity/specs/account-entry-sync/spec.md`

## Global Constraints

- Preserve the current account-scoped person cache and its 24-hour validation, account-switch cleanup, sign-out cleanup, and future-timestamp rejection.
- `AuthContext.personId` is the only person identifier account-entry consumers may use; never infer it from the auth UUID, RBAC, or persisted people rows.
- A cached `personId` permits replica reads but does not grant a role, permission, or resolved-profile claim.
- Known nonempty replica rows may render while the online profile lookup is unresolved; unresolved or unconfirmed empty reads may not render first-run, zero-entry, or “not entered” claims.
- Keep all entry reads on `getUserEntries`; do not add direct PostgREST entry reads.
- The account-today RPC is optional enrichment. A paused or failed RPC must not block `/at-show`, staff/passcode access, or the replica-backed affiliation lookup.
- Preserve `docs/INTENT.md`: offline is normal, cached information remains useful, and degraded states use calm plain-language copy.
- Do not add a new page, dialog, or navigation destination.
- Keep MYK9-563 money suppression and stale-banner behavior out of scope.
- Staging cold-offline evidence remains a post-deployment gate; do not mark MYK9-601 Done when only the PR is complete.

---

### Task 1: Lock Person Identity to One Authority

**Files:**

- Modify: `apps/myk9show/src/context/AuthContext.tsx`
- Modify: `apps/myk9show/src/context/authContextTypes.ts`
- Create: `apps/myk9show/src/context/personIdentityCache.ts`
- Create: `apps/myk9show/src/context/personIdentityCache.test.ts`
- Create: `apps/myk9show/src/context/usePersonIdentity.ts`
- Modify: `apps/myk9show/src/hooks/useEntriesPersonId.ts`
- Modify: `apps/myk9show/src/hooks/useEntriesPersonId.test.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/index.tsx`
- Test: `apps/myk9show/src/test/auth/AuthContext.rbacLifecycle.test.tsx`

**Interfaces:**

- Consumes: `AuthContextType.personId: string | null`, `personIdentityState: 'unresolved' | 'resolved' | 'missing'`, `hasUsablePersonId: boolean`.
- Produces: `useEntriesPersonId(): string | null` as the sole account-entry identity resolver.

- [ ] **Step 1: Add failing stale-fallback coverage**

First add cache tests that prove the pairing is scoped by auth user, expires after 24 hours, rejects future/malformed timestamps, clears only the requested account, and treats storage failures as best-effort. Add `AuthContext` lifecycle coverage that a successful profile read saves the pairing, a confirmed missing profile clears it, and an account transition clears the prior account without clearing the current account during pre-session boot.

Then add a hook test whose AuthContext reports `personId: null` and `personIdentityState: 'missing'` while the old role/people stores contain `person-stale`. Assert:

```ts
expect(result.current).toBeNull();
```

Add the same case for `personIdentityState: 'unresolved'`, and retain the cached-identity case:

```ts
expect(renderIdentity({ personId: 'person-cached', state: 'unresolved' }).current).toBe(
  'person-cached'
);
```

- [ ] **Step 2: Run the identity tests red**

Run:

```bash
cd apps/myk9show
pnpm vitest run src/hooks/useEntriesPersonId.test.tsx src/test/auth/AuthContext.rbacLifecycle.test.tsx
```

Expected: cache/lifecycle coverage is absent and stale role/people fallback assertions fail before the legacy resolver is removed from every My Shows call site.

- [ ] **Step 3: Delete the second identity authority**

Implement `personIdentityCache.ts` as an account-namespaced cache containing only `{ userId, personId, cachedAt }`, with `PERSON_IDENTITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000`. `usePersonIdentity` synchronously restores that pairing, lets a successful authoritative profile overwrite it, and clears it only on confirmed missing identity, sign-out, or a real account transition.

Keep `useEntriesPersonId` intentionally small:

```ts
export function useEntriesPersonId(): string | null {
  const { personId } = useAuthContext();
  return personId ?? null;
}
```

In `MyEntriesPage/index.tsx`, replace `useCurrentUserPersonId()` and `userWithRoles?.databaseUserId` ownership derivation with the same `useEntriesPersonId()` result:

```ts
const ownerId = useEntriesPersonId() ?? '';
```

Pass `ownerId || undefined` to `MyEntriesDialogGroup`. Do not retain a compatibility fallback.

- [ ] **Step 4: Run the focused identity tests green**

Run:

```bash
cd apps/myk9show
pnpm vitest run \
  src/context/personIdentityCache.test.ts \
  src/hooks/useEntriesPersonId.test.tsx \
  src/test/auth/AuthContext.rbacLifecycle.test.tsx
```

Expected: all tests pass; a cached ID works before RBAC, explicit null stays null, and no capability is granted by the cache.

- [ ] **Step 5: Commit the identity boundary**

```bash
git add apps/myk9show/src/context apps/myk9show/src/hooks/useEntriesPersonId.ts apps/myk9show/src/hooks/useEntriesPersonId.test.tsx apps/myk9show/src/pages/MyEntriesPage/index.tsx apps/myk9show/src/test/auth/AuthContext.rbacLifecycle.test.tsx
git commit -m "fix(auth): make person identity authoritative offline"
```

### Task 2: Introduce One Account-Entry Read-State Model

**Files:**

- Create: `apps/myk9show/src/features/account-entry-read/accountEntryReadState.ts`
- Create: `apps/myk9show/src/features/account-entry-read/accountEntryReadState.test.ts`
- Modify: `apps/myk9show/src/hooks/queries/useAccountEnteredShowIds.ts`
- Modify: `apps/myk9show/src/features/at-show/useExhibitorUpcomingShows.ts`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts`

**Interfaces:**

- Consumes: `PersonIdentityState`, nullable `personId`, React Query pending/error flags, and `UserEntriesSource` from `getUserEntries`.
- Produces:

```ts
export type AccountEntryReadState =
  | 'identity-unresolved'
  | 'identity-missing'
  | 'read-pending'
  | 'confirmed'
  | 'unconfirmed'
  | 'error';

export function deriveAccountEntryReadState(input: {
  hasUser: boolean;
  personId: string | null;
  personIdentityState: PersonIdentityState;
  isPending: boolean;
  isError: boolean;
  source?: UserEntriesSource;
}): AccountEntryReadState;

export function canClaimConfirmedEmpty(state: AccountEntryReadState): boolean;
export function canRenderKnownRows(state: AccountEntryReadState, rowCount: number): boolean;
```

- [ ] **Step 1: Write the state-table tests first**

Cover this exact table:

```ts
it.each([
  ['unresolved without cache', null, 'unresolved', false, false, undefined, 'identity-unresolved'],
  ['confirmed missing', null, 'missing', false, false, undefined, 'identity-missing'],
  ['cached identity reading', 'person-1', 'unresolved', true, false, undefined, 'read-pending'],
  ['cached confirmed read', 'person-1', 'unresolved', false, false, 'confirmed', 'confirmed'],
  [
    'cached replica fallback',
    'person-1',
    'unresolved',
    false,
    false,
    'replica-after-error',
    'unconfirmed',
  ],
  ['read failure', 'person-1', 'resolved', false, true, undefined, 'error'],
])('%s', (_name, personId, personIdentityState, isPending, isError, source, expected) => {
  expect(
    deriveAccountEntryReadState({
      hasUser: true,
      personId,
      personIdentityState,
      isPending,
      isError,
      source,
    })
  ).toBe(expected);
});
```

Assert that `canRenderKnownRows('unconfirmed', 2)` is true, while `canClaimConfirmedEmpty('unconfirmed')` is false.

- [ ] **Step 2: Run the state test red**

```bash
cd apps/myk9show
pnpm vitest run src/features/account-entry-read/accountEntryReadState.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure model**

Use order-sensitive derivation: signed-out/unresolved identity first, explicit missing second, usable-ID query error/pending next, and source confirmation last. `replica-after-error` and absent source after a completed query are `unconfirmed`, never `confirmed`.

- [ ] **Step 4: Replace local state unions**

Make `useAccountEnteredShowIds`, `useExhibitorUpcomingShows`, and `useMyEntriesData` return the shared `AccountEntryReadState`. Keep their domain data (`all/active`, `upcomingShows`, `entries`) unchanged. Delete duplicated local read-state ternaries after their tests have moved to the shared type.

- [ ] **Step 5: Run focused hook tests**

```bash
cd apps/myk9show
pnpm vitest run \
  src/features/account-entry-read/accountEntryReadState.test.ts \
  src/hooks/queries/useAccountEnteredShowIds.test.ts \
  src/features/at-show/useRingsideEntryShows.test.tsx \
  src/pages/MyEntriesPage/modules/useMyEntriesData.test.ts
```

Expected: all pass, including cached-ID reads and unconfirmed replica fallback.

- [ ] **Step 6: Commit the shared state model**

```bash
git add apps/myk9show/src/features/account-entry-read apps/myk9show/src/hooks/queries/useAccountEnteredShowIds.ts apps/myk9show/src/features/at-show/useExhibitorUpcomingShows.ts apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts apps/myk9show/src/hooks/queries/useAccountEnteredShowIds.test.ts apps/myk9show/src/features/at-show/useRingsideEntryShows.test.tsx apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.test.ts
git commit -m "refactor(entries): share account read truth state"
```

### Task 3: Render Known My Shows Rows Without Making Empty Claims

**Files:**

- Modify: `apps/myk9show/src/pages/MyEntriesPage/index.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/entriesIdentityState.ts`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/EntriesIdentityPendingCard.tsx`
- Test: `apps/myk9show/src/pages/MyEntriesPage/modules/entriesIdentityState.test.ts`
- Test: `apps/myk9show/src/pages/MyEntriesPage/modules/EntriesIdentityPendingCard.test.tsx`
- Test: `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.test.ts`

**Interfaces:**

- Consumes: shared `AccountEntryReadState`, `entries.length`, and existing `EntriesIdentityPendingCard`.
- Produces: `getMyEntriesPresentation(input): 'known-rows' | 'identity-pending' | 'identity-missing' | 'unconfirmed-empty' | 'confirmed-empty'` as a pure presentation discriminator.

- [ ] **Step 1: Add assertion-first presentation tests**

```ts
expect(
  getMyEntriesPresentation({
    identityState: 'unresolved',
    readState: 'unconfirmed',
    entryCount: 2,
    isLoading: false,
  })
).toBe('known-rows');

expect(
  getMyEntriesPresentation({
    identityState: 'unresolved',
    readState: 'identity-unresolved',
    entryCount: 0,
    isLoading: false,
  })
).toBe('identity-pending');

expect(
  getMyEntriesPresentation({
    identityState: 'resolved',
    readState: 'unconfirmed',
    entryCount: 0,
    isLoading: false,
  })
).toBe('unconfirmed-empty');
```

Add a rendered-page regression proving two cached rows remain visible while the profile refresh is unresolved.

- [ ] **Step 2: Run the My Shows tests red**

```bash
cd apps/myk9show
pnpm vitest run \
  src/pages/MyEntriesPage/modules/entriesIdentityState.test.ts \
  src/pages/MyEntriesPage/modules/EntriesIdentityPendingCard.test.tsx \
  src/pages/MyEntriesPage/modules/useMyEntriesData.test.ts
```

Expected: the cached-row presentation test fails because `identityState !== 'resolved'` currently hides the rows.

- [ ] **Step 3: Implement the presentation discriminator**

Order the page states as follows:

```ts
if (entryCount > 0) return 'known-rows';
if (identityState === 'missing') return 'identity-missing';
if (readState === 'identity-unresolved' || readState === 'read-pending') return 'identity-pending';
if (readState === 'confirmed') return 'confirmed-empty';
return 'unconfirmed-empty';
```

Render the normal entries stack for `known-rows`, even when the profile refresh is unresolved. Reuse the existing calm unconfirmed/error notice for degraded known rows; never replace known rows with the pending card.

- [ ] **Step 4: Run the My Shows tests green**

Run the Step 2 command.

Expected: known cached rows stay visible; missing/unresolved empty states remain distinct; first-run appears only after a confirmed empty read.

- [ ] **Step 5: Commit My Shows truthfulness**

```bash
git add apps/myk9show/src/pages/MyEntriesPage
git commit -m "fix(entries): keep known offline rows visible"
```

### Task 4: Make Find Shows Honest About Unconfirmed Membership

**Files:**

- Modify: `apps/myk9show/src/hooks/useBrowseShowsData.ts`
- Modify: `apps/myk9show/src/pages/BrowseShowsPage.tsx`
- Create: `apps/myk9show/src/hooks/useBrowseShowsData.test.tsx`
- Test: `apps/myk9show/src/test/pages/BrowseShowsPage.test.tsx`

**Interfaces:**

- Consumes: `AccountEntryReadState` from `useAccountEnteredShowIds` and existing known-positive show IDs.
- Produces: `accountEntriesReliable: boolean` and `accountEntriesDegraded: boolean` in `UseBrowseShowsDataReturn`.

- [ ] **Step 1: Add failing unconfirmed-read coverage**

At the hook layer, mock an authenticated user, cached `personId`, and `readState: 'unconfirmed'` with one known entered show. Assert the known positive remains in `entries`, but:

```ts
expect(result.current.accountEntriesReliable).toBe(false);
expect(result.current.accountEntriesDegraded).toBe(true);
expect(result.current.hasError).toBe(false);
expect(result.current.isLoading).toBe(false);
```

At the page layer, assert a quiet notice and Retry action render while the public show list remains usable. Assert the page does not show a zero-entry account claim.

- [ ] **Step 2: Run Browse Shows tests red**

```bash
cd apps/myk9show
pnpm vitest run src/hooks/useBrowseShowsData.test.tsx src/test/pages/BrowseShowsPage.test.tsx
```

Expected: FAIL because `unconfirmed` is currently treated like a healthy read and no degraded notice exists.

- [ ] **Step 3: Implement positive-only degraded behavior**

Set:

```ts
const accountEntriesReliable = accountEnteredShowIds.readState === 'confirmed';
const accountEntriesDegraded =
  accountEnteredShowIds.readState === 'unconfirmed' || accountEnteredShowIds.readState === 'error';
```

Keep known-positive IDs in the merged entries. Do not turn `unconfirmed` into a page-wide error or endless loading state. In `BrowseShowsPage`, render an existing shadcn `Alert` above the list with calm copy such as “Your entered-show markers may be incomplete while this device is offline” and the existing Retry action. Do not add a modal, dialog, or new destination.

- [ ] **Step 4: Run Browse Shows tests green**

Run the Step 2 command.

Expected: public discovery remains usable, known positives render, and unconfirmed absence is never presented as authoritative.

- [ ] **Step 5: Commit Browse Shows degraded-state wiring**

```bash
git add apps/myk9show/src/hooks/useBrowseShowsData.ts apps/myk9show/src/hooks/useBrowseShowsData.test.tsx apps/myk9show/src/pages/BrowseShowsPage.tsx apps/myk9show/src/test/pages/BrowseShowsPage.test.tsx
git commit -m "fix(shows): surface unconfirmed entry membership"
```

### Task 5: Remove the Online-Only Account-Today Query From Ringside Gates

**Files:**

- Modify: `apps/myk9show/src/features/at-show/useRingsideEntryShows.ts`
- Modify: `apps/myk9show/src/features/at-show/AtShowAccessGate.tsx`
- Test: `apps/myk9show/src/features/at-show/useRingsideEntryShows.test.tsx`
- Test: `apps/myk9show/src/features/at-show/AtShowAccessGate.test.tsx`
- Test: `apps/myk9show/src/features/at-show/RingsideEntryPage.test.tsx`

**Interfaces:**

- Consumes: account-today data only as an optional positive signal; canonical affiliation comes from `useExhibitorUpcomingShows`/`useHasAnyEntryForShow`.
- Produces: nonblocking `/at-show` and show-specific access while the account-today React Query is paused offline.

- [ ] **Step 1: Write the paused-query regressions first**

For the bare route, mock:

```ts
banner = { items: [], isLoading: true };
exhibitorUpcomingShows = {
  upcomingShows: [{ showId: 'show-1', showName: 'Saved Show' }],
  isLoading: false,
  readState: 'unconfirmed',
  identityState: 'unresolved',
  hasUsablePersonId: true,
};
```

Assert `useRingsideEntryShows().isLoading` is false and the saved show remains reachable.

For the show-specific gate, mock `accountToday.isLoading = true`, `hasAnyEntryForShow = true`, `hasAnyEntryLoading = false`, cached identity unresolved, and assert the early-entry guidance renders rather than “Checking ringside access…”. Add staff and passcode-grant cases proving they bypass both account lookups.

- [ ] **Step 2: Run ringside tests red**

```bash
cd apps/myk9show
pnpm vitest run \
  src/features/at-show/useRingsideEntryShows.test.tsx \
  src/features/at-show/AtShowAccessGate.test.tsx \
  src/features/at-show/RingsideEntryPage.test.tsx
```

Expected: the bare route and specific gate block on account-today loading.

- [ ] **Step 3: Delete account-today loading from access decisions**

In `useRingsideEntryShows`, remove `banner.isLoading` from the returned `isLoading`; continue merging `banner.items` when present.

In `AtShowAccessGate`, delete the branch:

```ts
if (user && accountToday.isLoading) {
  return <LoadingEmptyState message="Checking ringside access…" />;
}
```

Keep its positive fast path (`hasAccountEntryForShow`) and let the canonical `useHasAnyEntryForShow` state decide loading/error/entry affiliation when the fast path has not answered positively.

- [ ] **Step 4: Run ringside tests green**

Run the Step 2 command.

Expected: cached exhibitors, staff, and passcode users never hang on the online-only RPC; anonymous redirect behavior is unchanged.

- [ ] **Step 5: Commit the nonblocking ringside gates**

```bash
git add apps/myk9show/src/features/at-show
git commit -m "fix(ringside): keep offline identity paths nonblocking"
```

### Task 6: Verify the Structural Batch and Prepare Delivery

**Files:**

- Modify: `openspec/changes/persist-offline-person-identity/tasks.md`
- Review: all files changed from `origin/main`

**Interfaces:**

- Consumes: Tasks 1–5.
- Produces: a reviewable MYK9-601 branch with final-head verification evidence; staging evidence remains explicitly deferred until deployment.

- [ ] **Step 1: Run the focused shuffled suite**

```bash
cd apps/myk9show
pnpm vitest run --sequence.shuffle \
  src/context/personIdentityCache.test.ts \
  src/hooks/useEntriesPersonId.test.tsx \
  src/features/account-entry-read/accountEntryReadState.test.ts \
  src/hooks/queries/useAccountEnteredShowIds.test.ts \
  src/hooks/useBrowseShowsData.test.tsx \
  src/test/pages/BrowseShowsPage.test.tsx \
  src/features/at-show/useRingsideEntryShows.test.tsx \
  src/features/at-show/AtShowAccessGate.test.tsx \
  src/features/at-show/RingsideEntryPage.test.tsx \
  src/pages/MyEntriesPage/modules/useMyEntriesData.test.ts \
  src/pages/MyEntriesPage/modules/entriesIdentityState.test.ts \
  src/test/auth/AuthContext.rbacLifecycle.test.tsx
```

Expected: all pass. Stop and report if the runner produces no useful output for 30 seconds.

- [ ] **Step 2: Run static and repository gates**

```bash
pnpm --dir apps/myk9show typecheck
pnpm --dir apps/myk9show typecheck:tests
pnpm qa:code-quality-ratchet
pnpm format:check:changed
pnpm exec openspec validate persist-offline-person-identity --strict --no-interactive
git diff --check
```

Expected: all pass. Report pre-existing unrelated failures without changing unrelated files.

- [ ] **Step 3: Run two fresh adversarial Luna lenses**

Lens one: offline/auth/data-flow state-machine correctness. Lens two: acceptance/UI truthfulness across My Shows, Find Shows, and `/at-show`. Address findings as one structural batch; if a finding is introduced by the prior fix or repeats on the same path, stop under the convergence rule.

- [ ] **Step 4: Update only completed OpenSpec tasks**

Mark local implementation, verification, and adversarial review complete. Leave staging cold-offline replay and post-deployment evidence unchecked.

- [ ] **Step 5: Commit delivery metadata**

```bash
git add openspec/changes/persist-offline-person-identity/tasks.md docs/superpowers/plans/2026-09-20-myk9-601-offline-account-read-state.md
git commit -m "docs(entries): record offline identity delivery plan"
```

- [ ] **Step 6: Open the PR only after the final-head review gate**

Push `codex/myk9-601`, open a PR linked to MYK9-601, attach it to the task, post the adversarial gate through `scripts/qa/post-review-gate.sh`, update Linear with checks/risks, and run `bash scripts/qa/watch-pr-checks.sh <pr>`. Do not merge without separate authorization and do not mark MYK9-601 Done before the deployed cold-offline replay.

## Self-Review

- Spec coverage: cached identity, account transition cleanup, unresolved-vs-missing, all account-entry consumers, and replica reachability are mapped to Tasks 1–5.
- Review-finding coverage: stale role fallback (Task 1), duplicated state derivations (Task 2), hidden cached rows (Task 3), false Browse Shows absence (Task 4), and online-only ringside blocking (Task 5) each have an assertion-first regression.
- Duplication check: no new page, dialog, or alternate data path is introduced; one shared state model replaces local state unions.
- Placeholder scan: no deferred implementation placeholders remain. The only deferred item is the explicitly post-deployment staging evidence required by the issue.
- Type consistency: every consumer uses `AccountEntryReadState`; `AuthContext.personId` remains `string | null`; no role-derived identity is reintroduced.
