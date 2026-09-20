# MYK9-691 Premium Style Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Preview style saves offline-durable, server-authorized, style-only, cache-consistent, and scoped to the originating show.

**Architecture:** A narrow Supabase RPC validates manager authority and Premium entitlement and updates only `shows.style`. Replication queues that RPC as a delta without fabricating a cold row, while a Premium feature command returns a merged page view and patches every existing show-shaped React Query cache.

**Tech Stack:** TypeScript, React, TanStack Query, Zustand-backed replication, Vitest, Supabase/PostgreSQL, pgTAP-style SQL behavioral scripts, OpenSpec.

**Spec:** `docs/superpowers/specs/2026-09-20-myk9-691-premium-style-persistence-design.md`

## Global Constraints

- Work only in `.worktrees/codex-myk9-691` on `codex/myk9-691-premium-style-preview`.
- Follow strict TDD: write each behavioral assertion first, run it red for the intended reason, then implement the minimum green change.
- Do not seed a cold replica from the app-level `Show` model and do not queue a full-row mutation for a style save.
- The queued mutation data is exactly `{ id: showId, style }`; the RPC arguments are exactly `{ p_show_id: showId, p_style: style }`.
- `monogram` is available without Premium; the other seven canonical styles require `has_effective_premium_access(public.get_my_person_id(), now())` at the server boundary.
- Save changes the draft `shows.style`; it never changes `experience_published_style` or `experience_published_content`.
- Patch only existing cache entries by show ID. Never insert the show into an absent or filtered cache.
- Preserve the existing Preview UI and shared `PremiumStyleSelector`; do not create another editor or page.
- Do not run `supabase db push` from this branch. A post-merge push requires explicit approval.
- Batch local corrections before the single PR push to conserve Vercel preview quota.

---

### Task 1: Define the server-authorized style command

**Files:**

- Create: `supabase/migrations/20260920130937_myk9_691_update_show_style.sql`
- Create: `supabase/tests/myk9_691_update_show_style_test.sql`
- Modify: `openspec/changes/myk9-691-premium-style-preview/design.md`
- Modify: `openspec/changes/myk9-691-premium-style-preview/specs/premium-show-presentation/spec.md`
- Modify: `openspec/changes/myk9-691-premium-style-preview/tasks.md`

**Interfaces:**

- Produces: `public.update_show_style(p_show_id uuid, p_style text) returns integer`.
- Produces: authenticated-only EXECUTE permission; no `PUBLIC` or `anon` execution.
- Produces: SQLSTATE `22023` for invalid style/not-found input and `42501` for authorization or Premium denial.
- Consumes: `public.is_site_admin()`, `public.is_trial_secretary(uuid)`, `public.is_club_admin(uuid)`, `public.get_my_person_id()`, and `public.has_effective_premium_access(uuid, timestamptz)`.

- [ ] **Step 1: Revalidate the migration version before creating it**

Run from the worktree:

```bash
git fetch origin main
git ls-tree -r --name-only origin/main -- supabase/migrations | tail -20
supabase migration list
pnpm qa:inflight --verbose supabase/migrations
```

Expected: `20260920130937` is absent from `origin/main`, the linked database, and every open PR. If it is occupied, choose the next unused odd UTC second, update this plan's filename references, and record that ruling in the SDD ledger before writing SQL.

- [ ] **Step 2: Write the failing SQL behavioral test**

Create fixtures in a transaction for two clubs, a manager for club A, a non-manager, one free account, one Premium account, and a show whose non-style fields have distinctive values. Exercise the real RPC and assert these literal outcomes:

```sql
-- club-A manager, free account
select public.update_show_style(v_show_id, 'monogram'); -- succeeds
select public.update_show_style(v_show_id, 'heritage'); -- SQLSTATE 42501

-- club-A manager, active Premium account
select public.update_show_style(v_show_id, 'heritage'); -- succeeds

-- after success
select style, status, accept_check_payments, accept_cash_payments,
       allow_non_owner_handlers, version
from public.shows where id = v_show_id;
-- style changed; all unrelated literals stayed identical; version increased by one

-- manager of another club / ordinary authenticated user
select public.update_show_style(v_show_id, 'monogram'); -- SQLSTATE 42501

-- invalid style
select public.update_show_style(v_show_id, 'not-a-style'); -- SQLSTATE 22023
```

Also assert `has_function_privilege('anon', ..., 'EXECUTE') = false`, `PUBLIC = false`, and `authenticated = true`. Follow the existing `supabase/tests/*_test.sql` authentication-fixture pattern and always `ROLLBACK`.

- [ ] **Step 3: Run the SQL test to verify RED**

