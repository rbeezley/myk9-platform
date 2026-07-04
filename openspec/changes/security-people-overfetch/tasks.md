## 1. Map userStore consumers

- [ ] 1.1 Grep for reads of `useUserStore`/the users slice populated by
      `loadUsers()`
- [ ] 1.2 Classify each consumer: admin/secretary surface needing a people
      directory vs. exhibitor-reachable (expected: none for the latter)
- [ ] 1.3 Record which fields/joins (`user_roles`, `judge_qualifications`) each
      classified consumer actually renders
- [ ] 1.4 Resolve the Open Question explicitly: if 1.2 finds any
      **exhibitor-reachable** consumer of the `loadUsers()`-populated store
      (check these first — they touch the users slice and may be exhibitor-facing:
      `useResolvePerson`, `useResolvePersonName`, `LazyDogCard`, `DogDetailPage`,
      `HandlerSelectionDialog`), do NOT simply gate it out. Repoint that consumer
      at the already-scoped targeted lookup (`reads.ts:190-193`
      `select('id, first_name, last_name')`) or an equivalent per-id fetch, so
      exhibitor name-resolution keeps working WITHOUT the bulk `select('*')`
      directory load. Record the disposition of each such consumer. If 1.2 finds
      none, state that finding explicitly (it closes design.md's Open Question).

## 2. Fetch gating

- [ ] 2.1 Write failing test: render the app initializer as an exhibitor role
      (custom render from `src/test/utils/testUtils.tsx`); assert
      `loadUsers`/the `people` query has zero calls (red against current
      unconditional fetch)
- [ ] 2.2 Move `loadUsers()` out of the unconditional `UserDataInitializer` in
      `App.tsx` to lazy-load behind each classified admin/secretary consumer
- [ ] 2.3 Write and pass the admin-path test: as an admin role, the fetch is
      called
- [ ] 2.4 Write and pass the mixed-role edge test: a user holding BOTH an
      exhibitor role AND a secretary/admin role still triggers the fetch (the gate
      keys on "has admin or secretary role", not "is only an exhibitor")

## 3. Column allowlist

- [ ] 3.1 Write failing test: assert the query builder is called with the
      explicit column list, not `'*'` (red against current `select('*', ...)`)
- [ ] 3.2 Update `apps/myk9show/src/services/database/users/reads.ts:20-25` to
      an explicit column list per the mapping in 1.3, keeping
      `user_roles`/`judge_qualifications` joins only where used
- [ ] 3.3 Run the test from 3.1 green

## 4. Verification and rollout

- [ ] 4.1 `pnpm typecheck` + `pnpm lint` + `cd apps/myk9show && pnpm test` green
- [ ] 4.2 No migration required (client-only change)
- [ ] 4.3 Update `docs/security-audit-2026-07/README.md` status table (SA-008
      row → DONE) and this change's tracking status

## 5. Ship gate (final)

- [ ] 5.1 Open PR (base `main`), pass CI, and run a review pass. Because this is a
      security/data-access change (touches an RLS-adjacent fetch shape), run the
      Codex second opinion per CLAUDE.md before merging.
- [ ] 5.2 Squash-merge from the main repo dir once CI + review are green, then
      archive this change. (Merge is the gate before archive.)
