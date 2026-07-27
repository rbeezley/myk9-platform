## 1. Failing Contracts

- [x] 1.1 Add a migration contract test that fails until ciphertext storage, locked helpers, manager/all-four, judge/judge-plus-exhibitor, steward/steward-plus-exhibitor, multi-role union, exact active-entry lifecycle parity, grants, atomic replacement, and regeneration timestamp semantics are present.
- [x] 1.2 Update `ShowAccessCodesCard` tests to fail until authorized role projections reload after remount, only server-returned roles render, legacy rows explain the one-time transition, unauthorized/loading/error states reveal no code, and regenerated codes remain the active display.
- [x] 1.3 Add Show Overview/Detail tests that fail until authenticated role audiences may load codes while only managers receive regeneration controls and anonymous views remain empty.

## 2. Database Persistence and Authorization

- [x] 2.1 Add a migration with nullable encrypted passcode storage plus domain-separated encryption/decryption helpers whose execution is revoked from browser roles.
- [x] 2.2 Replace `insert_show_passcodes` and `regenerate_show_passcodes` so hashes and ciphertext are written atomically while regeneration still bumps `created_at` in place for stale-claim revocation.
- [x] 2.3 Add `get_show_access_codes` with server-derived manager/all-role, assigned-judge/judge-plus-exhibitor, active-steward/steward-plus-exhibitor, active-exhibitor/exhibitor-only, and multi-role union projections, with no anonymous grant or direct table access.
- [x] 2.4 **[ADDED]** Update deterministic demo passcode seed rows to include ciphertext through the locked helper while retaining their stable fixture values and generation timestamps.

## 3. Existing Surface Integration

- [x] 3.1 Update the shared `ShowAccessCodesCard` to retrieve authorized codes into component-local memory, display calm loading/error/legacy states, preserve copy/print/regeneration behavior, and avoid persistent client caching.
- [x] 3.2 Pass authenticated audience context through `ShowDetailTabs` and `ShowOverviewTab`; let the server project manager, judge, steward, exhibitor, and multi-role code sets while keeping anonymous views empty.
- [x] 3.3 Opt the existing Show Settings and Show Desk card placements into manager retrieval without adding another page, card, dialog, or navigation item.

## 4. Verification

- [x] 4.1 Run the focused migration-contract, access-card, Show Overview, Show Detail tabs, show creation success, and Show Desk tools tests.
- [x] 4.2 **[ADDED]** Add and run a rolled-back SQL authorization test covering manager/all-four, assigned judge/judge-plus-exhibitor, active steward/steward-plus-exhibitor, multi-role unions, active handler/owner/co-owner/exhibitor-only, inactive/anonymous/no-relationship denial, legacy rows, decrypt round-trip, and regeneration atomicity.
- [x] 4.3 Run full monorepo TypeScript checking, lint, and build because the change crosses database credentials, authorization, and shared show-detail UI; fix all introduced failures and identify unrelated failures separately.
- [x] 4.4 Run `pnpm openspec validate persist-and-display-show-access-codes --type change --strict --no-interactive`, `git diff --check`, inspect the final diff for unrelated changes or plaintext logging/persistence, and record verification evidence in this change.

## 5. Delivery Gates

- [x] 5.1 Run the required security/database second-opinion review, resolve blocking findings, and commit the verified feature branch.
- [ ] 5.2 With explicit shared-system approval, push the branch and open a PR using the repository template; include risks, migration order, legacy-show transition, agent involvement, and test evidence.
- [ ] 5.3 Monitor CI and review through merge, then request separate approval before any linked Supabase database push; do not mark deployment evidence complete from source-only verification.
- [ ] 5.4 After merge and required evidence, update any linked tracking issue/doc, archive the OpenSpec change, sync `main`, prune and delete the branch, and remove the worktree last.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The change adds encrypted credential storage, a new `SECURITY DEFINER` authorization boundary, a database migration, and role-dependent UI behavior across shared show-detail surfaces.

## Verification Evidence

- Focused Vitest verification passed: 7 files, 77 tests.
- The broad myK9Show unit suite was stopped at the repository's 60-second hang
  limit; it reported no failures before interruption.
- The migration applied cleanly to an isolated PostgreSQL 18 database, and the
  rolled-back SQL test passed manager, judge, steward, multi-role, exhibitor,
  inactive/expired/withdrawn/unrelated/anonymous denial, legacy, direct-access,
  crypto round-trip, and atomic-regeneration checks.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, targeted changed-file ESLint,
  strict OpenSpec validation, and `git diff --check` passed.
- Linked Supabase migration dry-run passed and identified only
  `20260727160000_recoverable_show_access_codes.sql`; no remote database write
  was performed.
- Diff security review is recorded in
  `docs/security-review-2026-07-27-codex-recoverable-show-access-codes.md`.
  The review removed passcode-bearing copy notifications; no unresolved
  security findings remain.