Run using the repository's existing SQL-test command documented by adjacent tests. If the local Mac has no container runtime, record `NOT RUN — local SQL runtime unavailable` and verify RED through a schema call that fails with function-not-found; do not claim the behavioral script ran.

Expected: failure because `public.update_show_style(uuid,text)` does not exist.

- [ ] **Step 4: Implement the minimal RPC migration**

Implement this contract, using fully qualified objects and `SET search_path = ''`:

```sql
create or replace function public.update_show_style(
  p_show_id uuid,
  p_style text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_version integer;
begin
  if p_style is null or p_style not in (
    'monogram', 'banner', 'headline', 'magazine',
    'poster', 'gazette', 'fieldGuide', 'heritage'
  ) then
    raise exception 'Invalid show style' using errcode = '22023';
  end if;

  select s.club_id into v_club_id
  from public.shows s
  where s.id = p_show_id
    and s.deleted_at is null
  for update;

  if not found then
    raise exception 'Show not found' using errcode = '22023';
  end if;

  if not (
    public.is_site_admin()
    or (
      v_club_id is not null
      and (
        public.is_trial_secretary(v_club_id)
        or public.is_club_admin(v_club_id)
      )
    )
  ) then
    raise exception 'Not authorized to update this show style' using errcode = '42501';
  end if;

  if p_style <> 'monogram'
     and not public.has_effective_premium_access(public.get_my_person_id(), now()) then
    raise exception 'Premium access is required for this show style' using errcode = '42501';
  end if;

  update public.shows
  set style = p_style
  where id = p_show_id
  returning version into v_version;

  return v_version;
end;
$$;

revoke all on function public.update_show_style(uuid, text) from public, anon;
grant execute on function public.update_show_style(uuid, text) to authenticated;
```

Add a function comment explaining the draft-only, style-only, entitlement-authorized contract.

- [ ] **Step 5: Run the SQL test and migration guard**

Run the SQL behavioral test when a runtime is available, then:

```bash
source supabase/.env
GITHUB_BASE_REF=main \
GITHUB_HEAD_REF="$(git branch --show-current)" \
MYK9_MIGRATION_DATABASE_URL=postgresql://postgres.sojmvhhwsjxmfistvzbe@aws-1-us-east-2.pooler.supabase.com:5432/postgres \
PGPASSWORD="$SUPABASE_DB_PASSWORD" \
  pnpm qa:migrations:guard
pnpm openspec validate myk9-691-premium-style-preview --strict
```

Expected: guard and OpenSpec validation pass; SQL behavior passes or is accurately recorded as unavailable.

- [ ] **Step 6: Update OpenSpec to encode the reset**

Update the design/spec/tasks so they explicitly require the RPC authorization, style-only offline mutation, cold-row non-fabrication, complete cache patching, draft-versus-published behavior, and show-scoped async state. Replace the completed persistence checkbox with unchecked implementation/testing items until those checks pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add supabase/migrations/20260920130937_myk9_691_update_show_style.sql \
  supabase/tests/myk9_691_update_show_style_test.sql \
  openspec/changes/myk9-691-premium-style-preview
git commit -m "feat(premium): authorize show style updates"
```

---

### Task 2: Queue a true style-only offline mutation

**Files:**

- Modify: `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts`
- Modify: `apps/myk9show/src/services/replication/__tests__/ReplicatedShowsTable.test.ts`
- Modify: `apps/myk9show/src/store/showStore.ts`

**Interfaces:**

- Consumes: `public.update_show_style(uuid,text)` from Task 1.
- Produces: `ReplicatedShowsTable.updateShowStyle(showId: string, style: string): Promise<string | null>`.
- Restores: `ReplicatedShowsTable.updateShow(showId, updates)` and `showStore.updateShow(id, updates)` to their pre-correction signatures.

- [ ] **Step 1: Write the assertion-first replication tests**

Add tests whose first assertions require:

```typescript
expect(queueMutation).toHaveBeenCalledWith(
  'UPDATE',
  'show-1',
  { id: 'show-1', style: 'heritage' },
  undefined,
  {
    name: 'update_show_style',
    args: { p_show_id: 'show-1', p_style: 'heritage' },
  },
  true
);
```

Cover separately:

- a warm row changes only `style`, `_lastModified`, and `_syncStatus` locally;
- a cold table queues successfully and `get('show-1')` remains `null`;
- `requestUpload()` occurs after the warm local patch;
- a queue rejection leaves the warm row unchanged and does not request upload.

- [ ] **Step 2: Run the targeted test to verify RED**

```bash
cd apps/myk9show
pnpm vitest run src/services/replication/__tests__/ReplicatedShowsTable.test.ts
```

Expected: failure because `updateShowStyle` is missing.

- [ ] **Step 3: Implement `updateShowStyle` minimally**

Read the optional current row, queue the exact RPC mutation with `deferUpload = true`, patch the row only when present, and call `requestUpload()` after the local write. Do not call `toSupabaseRow`, `rebuildUpdatePayload`, or accept a `knownShow` fallback.

Use `try/finally` only after the mutation was successfully queued so a queued mutation is never stranded if the optional local cache write fails. If queuing fails, propagate the error without changing the local row.

- [ ] **Step 4: Remove the rejected cold-row reconstruction**

Restore the generic `updateShow` signatures in `ReplicatedShowsTable.ts` and `showStore.ts`. Delete `showToReplicated`, its parsing helper, and the `knownShow` argument. Do not otherwise refactor the legacy generic show-update path.

- [ ] **Step 5: Run focused tests green**

```bash
cd apps/myk9show
pnpm vitest run src/services/replication/__tests__/ReplicatedShowsTable.test.ts \
  src/test/store/showStore.test.tsx \
  src/store/__tests__/showStore.replicatedToShow.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/myk9show/src/services/replication/ReplicatedShowsTable.ts \
  apps/myk9show/src/services/replication/__tests__/ReplicatedShowsTable.test.ts \
  apps/myk9show/src/store/showStore.ts
