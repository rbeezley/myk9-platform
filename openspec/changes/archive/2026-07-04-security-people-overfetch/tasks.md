## 1. Map userStore consumers

- [x] 1.1 Grep for reads of `useUserStore`/the users slice populated by
      `loadUsers()` — ~45 files touch the store; enumerated self-loaders vs readers.
- [x] 1.2 Classify each consumer: admin/secretary surface needing a people
      directory vs. exhibitor-reachable. Self-loaders (ShowEditForm, UserEditPanel,
      ClubCreationPanel, UserDetailsView, ClubMembersPage, HandlerSelectionDialog)
      are mgmt surfaces. Readers are mgmt-only EXCEPT LazyDogCard (owner name),
      DogDetailPage (admin `?fromPerson=` breadcrumb only), CommandPalette
      (role-gated people search). ShowInfoCard/ShowMainCard are dead code.
- [x] 1.3 Fields/joins each renders — mgmt directory surfaces render
      name/email/phone/address/roles/judge-quals; LazyDogCard renders only owner
      name.
- [x] 1.4 Open Question resolved: the ONE genuinely exhibitor-reachable reader that
      depended on the bulk store is **LazyDogCard** (owner name, via the
      RegistrationWorkflow dog-selection). Repointed to `dog.ownerName` (a scoped
      owner join `people!dogs_owner_id_fkey`, subject to the dog's own RLS) — no
      bulk directory needed. DogDetailPage's `people` read is admin-context
      (breadcrumb) only; CommandPalette gates its people features by role. So no
      other exhibitor surface depends on the login pre-population.

## 2. Fetch gating

- [x] 2.1 Assertion-first gate test: `shouldLoadPeopleDirectory([EXHIBITOR])` → false
      (`peopleDirectoryAccess.test.ts`), red against the unconditional fetch.
- [x] 2.2 Gate `UserDataInitializer` in `App.tsx` on `shouldLoadPeopleDirectory(roles)`
      (design Decision 1's sanctioned single-gate variant — every mgmt reader still
      pre-populates at login; only pure-exhibitor sessions skip). Extracted the gate
      as a pure module `services/database/users/peopleDirectoryAccess.ts`.
- [x] 2.3 Admin-path test: `shouldLoadPeopleDirectory([SITE_ADMIN|SECRETARY|CLUB_ADMIN|CHAIRMAN])` → true.
- [x] 2.4 Mixed-role test: `[EXHIBITOR, SECRETARY]` → true (management role wins).

## 3. Column allowlist

- [x] 3.1 Assertion-first test: `getAllUsers` calls `.select()` with an explicit
      column list, not `'*'` (userQueries.test.ts, red against `select('*', …)`).
- [x] 3.2 `reads.ts` `getAllUsers` now selects `PEOPLE_DIRECTORY_COLUMNS` — the
      UNION of columns BOTH mappers read (`mapDatabaseToUser` for the userStore +
      `mapDbUserToUser` for React Query; the latter also needs
      country/status/deleted_at/deleted_by — caught by typecheck). Joins
      (`user_roles`, `judge_qualifications`) preserved. Behavior-identical.
- [x] 3.3 Allowlist test green; pins the full column set incl. country/status.

## 4. Verification and rollout

- [x] 4.1 `pnpm typecheck` (26/26) + `pnpm lint` (14/14) + affected vitest
      (peopleDirectoryAccess 7, userQueries allowlist, peopleStore/quick-user
      integration 31) all green.
- [x] 4.2 No migration required (client-only change).
- [x] 4.3 `docs/security-audit-2026-07/README.md` SA-008 row → DONE.

## 5. Ship gate (final)

- [ ] 5.1 Open PR (base `main`), pass CI, and run a review pass. Because this is a
      security/data-access change (touches an RLS-adjacent fetch shape), run the
      Codex second opinion per CLAUDE.md before merging.
- [ ] 5.2 Squash-merge from the main repo dir once CI + review are green, then
      archive this change. (Merge is the gate before archive.)
