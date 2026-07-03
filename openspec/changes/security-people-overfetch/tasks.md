## 1. Map userStore consumers

- [ ] 1.1 Grep for reads of `useUserStore`/the users slice populated by
      `loadUsers()`
- [ ] 1.2 Classify each consumer: admin/secretary surface needing a people
      directory vs. exhibitor-reachable (expected: none for the latter)
- [ ] 1.3 Record which fields/joins (`user_roles`, `judge_qualifications`) each
      classified consumer actually renders

## 2. Fetch gating

- [ ] 2.1 Write failing test: render the app initializer as an exhibitor role
      (custom render from `src/test/utils/testUtils.tsx`); assert
      `loadUsers`/the `people` query has zero calls (red against current
      unconditional fetch)
- [ ] 2.2 Move `loadUsers()` out of the unconditional `UserDataInitializer` in
      `App.tsx` to lazy-load behind each classified admin/secretary consumer
- [ ] 2.3 Write and pass the admin-path test: as an admin role, the fetch is
      called

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