git commit -m "fix(premium): queue style-only show mutations"
```

---

### Task 3: Synchronize the current page and every show cache

**Files:**

- Create: `apps/myk9show/src/features/premium/showStylePersistence.ts`
- Create: `apps/myk9show/src/features/premium/showStylePersistence.test.ts`
- Modify: `apps/myk9show/src/hooks/queries/useShowsDatabase.ts`
- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
- Modify: `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`

**Interfaces:**

- Consumes: `replicatedShowsTable.updateShowStyle(showId, style)` from Task 2.
- Produces: `saveShowDraftStyle(input: { show: Show; style: ShowStyle; queryClient: QueryClient }): Promise<Show>`.
- Produces: a cache patch that changes only `style`, `_syncStatus: 'pending'`, and `_lastModified` on matching existing entries.

- [ ] **Step 1: Write failing feature-command tests**

Seed a real `QueryClient` with literal values for:

```typescript
showQueryKeys.detail('show-1');
showQueryKeys.lists();
showQueryKeys.list({ status: 'upcoming' });
showQueryKeys.search('bluegrass');
showQueryKeys.byClub('club-1');
showQueryKeys.byStatus('upcoming');
showQueryKeys.upcoming();
showQueryKeys.byDateRange('2026-01-01', '2026-12-31');
showQueryKeys.withEntryCounts();
showQueryKeys.deleted();
showQueryKeys.statistics();
```

Assert that an existing `show-1` entry in every show-shaped cache receives `style: 'heritage'`, that other shows are unchanged, statistics are byte-for-byte unchanged, an unseeded key remains `undefined`, and the returned show preserves literal unrelated fields such as `status: 'upcoming'`, `acceptCheckPayments: true`, and `allowNonOwnerHandlers: false`.

In a separate failure test, reject `updateShowStyle` and assert every cache retains its original value.

- [ ] **Step 2: Run the feature-command test to verify RED**

```bash
cd apps/myk9show
pnpm vitest run src/features/premium/showStylePersistence.test.ts
```

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the feature command**

Call `updateShowStyle` first. On success, create one timestamp and the partial patch:

```typescript
const patch = {
  style,
  _syncStatus: 'pending' as const,
  _lastModified: now,
};
```

Patch the exact detail key only if it exists. Use `queryClient.setQueriesData` with a predicate for the collection key segments `list`, `search`, `club`, `status`, `upcoming`, `dateRange`, `withEntryCounts`, and `deleted`; map only existing arrays and matching IDs. Return `{ ...show, ...patch }`. Do not invalidate immediately, because an online refetch can replace the optimistic style before the queued RPC uploads.

- [ ] **Step 4: Restore the generic query mutation helper**

Remove the branch's `syncShowQueryCaches` extraction from `useShowsDatabase.ts` and restore `useUpdateShowMutation.onSuccess` to its original generic behavior. The style command owns its broader style-specific cache patch, keeping `useShowsDatabase.ts` below its existing quality-ratchet boundary.

- [ ] **Step 5: Connect Preview to the command**

In `ShowDetailsPage.tsx`, remove the `showStore.updateShow` dependency. Call `saveShowDraftStyle({ show: actualCurrentShow, style, queryClient })` from `onSaveDraftStyle`. Add `key={actualCurrentShow.id}` to `ShowPublicLanding` so component-local async state is entity-scoped.

Update the page test mocks to assert the real user-visible result and cache values rather than asserting that a fabricated full-row store method was called.

- [ ] **Step 6: Add the in-flight navigation regression**

Render a keyed Preview for show A, begin a deferred save, switch the wrapper to show B, resolve A's save, and assert B still shows its own current style with no pending or error state from A.

- [ ] **Step 7: Run focused tests green**

```bash
cd apps/myk9show
pnpm vitest run src/features/premium/showStylePersistence.test.ts \
  src/components/shows/ShowDetails/__tests__/ShowPublicLanding.stylePreview.test.tsx \
  src/test/pages/ShowDetailsPage.test.tsx
```

Expected: all pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/myk9show/src/features/premium/showStylePersistence.ts \
  apps/myk9show/src/features/premium/showStylePersistence.test.ts \
  apps/myk9show/src/hooks/queries/useShowsDatabase.ts \
  apps/myk9show/src/pages/ShowDetailsPage.tsx \
  apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx \
  apps/myk9show/src/components/shows/ShowDetails/__tests__/ShowPublicLanding.stylePreview.test.tsx
git commit -m "fix(premium): keep preview style caches consistent"
```

---

### Task 4: Verify the complete MYK9-691 correction and prepare PR #2377

**Files:**

- Modify: `openspec/changes/myk9-691-premium-style-preview/tasks.md`
- Include: all files changed by Tasks 1-3.

**Interfaces:**

- Consumes: the RPC, replication delta, feature command, and Preview behavior from Tasks 1-3.
- Produces: a locally verified, adversarially reviewed, single batched PR update ready for push.

- [ ] **Step 1: Run the focused suite shuffled**

```bash
cd apps/myk9show
pnpm vitest run --sequence.shuffle \
  src/services/replication/__tests__/ReplicatedShowsTable.test.ts \
  src/features/premium/showStylePersistence.test.ts \
  src/components/shows/ShowDetails/__tests__/ShowPublicLanding.stylePreview.test.tsx \
  src/test/pages/ShowDetailsPage.test.tsx \
  src/test/store/showStore.test.tsx \
  src/store/__tests__/showStore.replicatedToShow.test.ts
```

Expected: all pass with no unhandled errors or warnings.

- [ ] **Step 2: Run static and repository gates**

```bash
pnpm qa:dist-fresh
pnpm typecheck
pnpm lint
pnpm format:check:changed
pnpm qa:code-quality-ratchet
pnpm openspec validate myk9-691-premium-style-preview --strict
git diff --check
pnpm qa:review-tier --base origin/main
```

Expected: all pass; review tier remains `adversarial` or is handled at the printed higher floor.

- [ ] **Step 3: Mark the OpenSpec implementation tasks complete**

Check only the boxes whose implementation and verification evidence now exists. Leave PR/CI/merge delivery unchecked until those external steps actually complete.

- [ ] **Step 4: Run three fresh adversarial Luna review lenses**

Dispatch separate same-harness reviewers against the exact local head:

1. persistence/RPC authorization and migration lens;
2. offline replication/concurrency/cache-consistency lens;
3. UX/state/navigation and acceptance-criteria lens.

Each reviewer must look for defects, not approval. Address every load-bearing finding through the SDD fix loop and rerun the affected focused tests. Stop and restructure if the repository convergence rule triggers again.

- [ ] **Step 5: Commit final task evidence**

```bash
git add openspec/changes/myk9-691-premium-style-preview/tasks.md \
  docs/superpowers/specs/2026-09-20-myk9-691-premium-style-persistence-design.md \
  docs/superpowers/plans/2026-09-20-myk9-691-premium-style-persistence.md
git commit -m "docs(premium): record style persistence verification"
```

- [ ] **Step 6: Update Linear before the external push**

Comment on MYK9-691 with the final local commits, tests, review results, migration/deployment risk, and acceptance-criteria status. Keep the issue In Review.

- [ ] **Step 7: Push once and update PR #2377**

Push the batched local commits to `origin/codex/myk9-691-premium-style-preview`. Update the PR description with the RPC migration, offline delta semantics, draft/published behavior, tests, adversarial reviewer involvement, and the explicit post-merge database-push requirement.

- [ ] **Step 8: Verify required checks**

```bash
bash scripts/qa/watch-pr-checks.sh 2377
```

Expected: every required check is green. Treat only a documented Vercel Hobby `build-rate-limit` context as non-blocking.

- [ ] **Step 9: Stop before merge**

Report the exact PR head, check state, adversarial verdict, and post-merge migration requirement. Merging remains a separate authorized action; applying the migration requires explicit approval after merge.
